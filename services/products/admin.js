/**
 * Vayu admin — the things you publish: products, categories, press, events.
 *
 * Each export is a route handler taking the request context; the shape of
 * the URL is declared through http.resource() so the find/404/405 ladder
 * lives in one place rather than three.
 *
 * A product spans seven tables (itself, categories, gallery, variants, tags,
 * options and option values), so every write here goes through
 * `writeProduct`, which replaces the child rows in one batch. Editing a
 * product is therefore atomic: either the new gallery, variants and options
 * are all in, or none of them are.
 */

import { json, ok, badRequest, methodNotAllowed, resource } from '#shared/utils/http.js';
import {
  decodeList, decodeBool, decodeCategories, decodeSpecs, decodeOptions, decodeVariants,
} from '#shared/utils/product-csv.js';
import { now } from '#shared/database/store.js';
import {
  loadProducts, loadProduct, loadCategories, totalStock, fireStockAlerts, sweepScheduled,
  loadShippingPresets, SPEC_SECTIONS,
} from './catalogue.js';
import { pressRow, eventRow, artistRow } from './storefront.js';
import { slugFor } from '#shared/utils/slug.js';

const PRODUCT_STATUSES = ['active', 'draft', 'archived'];
const PLACEHOLDER_IMG = '/assets/images/cat_objects.png';

/* ================= products ================= */

/**
 * Merge a request body over an existing product (or over nothing, for a
 * new one), coercing every field. Anything absent from the body keeps its
 * current value, so a partial edit never blanks a field by omission.
 */
function sanitizeProduct(body, existing, knownCategories) {
  const p = existing || {};
  const cats = Array.isArray(body.categories)
    ? body.categories
      .filter(c => c && c.cat && knownCategories.has(c.cat))
      .map(c => ({ cat: String(c.cat), sub: String(c.sub || '') }))
    : p.categories;

  return {
    name: String(body.name ?? p.name ?? '').trim(),
    description: String(body.description ?? p.description ?? ''),
    care: String(body.care ?? p.care ?? '').slice(0, 2000),
    // '' is a real choice — it means "use the shop's default profile" — so
    // this is `!== undefined` rather than a truthiness test, or clearing the
    // selection would silently keep the old one.
    shippingPreset: body.shippingPreset === undefined
      ? String(p.shippingPreset ?? '') : String(body.shippingPreset ?? '').slice(0, 64),
    dimensions: body.dimensions === undefined ? (p.dimensions || []) : sanitizeSpecs(body.dimensions),
    materials: body.materials === undefined ? (p.materials || []) : sanitizeSpecs(body.materials),
    price: Math.max(0, Number(body.price ?? p.price) || 0),
    compareAt: body.compareAt != null && body.compareAt !== ''
      ? Math.max(0, Number(body.compareAt) || 0) : null,
    sku: String(body.sku ?? p.sku ?? ''),
    stock: Math.max(0, Math.round(Number(body.stock ?? p.stock) || 0)),
    status: PRODUCT_STATUSES.includes(body.status) ? body.status : (p.status || 'draft'),
    isNew: body.isNew != null ? !!body.isNew : !!p.isNew,
    img: String(body.img ?? p.img ?? ''),
    gallery: Array.isArray(body.gallery) && body.gallery.length
      ? body.gallery.map(String) : (p.gallery || []),
    categories: cats && cats.length ? cats : [],
    tags: Array.isArray(body.tags) ? body.tags.map(String) : (p.tags || []),
    options: Array.isArray(body.options) ? sanitizeOptions(body.options) : (p.options || []),
    variants: Array.isArray(body.variants)
      ? body.variants
        .filter(v => v && String(v.label || '').trim())
        .map(v => ({
          label: String(v.label).trim().slice(0, 120),
          price: v.price !== '' && v.price != null ? Math.max(0, Number(v.price) || 0) : null,
          stock: Math.max(0, Math.round(Number(v.stock) || 0)),
          combo: String(v.combo || '').slice(0, 400),
          image: String(v.image || '').slice(0, 400),
        }))
      : (p.variants || []),
    publishAt: body.publishAt !== undefined
      ? (body.publishAt ? new Date(body.publishAt).toISOString() : null)
      : (p.publishAt || null),

    // SEO. `slug` is only ever a *request* here — writeProduct resolves it
    // against what is already on the row and what other products hold, so a
    // rename cannot silently move a ranked URL. See lib/server/slug.js.
    slug: body.slug !== undefined ? String(body.slug ?? '') : '',
    metaTitle: body.metaTitle !== undefined
      ? String(body.metaTitle ?? '').slice(0, 70) : String(p.metaTitle ?? ''),
    metaDescription: body.metaDescription !== undefined
      ? String(body.metaDescription ?? '').slice(0, 160) : String(p.metaDescription ?? ''),
  };
}

/**
 * Coerce a list of label/value rows for one accordion section.
 *
 * A row with no label is dropped rather than stored blank — it would render
 * as an empty column on the product page. Labels are deduplicated because
 * (product_id, section, label) is the primary key: two "Length" rows would
 * not merely look odd, they would abort the save batch on a constraint.
 */
export function sanitizeSpecs(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();

  return list
    .map(s => {
      const label = String(s?.label || '').trim().slice(0, 60);
      if (!label || seen.has(label.toLowerCase())) return null;
      seen.add(label.toLowerCase());
      return { label, value: String(s.value || '').trim().slice(0, 200) };
    })
    .filter(Boolean)
    .slice(0, 20);
}

/**
 * Coerce the panel's option groups, dropping anything that cannot be chosen.
 *
 * Two rules are enforced here rather than trusted from the panel, because
 * both of them break the combo key if they slip through: an option name may
 * not contain the `=` or `|` the key is built from, and neither an option
 * name nor a value label may repeat inside its parent.
 */
function sanitizeOptions(list) {
  const seenOption = new Set();

  return list
    .map(o => {
      const name = String(o?.name || '').trim().replaceAll(/[=|]/g, ' ').slice(0, 40);
      if (!name || seenOption.has(name.toLowerCase())) return null;
      seenOption.add(name.toLowerCase());

      const seenValue = new Set();
      const values = (Array.isArray(o.values) ? o.values : [])
        .map(v => {
          const label = String(v?.label || '').trim().replaceAll(/[=|]/g, ' ').slice(0, 60);
          if (!label || seenValue.has(label.toLowerCase())) return null;
          seenValue.add(label.toLowerCase());
          return {
            label,
            swatch: String(v.swatch || '').trim().slice(0, 400),
            heading: String(v.heading || '').trim().slice(0, 40),
          };
        })
        .filter(Boolean);

      return values.length
        ? { name, kind: o.kind === 'swatch' ? 'swatch' : 'text', values }
        : null;
    })
    .filter(Boolean);
}

/** Both create and update refuse the same three things. */
function productProblem(data) {
  if (!data.name) return 'Name is required';
  if (!data.categories.length) return 'Pick at least one category';
  // Options with no priced/stocked combination behind them would render a
  // picker where every choice is unbuyable, which reads as a broken page
  // rather than as a sold-out one.
  if (data.options.length && !data.variants.length) {
    return 'Options need at least one combination with stock — open the combinations grid';
  }
  return null;
}

const knownCategorySlugs = async (store) =>
  new Set((await store.all('SELECT slug FROM categories')).map(c => c.slug));

/**
 * Write a product and replace all of its child rows, in one batch. Used by
 * create, update and duplicate, so the five tables can never drift apart.
 */
async function writeProduct(store, id, data, { created = false } = {}) {
  const stamp = now();
  const gallery = data.gallery.length ? data.gallery : (data.img ? [data.img] : []);

  // Resolved before the batch because it is a query, and a batch takes bound
  // statements rather than promises. An existing row keeps the slug it already
  // has unless the panel explicitly sent a new one — renaming a product must
  // not move its URL out from under the links pointing at it.
  const existing = created
    ? null
    : await store.value('SELECT slug FROM products WHERE id = ?', id);
  // Coerced here rather than trusted from the caller. sanitizeProduct()
  // always supplies these, but writeProduct is also called with hand-built
  // objects — the CSV importer builds one field by field — and D1 rejects a
  // bound `undefined` outright with D1_TYPE_ERROR, taking the whole import
  // down. Defaulting at the binding boundary fixes every such caller at once.
  const metaTitle = data.metaTitle ?? '';
  const metaDescription = data.metaDescription ?? '';

  const slug = await slugFor(store, {
    requested: data.slug, existing, name: data.name, id,
  });

  const statements = [
    created
      // A new product is unshifted to the front of the shop — MIN - 1, not
      // MAX + 1. Everything reading the catalogue sorts `ORDER BY sort_order,
      // rowid` ascending, so the old MAX + 1 buried each new piece at the
      // bottom of its category, behind everything ever added. This is the
      // same "unshift" a new press entry gets (see press create).
      // Use the Move to top / Move to bottom bulk actions to override it.
      ? store.stmt(
        `INSERT INTO products
          (id, name, description, price, compare_at, sku, stock, status, is_new, img,
           publish_at, care, shipping_preset, slug, meta_title, meta_description,
           views, sold, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0,
                 (SELECT COALESCE(MIN(sort_order), 0) - 1 FROM products), ?, ?)`,
        id, data.name, data.description, data.price, data.compareAt, data.sku,
        data.stock, data.status, data.isNew ? 1 : 0, data.img, data.publishAt,
        data.care, data.shippingPreset || null, slug, metaTitle, metaDescription,
        stamp, stamp,
      )
      : store.stmt(
        `UPDATE products SET name = ?, description = ?, price = ?, compare_at = ?, sku = ?,
                stock = ?, status = ?, is_new = ?, img = ?, publish_at = ?,
                care = ?, shipping_preset = ?, slug = ?, meta_title = ?,
                meta_description = ?, updated_at = ?
          WHERE id = ?`,
        data.name, data.description, data.price, data.compareAt, data.sku,
        data.stock, data.status, data.isNew ? 1 : 0, data.img, data.publishAt,
        data.care, data.shippingPreset || null, slug, metaTitle,
        metaDescription, stamp, id,
      ),
    store.stmt('DELETE FROM product_categories WHERE product_id = ?', id),
    store.stmt('DELETE FROM product_specs WHERE product_id = ?', id),
    store.stmt('DELETE FROM product_gallery WHERE product_id = ?', id),
    store.stmt('DELETE FROM product_variants WHERE product_id = ?', id),
    store.stmt('DELETE FROM product_tags WHERE product_id = ?', id),
    // Values go with their option through ON DELETE CASCADE, but the batch
    // states it anyway: D1 honours foreign keys per-connection, and a
    // cascade that silently stopped working would leave orphan values that
    // the next save would collide with on the UNIQUE (option_id, label).
    store.stmt(
      `DELETE FROM product_option_values
        WHERE option_id IN (SELECT id FROM product_options WHERE product_id = ?)`, id),
    store.stmt('DELETE FROM product_options WHERE product_id = ?', id),
  ];

  data.categories.forEach(c => statements.push(store.stmt(
    'INSERT INTO product_categories (product_id, category_slug, sub) VALUES (?, ?, ?)', id, c.cat, c.sub)));
  gallery.forEach((url, i) => statements.push(store.stmt(
    'INSERT INTO product_gallery (product_id, url, sort_order) VALUES (?, ?, ?)', id, url, i)));
  data.tags.forEach(tag => statements.push(store.stmt(
    'INSERT INTO product_tags (product_id, tag) VALUES (?, ?)', id, tag)));

  for (const section of SPEC_SECTIONS) {
    (data[section] || []).forEach((s, i) => statements.push(store.stmt(
      'INSERT INTO product_specs (product_id, section, label, value, sort_order) VALUES (?, ?, ?, ?, ?)',
      id, section, s.label, s.value, i)));
  }

  // Ids are minted here rather than inside the loops, because nextId is a
  // query and a batch must be fully built before it is sent.
  const variantIds = [];
  for (let i = 0; i < data.variants.length; i++) variantIds.push(await store.nextId('var'));
  data.variants.forEach((v, i) => statements.push(store.stmt(
    `INSERT INTO product_variants (id, product_id, label, price, stock, sort_order, combo, image)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    variantIds[i], id, v.label, v.price, v.stock, i, v.combo || '', v.image || '')));

  for (const [i, o] of (data.options || []).entries()) {
    const optionId = await store.nextId('opt');
    statements.push(store.stmt(
      'INSERT INTO product_options (id, product_id, name, kind, sort_order) VALUES (?, ?, ?, ?, ?)',
      optionId, id, o.name, o.kind, i));
    for (const [j, v] of o.values.entries()) {
      statements.push(store.stmt(
        `INSERT INTO product_option_values (id, option_id, label, swatch, heading, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        await store.nextId('optv'), optionId, v.label, v.swatch, v.heading, j));
    }
  }

  await store.batch(statements);
  return loadProduct(store, id);
}

/* Minimal CSV reader (quoted cells, embedded commas, CRLF) for import. */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', inQuotes = false;
  const src = String(text);

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(c => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(c => c !== '')) rows.push(row);
  return rows;
}

/* ---- bulk actions ---- */

const BULK = {
  async status(store, targets, body) {
    if (!PRODUCT_STATUSES.includes(body.status)) return 'Bad status';
    await store.batch(targets.map(p => store.stmt(
      'UPDATE products SET status = ?, updated_at = ? WHERE id = ?', body.status, now(), p.id)));
    return null;
  },

  async delete(store, targets) {
    // The child tables cascade, so the product row is the only delete.
    await store.batch(targets.map(p => store.stmt('DELETE FROM products WHERE id = ?', p.id)));
    return null;
  },

  async 'price-adjust'(store, targets, body) {
    const pct = Number(body.percent) || 0;
    await store.batch(targets.map(p => store.stmt(
      'UPDATE products SET price = MAX(0, ROUND(price * ?)), updated_at = ? WHERE id = ?',
      1 + pct / 100, now(), p.id)));
    return null;
  },

  async 'add-category'(store, targets, body) {
    const known = await knownCategorySlugs(store);
    if (!known.has(body.cat)) return 'Unknown category';
    await store.batch(targets
      .filter(p => !p.categories.some(c => c.cat === body.cat))
      .map(p => store.stmt(
        `INSERT INTO product_categories (product_id, category_slug, sub) VALUES (?, ?, ?)
         ON CONFLICT DO NOTHING`, p.id, body.cat, String(body.sub || ''))));
    return null;
  },

  /**
   * Put the selection in front of / behind every other product.
   *
   * `targets` arrives in the catalogue's own order (loadProducts sorts by
   * sort_order), so writing consecutive values keeps the selection's
   * relative order intact rather than scrambling it.
   *
   * sort_order is free to go negative — nothing reads it as a rank, only as
   * something to sort by — so neither action has to renumber the whole
   * table to make room.
   */
  async 'move-top'(store, targets) {
    const top = await store.value('SELECT COALESCE(MIN(sort_order), 0) FROM products');
    await store.batch(targets.map((p, i) => store.stmt(
      'UPDATE products SET sort_order = ?, updated_at = ? WHERE id = ?',
      top - targets.length + i, now(), p.id)));
    return null;
  },

  async 'move-bottom'(store, targets) {
    const bottom = await store.value('SELECT COALESCE(MAX(sort_order), 0) FROM products');
    await store.batch(targets.map((p, i) => store.stmt(
      'UPDATE products SET sort_order = ?, updated_at = ? WHERE id = ?',
      bottom + 1 + i, now(), p.id)));
    return null;
  },

  async 'stock-set'(store, targets, body, admin) {
    const stock = Math.max(0, Math.round(Number(body.stock) || 0));
    for (const p of targets) {
      await store.logInventory(p.id, p.name, stock - totalStock(p), 'bulk set', admin.name);
      await store.batch([
        store.stmt('UPDATE products SET stock = ?, updated_at = ? WHERE id = ?', stock, now(), p.id),
        ...(p.variants.length
          ? [store.stmt('UPDATE product_variants SET stock = ? WHERE product_id = ?', stock, p.id)]
          : []),
      ]);
      await fireStockAlerts(store, await loadProduct(store, p.id));
    }
    return null;
  },
};

async function bulkProducts({ store, method, admin, body }) {
  if (method !== 'POST') return methodNotAllowed();

  const ids = Array.isArray(body.ids) ? body.ids : [];
  if (!ids.length) return badRequest('No products selected');

  const all = await loadProducts(store);
  const targets = all.filter(p => ids.includes(p.id));
  if (!targets.length) return badRequest('No products selected');

  const run = BULK[String(body.action || '')];
  if (!run) return badRequest('Unknown bulk action');

  const problem = await run(store, targets, body, admin);
  if (problem) return badRequest(problem);

  await store.logActivity(admin.name, 'product.bulk',
    `Bulk ${body.action} on ${targets.length} product(s)`);
  return json(200, { ok: true, affected: targets.length });
}

/* ---- CSV import ---- */

/** "furniture:seating|decor" → [{cat:'furniture',sub:'seating'},{cat:'decor',sub:''}] */
function parseCategoryCell(cell, known) {
  if (!cell) return [];
  return cell.split('|').map(c => {
    const [cat, sub] = c.split(':');
    return known.has(cat) ? { cat, sub: sub || '' } : null;
  }).filter(Boolean);
}

async function importProducts({ store, method, admin, body }) {
  if (method !== 'POST') return methodNotAllowed();

  const rows = parseCsv(body.csv || '');
  if (rows.length < 2) return badRequest('CSV needs a header row and at least one product');

  const head = rows[0].map(h => h.trim().toLowerCase());
  if (!head.includes('name') || !head.includes('price')) {
    return badRequest('CSV must have "name" and "price" columns');
  }

  const known = await knownCategorySlugs(store);
  let created = 0, updated = 0;

  for (const r of rows.slice(1)) {
    const get = (col) => {
      const i = head.indexOf(col);
      return i === -1 ? '' : (r[i] || '').trim();
    };
    const name = get('name');
    if (!name) continue;

    const cats = parseCategoryCell(get('categories'), known);
    const existingRow = get('id')
      ? await store.row('products', 'id', get('id'))
      : await store.one('SELECT * FROM products WHERE name = ?', name);
    const existing = existingRow ? await loadProduct(store, existingRow.id) : null;

    /**
     * A column is only applied when the file actually has it.
     *
     * `has()` asks whether the header carried the column at all, which is
     * what separates "set this to empty" from "this file does not mention
     * it". Without that distinction a three-column price list would wipe the
     * description, the tags and every option off each product it touched.
     */
    const has = (col) => head.includes(col);
    const fallback = (col, current) => (has(col) ? get(col) : current);

    const gallery = has('gallery') ? decodeList(get('gallery')) : null;
    const firstImage = get('img') || (gallery && gallery[0]) || '';

    /** The fields shared by the create and update paths. */
    const fields = (current = {}) => ({
      name,
      description: fallback('description', current.description ?? ''),
      price: has('price') ? (Number(get('price')) || 0) : (current.price ?? 0),
      compareAt: has('compareat')
        ? (get('compareat') === '' ? null : Number(get('compareat')) || null)
        : (current.compareAt ?? null),
      sku: fallback('sku', current.sku ?? ''),
      stock: has('stock') ? Math.max(0, Number(get('stock')) || 0) : (current.stock ?? 0),
      status: PRODUCT_STATUSES.includes(get('status'))
        ? get('status')
        : (current.status ?? 'draft'),
      isNew: has('isnew') ? decodeBool(get('isnew')) : !!current.isNew,
      img: firstImage || current.img || PLACEHOLDER_IMG,
      gallery: gallery && gallery.length
        ? gallery
        : (current.gallery?.length ? current.gallery : [firstImage || current.img || PLACEHOLDER_IMG]),
      categories: cats.length ? cats : (current.categories ?? []),
      tags: has('tags') ? decodeList(get('tags')) : (current.tags ?? []),
      care: fallback('care', current.care ?? ''),
      shippingPreset: fallback('shippingpreset', current.shippingPreset ?? ''),
      dimensions: has('dimensions') ? decodeSpecs(get('dimensions')) : (current.dimensions ?? []),
      materials: has('materials') ? decodeSpecs(get('materials')) : (current.materials ?? []),
      options: has('options') ? decodeOptions(get('options')) : (current.options ?? []),
      variants: has('variants') ? decodeVariants(get('variants')) : (current.variants ?? []),
      slug: fallback('slug', current.slug ?? ''),
      metaTitle: fallback('metatitle', current.metaTitle ?? ''),
      metaDescription: fallback('metadescription', current.metaDescription ?? ''),
      publishAt: has('publishat') ? (get('publishat') || null) : (current.publishAt ?? null),
    });

    if (existing) {
      const next = fields(existing);
      // Stock moves are logged the way every other stock change is, so the
      // inventory history explains an import the same as a hand edit.
      if (has('stock') && next.stock !== totalStock(existing)) {
        await store.logInventory(existing.id, existing.name,
          next.stock - totalStock(existing), 'csv import', admin.name);
      }
      // writeProduct rewrites the child tables too, which is what lets an
      // import carry options, variants and the detail rows rather than only
      // the columns on `products`.
      await writeProduct(store, existing.id, next, { created: false });
      if (has('stock')) await fireStockAlerts(store, await loadProduct(store, existing.id));
      updated++;
      continue;
    }

    if (!cats.length) continue; // a new product needs at least one valid category
    await writeProduct(store, await store.nextId('prod'), fields(), { created: true });
    created++;
  }

  await store.logActivity(admin.name, 'product.import',
    `CSV import: ${created} created, ${updated} updated`);
  return json(200, { ok: true, created, updated });
}

/* ---- product routes ---- */

export function products(ctx) {
  const { store } = ctx;
  return resource(ctx, {
    notFound: 'Product not found',
    find: (id) => loadProduct(store, id),
    collectionActions: { bulk: bulkProducts, import: importProducts },

    async list() {
      await sweepScheduled(store);
      // The shipping profiles ride along with the listing rather than sitting
      // behind a second request: the product editor needs them to draw its
      // dropdown, and it opens from this screen.
      const [products, settings, shippingPresets] = await Promise.all([
        loadProducts(store), store.settings(), loadShippingPresets(store),
      ]);
      return json(200, { products, settings, shippingPresets });
    },

    async create({ admin, body }) {
      const data = sanitizeProduct(body, null, await knownCategorySlugs(store));
      const problem = productProblem(data);
      if (problem) return badRequest(problem);

      const product = await writeProduct(store, await store.nextId('prod'), data, { created: true });
      await store.logActivity(admin.name, 'product.create', `Created "${product.name}"`);
      return json(201, { product });
    },

    async update({ admin, body }, existing) {
      const data = sanitizeProduct(body, existing, await knownCategorySlugs(store));
      const problem = productProblem(data);
      if (problem) return badRequest(problem);

      const before = totalStock(existing);
      const product = await writeProduct(store, existing.id, data);

      const delta = totalStock(product) - before;
      if (delta) {
        await store.logInventory(product.id, product.name, delta, 'manual edit', admin.name);
        if (before <= 0) await fireStockAlerts(store, product);
      }
      await store.logActivity(admin.name, 'product.update', `Updated "${product.name}"`);
      return json(200, { product });
    },

    async remove({ admin }, product) {
      await store.remove('products', 'id', product.id);
      await store.logActivity(admin.name, 'product.delete', `Deleted "${product.name}"`);
      return ok();
    },

    actions: {
      async duplicate({ method, admin }, product) {
        if (method !== 'POST') return methodNotAllowed();
        const copy = await writeProduct(store, await store.nextId('prod'), {
          ...product,
          name: product.name + ' (copy)',
          status: 'draft',
        }, { created: true });
        await store.logActivity(admin.name, 'product.duplicate', `Duplicated "${product.name}"`);
        return json(201, { product: copy });
      },
    },
  });
}

/* ================= shipping & returns profiles ================= */

/**
 * The saved Shipping & Returns copy, shared by every product that points at
 * it. The shop starts with three (see migration 0005) and can add more.
 *
 * The first profile by sort order is the shop default: it is what a product
 * shows when it has never chosen one, which is every product that existed
 * before this feature. That is why the last profile cannot be deleted.
 */
export function shippingPresets(ctx) {
  const { store } = ctx;

  const clean = (body, existing = {}) => ({
    name: String(body.name ?? existing.name ?? '').trim().slice(0, 60),
    body: String(body.body ?? existing.body ?? '').trim().slice(0, 2000),
  });

  return resource(ctx, {
    notFound: 'Shipping profile not found',
    find: (id) => store.row('shipping_presets', 'id', id),

    async list() {
      return json(200, { shippingPresets: await loadShippingPresets(store) });
    },

    async create({ admin, body }) {
      const data = clean(body);
      if (!data.name) return badRequest('A profile needs a name');
      if (!data.body) return badRequest('A profile needs some text');

      const id = await store.nextId('ship');
      const count = await store.value('SELECT COUNT(*) FROM shipping_presets');
      await store.run(
        'INSERT INTO shipping_presets (id, name, body, sort_order) VALUES (?, ?, ?, ?)',
        id, data.name, data.body, count,
      );
      await store.logActivity(admin.name, 'shipping.create', `Added shipping profile "${data.name}"`);
      return json(201, { preset: await store.row('shipping_presets', 'id', id) });
    },

    async update({ admin, body }, preset) {
      const data = clean(body, preset);
      if (!data.name) return badRequest('A profile needs a name');
      if (!data.body) return badRequest('A profile needs some text');

      await store.update('shipping_presets', 'id', preset.id, data);
      await store.logActivity(admin.name, 'shipping.update', `Updated shipping profile "${data.name}"`);
      return json(200, { preset: await store.row('shipping_presets', 'id', preset.id) });
    },

    async remove({ admin }, preset) {
      const inUse = await store.value(
        'SELECT COUNT(*) FROM products WHERE shipping_preset = ?', preset.id);
      if (inUse) {
        return json(409, {
          error: `${inUse} product(s) still use "${preset.name}". Point them at another profile first.`,
        });
      }
      // Removing the last one would leave every product with nothing to fall
      // back to, and the section would vanish from the whole storefront at
      // once — a surprising amount of damage for one ✕.
      const total = await store.value('SELECT COUNT(*) FROM shipping_presets');
      if (total <= 1) return badRequest('The last shipping profile cannot be deleted');

      await store.remove('shipping_presets', 'id', preset.id);
      await store.logActivity(admin.name, 'shipping.delete', `Deleted shipping profile "${preset.name}"`);
      return ok();
    },
  });
}

/* ================= categories ================= */

const toSubs = (subs) => (Array.isArray(subs) ? subs : [])
  .map(s => ({ label: String(s.label), thumb: String(s.thumb || '') }));

const subStatements = (store, slug, subs) => [
  store.stmt('DELETE FROM category_subs WHERE category_slug = ?', slug),
  ...subs.map((s, i) => store.stmt(
    'INSERT INTO category_subs (category_slug, label, thumb, sort_order) VALUES (?, ?, ?, ?)',
    slug, s.label, s.thumb, i)),
];

export function categories(ctx) {
  const { store } = ctx;
  return resource(ctx, {
    notFound: 'Category not found',
    // Categories are keyed by slug rather than by a minted id.
    find: (slug) => store.row('categories', 'slug', slug),

    async list() {
      const [cats, counts] = await Promise.all([
        loadCategories(store),
        store.all('SELECT category_slug, COUNT(DISTINCT product_id) AS n FROM product_categories GROUP BY category_slug'),
      ]);
      // The panel expects an object keyed by slug, as the JSON store had it.
      const bySlug = {};
      for (const c of cats) {
        bySlug[c.slug] = { title: c.title, curated: c.curated, banner: c.banner, subs: c.subs, order: c.order };
      }
      return json(200, {
        categories: bySlug,
        counts: Object.fromEntries(counts.map(c => [c.category_slug, c.n])),
      });
    },

    async create({ admin, body }) {
      const slug = String(body.slug || '').toLowerCase().trim().replaceAll(/[^a-z0-9-]/g, '-');
      if (!slug || !body.title) return badRequest('Slug and title are required');
      if (await store.row('categories', 'slug', slug)) return json(409, { error: 'Category already exists' });

      const count = await store.value('SELECT COUNT(*) FROM categories');
      await store.batch([
        store.stmt(
          'INSERT INTO categories (slug, title, curated, banner, sort_order) VALUES (?, ?, ?, ?, ?)',
          slug, String(body.title), String(body.curated || PLACEHOLDER_IMG),
          String(body.banner || PLACEHOLDER_IMG), count,
        ),
        ...subStatements(store, slug, toSubs(body.subs)),
      ]);
      await store.logActivity(admin.name, 'category.create', `Created category "${body.title}"`);
      return json(201, { ok: true });
    },

    async update({ admin, body }, cat) {
      const patch = {
        title: String(body.title ?? cat.title),
        curated: String(body.curated ?? cat.curated),
        banner: String(body.banner ?? cat.banner),
      };
      if (body.order != null) patch.sort_order = Number(body.order);
      await store.update('categories', 'slug', cat.slug, patch);
      if (Array.isArray(body.subs)) await store.batch(subStatements(store, cat.slug, toSubs(body.subs)));

      await store.logActivity(admin.name, 'category.update', `Updated category "${patch.title}"`);
      return ok();
    },

    async remove({ admin }, cat) {
      const inUse = await store.value(
        'SELECT COUNT(DISTINCT product_id) FROM product_categories WHERE category_slug = ?', cat.slug);
      if (inUse) {
        return json(409, { error: `${inUse} product(s) still use this category. Reassign them first.` });
      }
      await store.remove('categories', 'slug', cat.slug);
      await store.logActivity(admin.name, 'category.delete', `Deleted category "${cat.title}"`);
      return ok();
    },
  });
}

/* ================= press ================= */

/**
 * Merge a request body over an existing entry, coercing every field.
 *
 * Two rules are enforced here rather than trusted to the editor. An entry is
 * only `verified` if a headline was actually filled in — the flag means "read
 * at source", and a piece with no headline plainly was not. And `quote` is
 * dropped unless the entry is verified, because the press page renders it
 * inside quotation marks: an unchecked quotation is the one thing this
 * feature must not publish.
 */
function sanitizePress(body, existing) {
  const p = existing || {};
  const str = (key, fallback = '') => String(body[key] ?? p[key] ?? fallback).trim();

  const headline = str('headline');
  const verified = (body.verified != null ? !!body.verified : !!p.verified) && !!headline;

  return {
    featured: body.featured != null ? !!body.featured : !!p.featured,
    verified,
    source: str('source'),
    headline,
    byline: verified ? str('byline') : '',
    date: verified ? str('date') : '',
    quote: verified ? String(body.quote ?? p.quote ?? '').trim() : '',
    quote_attribution: verified ? str('quoteAttribution') : '',
    snippet: String(body.snippet ?? p.snippet ?? '').trim(),
    image: str('image'),
    alt: str('alt') || (str('source') && `${str('source')} coverage of Vayu`),
    url: str('url'),
  };
}

export function press(ctx) {
  const { store } = ctx;

  /** At most one entry is featured; it gets the large block on the page. */
  const clearFeatured = () => store.run('UPDATE press SET featured = 0');

  return resource(ctx, {
    notFound: 'Press entry not found',
    find: (id) => store.row('press', 'id', id),

    async list() {
      const rows = await store.all('SELECT * FROM press ORDER BY sort_order, rowid');
      return json(200, { press: rows.map(pressRow) });
    },

    async create({ admin, body }) {
      // The slug is built from the publication and the headline, so two
      // pieces in the same magazine do not collide on the source alone.
      const id = String(body.id || `${body.source || ''} ${body.headline || ''}`)
        .toLowerCase().trim()
        .replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/(^-|-$)/g, '').slice(0, 80);
      if (!id || !body.source) return badRequest('A publication is required');
      if (!body.url) return badRequest('A link to the article is required');
      if (await store.row('press', 'id', id)) {
        return json(409, { error: 'This piece is already listed' });
      }

      const data = sanitizePress(body, null);
      if (data.featured) await clearFeatured();

      // Newest first, like the journal listing before it: coverage is read
      // in reverse order of publication.
      const lowest = await store.value('SELECT COALESCE(MIN(sort_order), 0) FROM press');
      await store.upsert('press', {
        id, ...data,
        featured: data.featured ? 1 : 0,
        verified: data.verified ? 1 : 0,
        sort_order: lowest - 1,
      }, ['id']);

      await store.logActivity(admin.name, 'press.create', `Listed "${data.source}"`);
      return json(201, { entry: pressRow(await store.row('press', 'id', id)) });
    },

    async update({ admin, body }, entry) {
      const data = sanitizePress(body, pressRow(entry));
      if (data.featured && !entry.featured) await clearFeatured();
      await store.update('press', 'id', entry.id, {
        ...data,
        featured: data.featured ? 1 : 0,
        verified: data.verified ? 1 : 0,
      });

      await store.logActivity(admin.name, 'press.update', `Updated "${data.source}"`);
      return json(200, { entry: pressRow(await store.row('press', 'id', entry.id)) });
    },

    async remove({ admin }, entry) {
      await store.remove('press', 'id', entry.id);
      await store.logActivity(admin.name, 'press.delete', `Removed "${entry.source}"`);
      return ok();
    },
  });
}
/* ================= events ================= */

const VENUE_IDS = ['gallery-vayu', 'design-for-living'];

/**
 * Merge a request body over an existing show, coercing every field.
 *
 * The two list fields are the reason this is not a straight assignment.
 * `images` are the plates as they hang, and `curated` names products rather
 * than indexing them — an index written down here points at a different
 * piece the moment a category is reordered, which is the bug the static
 * events.js already had a paragraph of comment about.
 */
function sanitizeEvent(body, existing) {
  const e = existing || {};
  const str = (key, fallback = '') => String(body[key] ?? e[key] ?? fallback).trim();

  const images = Array.isArray(body.images)
    ? body.images.slice(0, 40).map(i => ({
      img: String(i.img || '').slice(0, 400),
      alt: String(i.alt || '').slice(0, 300),
      name: String(i.name || '').slice(0, 120),
      tag: String(i.tag || '').slice(0, 60),
    })).filter(i => i.img)
    : (e.images || []);

  const curated = Array.isArray(body.curated)
    ? body.curated.slice(0, 24).map(c => ({
      cat: String(c.cat || '').slice(0, 40),
      name: String(c.name || '').slice(0, 200),
    })).filter(c => c.cat && c.name)
    : (e.curated || []);

  return {
    venue: VENUE_IDS.includes(body.venue) ? body.venue : (e.venue || VENUE_IDS[0]),
    title: str('title'),
    dates: str('dates'),
    note: str('note'),
    statement: String(body.statement ?? e.statement ?? '').trim(),
    image: str('image'),
    image_mobile: str('imageMobile'),
    alt: str('alt') || str('title'),
    cta: str('cta') || 'See the show',
    sec_note: String(body.secNote ?? e.secNote ?? '').trim(),
    closing: String(body.closing ?? e.closing ?? '').trim(),
    images: JSON.stringify(images),
    curated: JSON.stringify(curated),
    current: body.current != null ? !!body.current : !!e.current,
    updated_at: now(),
  };
}

export function events(ctx) {
  const { store } = ctx;

  /**
   * One current show per venue, not one across the site: the two houses run
   * their own programmes, and marking the gallery's new exhibition current
   * must not retire the store's season.
   */
  const clearCurrent = (venue) =>
    store.run('UPDATE events SET current = 0 WHERE venue = ?', venue);

  return resource(ctx, {
    notFound: 'Event not found',
    find: (id) => store.row('events', 'id', id),

    async list() {
      const rows = await store.all(
        'SELECT * FROM events ORDER BY venue, current DESC, sort_order, rowid');
      return json(200, { events: rows.map(eventRow) });
    },

    async create({ admin, body }) {
      const id = String(body.id || body.title || '').toLowerCase().trim()
        .replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/(^-|-$)/g, '').slice(0, 80);
      if (!id || !body.title) return badRequest('A title is required');
      if (await store.row('events', 'id', id)) {
        return json(409, { error: 'A show with this name already exists' });
      }

      const data = sanitizeEvent(body, null);
      if (data.current) await clearCurrent(data.venue);

      // Newest first within a venue, like every other listing here: a new
      // show goes to the top of its house's past list once it is retired.
      const lowest = await store.value(
        'SELECT COALESCE(MIN(sort_order), 0) FROM events WHERE venue = ?', data.venue);
      await store.upsert('events', {
        id, ...data, current: data.current ? 1 : 0, sort_order: lowest - 1,
      }, ['id']);

      await store.logActivity(admin.name, 'event.create', `Added "${data.title}"`);
      return json(201, { event: eventRow(await store.row('events', 'id', id)) });
    },

    async update({ admin, body }, event) {
      const data = sanitizeEvent(body, eventRow(event));
      if (data.current && (!event.current || event.venue !== data.venue)) {
        await clearCurrent(data.venue);
      }
      await store.update('events', 'id', event.id, { ...data, current: data.current ? 1 : 0 });

      await store.logActivity(admin.name, 'event.update', `Updated "${data.title}"`);
      return json(200, { event: eventRow(await store.row('events', 'id', event.id)) });
    },

    async remove({ admin }, event) {
      await store.remove('events', 'id', event.id);
      await store.logActivity(admin.name, 'event.delete', `Removed "${event.title}"`);
      return ok();
    },
  });
}

/* ================= artists ================= */

/**
 * Merge a request body over an existing artist, coercing every field.
 *
 * `curated` names products rather than indexing them — the capsule on an
 * artist's page used to be four [category, index] pairs, which point at
 * whatever happens to sit in those positions today. Naming means the piece
 * is either found or dropped; it is never quietly somebody else's work.
 */
function sanitizeArtist(body, existing) {
  const a = existing || {};
  const str = (key, fallback = '') => String(body[key] ?? a[key] ?? fallback).trim();

  const curated = Array.isArray(body.curated)
    ? body.curated.slice(0, 24).map(c => ({
      cat: String(c.cat || '').slice(0, 40),
      name: String(c.name || '').slice(0, 200),
    })).filter(c => c.cat && c.name)
    : (Array.isArray(a.curated) ? a.curated : []);

  // The story arrives as one block of text and is stored as one. Paragraphs
  // are blank lines in it, split when it is read, so the shop never has to
  // think in a list of strings.
  const story = body.story === undefined
    ? String(a.storyText ?? (Array.isArray(a.story) ? a.story.join('\n\n') : a.story ?? ''))
    : String(body.story);

  return {
    name: str('name'),
    tag: str('tag'),
    place: str('place'),
    bio: str('bio'),
    portrait: str('portrait'),
    hero: str('hero'),
    hero_alt: String(body.heroAlt ?? a.heroAlt ?? '').trim(),
    story: story.slice(0, 8000),
    curated: JSON.stringify(curated),
    listed: body.listed != null ? !!body.listed : (a.listed !== false),
    updated_at: now(),
  };
}

export function artists(ctx) {
  const { store } = ctx;

  return resource(ctx, {
    notFound: 'Artist not found',
    find: (id) => store.row('artists', 'id', id),

    async list() {
      const rows = await store.all('SELECT * FROM artists ORDER BY sort_order, rowid');
      return json(200, { artists: rows.map(artistRow) });
    },

    async create({ admin, body }) {
      const id = String(body.id || body.name || '').toLowerCase().trim()
        .replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/(^-|-$)/g, '').slice(0, 80);
      if (!id || !body.name) return badRequest('A name is required');
      if (await store.row('artists', 'id', id)) {
        return json(409, { error: 'An artist with this name already exists' });
      }

      const data = sanitizeArtist(body, null);
      // Appended rather than prepended: the index reads as a room the shop
      // has arranged, and a new arrival taking the first card from whoever
      // the shop chose to lead with would be a surprise.
      const highest = await store.value('SELECT COALESCE(MAX(sort_order), -1) FROM artists');
      await store.upsert('artists', {
        id, ...data, listed: data.listed ? 1 : 0, sort_order: highest + 1,
      }, ['id']);

      await store.logActivity(admin.name, 'artist.create', `Added "${data.name}"`);
      return json(201, { artist: artistRow(await store.row('artists', 'id', id)) });
    },

    async update({ admin, body }, artist) {
      const data = sanitizeArtist(body, artistRow(artist));
      if (body.order != null) data.sort_order = Number(body.order);
      await store.update('artists', 'id', artist.id, { ...data, listed: data.listed ? 1 : 0 });

      await store.logActivity(admin.name, 'artist.update', `Updated "${data.name}"`);
      return json(200, { artist: artistRow(await store.row('artists', 'id', artist.id)) });
    },

    async remove({ admin }, artist) {
      await store.remove('artists', 'id', artist.id);
      await store.logActivity(admin.name, 'artist.delete', `Removed "${artist.name}"`);
      return ok();
    },
  });
}
