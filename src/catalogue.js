/**
 * Vayu — reading the catalogue out of D1 and back into the shapes the
 * storefront was written against.
 *
 * The storefront still asks for productData[cat][idx], because every
 * ?cat=&idx= link, every cart line and every old order refers to a product
 * that way. That projection now comes from a join instead of a nested
 * array, and `products.sort_order` is what keeps idx stable — deleting a
 * product shifts the ones after it exactly as splicing the JSON array did.
 */

import { formatPrice } from './db.js';

/* ---------- loading ---------- */

/**
 * Products with their gallery, variants, tags and category pairs attached.
 * Five queries, not five per product: each child table is fetched once for
 * the whole set and grouped in memory, which is the difference between one
 * round trip and the N+1 problem.
 */
export async function loadProducts(store, { status = null } = {}) {
  const where = status ? 'WHERE status = ?' : '';
  const binds = status ? [status] : [];

  const [products, categories, gallery, variants, tags] = await Promise.all([
    store.all(`SELECT * FROM products ${where} ORDER BY sort_order, rowid`, ...binds),
    store.all('SELECT * FROM product_categories'),
    store.all('SELECT * FROM product_gallery ORDER BY sort_order, rowid'),
    store.all('SELECT * FROM product_variants ORDER BY sort_order, rowid'),
    store.all('SELECT * FROM product_tags'),
  ]);

  const group = (rows, key = 'product_id') => {
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r[key])) map.set(r[key], []);
      map.get(r[key]).push(r);
    }
    return map;
  };

  const byCat = group(categories);
  const byGallery = group(gallery);
  const byVariant = group(variants);
  const byTag = group(tags);

  return products.map(p => hydrate(p, {
    categories: byCat.get(p.id) || [],
    gallery: byGallery.get(p.id) || [],
    variants: byVariant.get(p.id) || [],
    tags: byTag.get(p.id) || [],
  }));
}

/** One product with its children. */
export async function loadProduct(store, id) {
  const p = await store.one('SELECT * FROM products WHERE id = ?', id);
  if (!p) return null;
  const [categories, gallery, variants, tags] = await Promise.all([
    store.all('SELECT * FROM product_categories WHERE product_id = ?', id),
    store.all('SELECT * FROM product_gallery WHERE product_id = ? ORDER BY sort_order, rowid', id),
    store.all('SELECT * FROM product_variants WHERE product_id = ? ORDER BY sort_order, rowid', id),
    store.all('SELECT * FROM product_tags WHERE product_id = ?', id),
  ]);
  return hydrate(p, { categories, gallery, variants, tags });
}

/** A row set from D1 back into the object shape the app's logic expects. */
function hydrate(p, children) {
  return {
    id: p.id,
    name: p.name,
    description: p.description || '',
    price: p.price,
    compareAt: p.compare_at ?? null,
    sku: p.sku || '',
    stock: p.stock,
    status: p.status,
    isNew: !!p.is_new,
    img: p.img || '',
    publishAt: p.publish_at ?? null,
    views: p.views || 0,
    sold: p.sold || 0,
    sortOrder: p.sort_order || 0,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    categories: children.categories.map(c => ({ cat: c.category_slug, sub: c.sub || '' })),
    gallery: children.gallery.map(g => g.url),
    variants: children.variants.map(v => ({
      id: v.id, label: v.label, price: v.price ?? null, stock: v.stock,
    })),
    tags: children.tags.map(t => t.tag),
  };
}

/** Sellable stock: the sum of variant stock when variants exist. */
export const totalStock = (p) =>
  (p.variants && p.variants.length)
    ? p.variants.reduce((n, v) => n + (Number(v.stock) || 0), 0)
    : p.stock;

/* ---------- categories ---------- */

export async function loadCategories(store) {
  const [cats, subs] = await Promise.all([
    store.all('SELECT * FROM categories ORDER BY sort_order, slug'),
    store.all('SELECT * FROM category_subs ORDER BY sort_order, rowid'),
  ]);
  return cats.map(c => ({
    slug: c.slug,
    title: c.title,
    curated: c.curated || '',
    banner: c.banner || '',
    order: c.sort_order,
    subs: subs.filter(s => s.category_slug === c.slug).map(s => ({ label: s.label, thumb: s.thumb || '' })),
  }));
}

/** Taxonomy in the shape js/taxonomy.js exports, in saved order. */
export function toLegacyTaxonomy(categories) {
  const out = {};
  for (const c of categories) {
    out[c.slug] = { title: c.title, curated: c.curated, banner: c.banner, subs: c.subs };
  }
  return out;
}

/**
 * Project products into the legacy storefront shape:
 * { fashion: [ { name, price: '₹ 3,200', img, sub, isNew, gallery, id } ] }
 * A product listed in several categories appears in each of them. Only
 * active products are included, and array order follows sort_order so idx
 * stays stable unless something is deleted.
 */
export function toLegacyCatalogue(products, categories) {
  const out = {};
  for (const c of categories) out[c.slug] = [];

  for (const p of products) {
    if (p.status !== 'active') continue;
    for (const c of p.categories) {
      out[c.cat] ||= [];
      out[c.cat].push({
        id: p.id,
        name: p.name,
        price: formatPrice(p.price),
        priceValue: p.price,
        compareAt: p.compareAt ? formatPrice(p.compareAt) : null,
        img: p.img,
        sub: c.sub || '',
        isNew: !!p.isNew,
        gallery: p.gallery.length ? p.gallery : [p.img],
        stock: totalStock(p),
        description: p.description || '',
        tags: p.tags || [],
        variants: (p.variants || []).map(v => ({
          label: v.label,
          price: v.price != null ? formatPrice(v.price) : null,
          priceValue: v.price != null ? v.price : p.price,
          stock: v.stock,
        })),
      });
    }
  }
  return out;
}

/**
 * Find a product by its position in the legacy projection (cat + idx).
 * Only the active set is projected, so this must build the same list the
 * storefront was given rather than index the table directly.
 */
export async function productByCatIdx(store, cat, idx) {
  const row = await store.one(
    `SELECT p.id FROM products p
       JOIN product_categories pc ON pc.product_id = p.id
      WHERE pc.category_slug = ? AND p.status = 'active'
      ORDER BY p.sort_order, p.rowid
      LIMIT 1 OFFSET ?`,
    cat, Number(idx) || 0,
  );
  return row ? loadProduct(store, row.id) : null;
}

export const productById = (store, id) => (id ? loadProduct(store, id) : Promise.resolve(null));

/* ---------- scheduled publishing ---------- */

/** Activate scheduled products whose publish time has arrived. */
export async function sweepScheduled(store) {
  const due = await store.all(
    `SELECT id, name FROM products WHERE status = 'draft' AND publish_at IS NOT NULL AND publish_at <= ?`,
    new Date().toISOString(),
  );
  if (!due.length) return 0;

  await store.batch([
    store.stmt(
      `UPDATE products SET status = 'active', publish_at = NULL, updated_at = ?
        WHERE status = 'draft' AND publish_at IS NOT NULL AND publish_at <= ?`,
      new Date().toISOString(), new Date().toISOString(),
    ),
    ...due.map(p => store.stmt(
      'INSERT INTO activity (t, admin, action, detail) VALUES (?, ?, ?, ?)',
      new Date().toISOString(), 'system', 'product.publish', `Scheduled publish of "${p.name}"`,
    )),
  ]);
  return due.length;
}

/* ---------- stock alerts ---------- */

/**
 * Queue back-in-stock mail for everyone waiting on this product. Called
 * wherever stock can rise — a product edit, a bulk set, a CSV import, a
 * cancelled order — so it lives here rather than in each of them.
 */
export async function fireStockAlerts(store, product) {
  if (totalStock(product) <= 0) return;
  const waiting = await store.all(
    'SELECT id, email FROM stock_alerts WHERE product_id = ? AND notified = 0', product.id,
  );
  for (const a of waiting) {
    await store.queueEmail(a.email, `Vayu — "${product.name}" is back in stock`,
      `Good news — "${product.name}" is available again.\n\nSee it: /pages/product.html?id=${product.id}\n\n— Vayu`,
      'stock.alert');
    await store.run('UPDATE stock_alerts SET notified = 1 WHERE id = ?', a.id);
  }
}
