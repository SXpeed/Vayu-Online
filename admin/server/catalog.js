/**
 * Vayu admin — the things you publish: products, categories, journal.
 *
 * Each export is a route handler taking the request context; the shape of
 * the URL is declared through http.resource() so the find/404/405 ladder
 * lives in one place rather than three.
 */

const store = require('./db');
const { sendJson, resource } = require('./http');

const PRODUCT_STATUSES = ['active', 'draft', 'archived'];
const PLACEHOLDER_IMG = '/assets/images/cat_objects.png';

/* ================= products ================= */

/**
 * Merge a request body over an existing product (or over nothing, for a
 * new one), coercing every field. Anything absent from the body keeps its
 * current value, so a partial edit never blanks a field by omission.
 */
function sanitizeProduct(body, existing) {
  const p = existing || {};
  const cats = Array.isArray(body.categories)
    ? body.categories
      .filter(c => c && c.cat && store.db.categories[c.cat])
      .map(c => ({ cat: String(c.cat), sub: String(c.sub || '') }))
    : p.categories;

  return {
    name: String(body.name ?? p.name ?? '').trim(),
    description: String(body.description ?? p.description ?? ''),
    price: Math.max(0, Number(body.price ?? p.price) || 0),
    compareAt: body.compareAt != null && body.compareAt !== '' ? Math.max(0, Number(body.compareAt) || 0) : null,
    sku: String(body.sku ?? p.sku ?? ''),
    stock: Math.max(0, Math.round(Number(body.stock ?? p.stock) || 0)),
    status: PRODUCT_STATUSES.includes(body.status) ? body.status : (p.status || 'draft'),
    isNew: body.isNew != null ? !!body.isNew : !!p.isNew,
    img: String(body.img ?? p.img ?? ''),
    gallery: Array.isArray(body.gallery) && body.gallery.length ? body.gallery.map(String) : (p.gallery || []),
    categories: cats && cats.length ? cats : [],
    tags: Array.isArray(body.tags) ? body.tags.map(String) : (p.tags || []),
    variants: Array.isArray(body.variants)
      ? body.variants
        .filter(v => v && String(v.label || '').trim())
        .map(v => ({
          label: String(v.label).trim().slice(0, 60),
          price: v.price !== '' && v.price != null ? Math.max(0, Number(v.price) || 0) : null,
          stock: Math.max(0, Math.round(Number(v.stock) || 0)),
        }))
      : (p.variants || []),
    publishAt: body.publishAt !== undefined
      ? (body.publishAt ? new Date(body.publishAt).toISOString() : null)
      : (p.publishAt || null),
  };
}

/** Both create and update refuse the same two things. */
function productProblem(data) {
  if (!data.name) return 'Name is required';
  if (!data.categories.length) return 'Pick at least one category';
  return null;
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
  status(targets, body) {
    if (!PRODUCT_STATUSES.includes(body.status)) return 'Bad status';
    const now = new Date().toISOString();
    for (const p of targets) { p.status = body.status; p.updatedAt = now; }
    return null;
  },
  delete(targets, body, admin, ids) {
    store.db.products = store.db.products.filter(p => !ids.includes(p.id));
    return null;
  },
  'price-adjust'(targets, body) {
    const pct = Number(body.percent) || 0;
    const now = new Date().toISOString();
    for (const p of targets) {
      p.price = Math.max(0, Math.round(p.price * (1 + pct / 100)));
      p.updatedAt = now;
    }
    return null;
  },
  'add-category'(targets, body) {
    if (!store.db.categories[body.cat]) return 'Unknown category';
    for (const p of targets) {
      if (!p.categories.some(c => c.cat === body.cat)) {
        p.categories.push({ cat: body.cat, sub: String(body.sub || '') });
      }
    }
    return null;
  },
  'stock-set'(targets, body, admin) {
    const stock = Math.max(0, Math.round(Number(body.stock) || 0));
    for (const p of targets) {
      store.logInventory(p.id, p.name, stock - store.totalStock(p), 'bulk set', admin.name);
      p.stock = stock;
      if (p.variants?.length) for (const v of p.variants) v.stock = stock;
      store.fireStockAlerts(p);
    }
    return null;
  },
};

function bulkProducts({ res, method, admin, body }) {
  if (method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  const ids = Array.isArray(body.ids) ? body.ids : [];
  const targets = store.db.products.filter(p => ids.includes(p.id));
  if (!targets.length) return sendJson(res, 400, { error: 'No products selected' });

  const action = String(body.action || '');
  const run = BULK[action];
  if (!run) return sendJson(res, 400, { error: 'Unknown bulk action' });

  const problem = run(targets, body, admin, ids);
  if (problem) return sendJson(res, 400, { error: problem });

  store.logActivity(admin.name, 'product.bulk', `Bulk ${action} on ${targets.length} product(s)`);
  store.save();
  sendJson(res, 200, { ok: true, affected: targets.length });
}

/* ---- CSV import ---- */

/** "furniture:seating|decor" → [{cat:'furniture',sub:'seating'},{cat:'decor',sub:''}] */
function parseCategoryCell(cell) {
  if (!cell) return [];
  return cell.split('|').map(c => {
    const [cat, sub] = c.split(':');
    return store.db.categories[cat] ? { cat, sub: sub || '' } : null;
  }).filter(Boolean);
}

function importProducts({ res, method, admin, body }) {
  if (method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  const rows = parseCsv(body.csv || '');
  if (rows.length < 2) return sendJson(res, 400, { error: 'CSV needs a header row and at least one product' });

  const head = rows[0].map(h => h.trim().toLowerCase());
  if (!head.includes('name') || !head.includes('price')) {
    return sendJson(res, 400, { error: 'CSV must have "name" and "price" columns' });
  }

  const now = new Date().toISOString();
  let created = 0, updated = 0;

  for (const r of rows.slice(1)) {
    const get = (col) => {
      const i = head.indexOf(col);
      return i === -1 ? '' : (r[i] || '').trim();
    };
    const name = get('name');
    if (!name) continue;

    const cats = parseCategoryCell(get('categories'));
    const existing = get('id') ? store.productById(get('id')) : store.db.products.find(p => p.name === name);

    if (existing) {
      existing.price = Number(get('price')) || existing.price;
      if (get('stock') !== '') {
        const stock = Math.max(0, Number(get('stock')) || 0);
        store.logInventory(existing.id, existing.name, stock - store.totalStock(existing), 'csv import', admin.name);
        existing.stock = stock;
        store.fireStockAlerts(existing);
      }
      if (get('sku')) existing.sku = get('sku');
      if (PRODUCT_STATUSES.includes(get('status'))) existing.status = get('status');
      if (cats.length) existing.categories = cats;
      existing.updatedAt = now;
      updated++;
      continue;
    }

    if (!cats.length) continue; // a new product needs at least one valid category
    const img = get('img') || PLACEHOLDER_IMG;
    store.db.products.push({
      id: store.nextId('prod'), name,
      description: get('description'),
      price: Number(get('price')) || 0,
      compareAt: null,
      sku: get('sku'),
      stock: Math.max(0, Number(get('stock')) || 0),
      status: PRODUCT_STATUSES.includes(get('status')) ? get('status') : 'draft',
      isNew: false,
      img, gallery: [img],
      categories: cats, tags: [], variants: [], publishAt: null,
      views: 0, sold: 0, createdAt: now, updatedAt: now,
    });
    created++;
  }

  store.logActivity(admin.name, 'product.import', `CSV import: ${created} created, ${updated} updated`);
  store.save();
  sendJson(res, 200, { ok: true, created, updated });
}

/* ---- product routes ---- */

function products(ctx) {
  return resource(ctx, {
    notFound: 'Product not found',
    find: (id) => store.db.products.find(p => p.id === id),
    collectionActions: { bulk: bulkProducts, import: importProducts },

    list({ res }) {
      store.sweepScheduled();
      sendJson(res, 200, { products: store.db.products, settings: store.db.settings });
    },

    create({ res, admin, body }) {
      const data = sanitizeProduct(body);
      const problem = productProblem(data);
      if (problem) return sendJson(res, 400, { error: problem });

      const now = new Date().toISOString();
      const prod = { id: store.nextId('prod'), ...data, views: 0, sold: 0, createdAt: now, updatedAt: now };
      if (!prod.gallery.length && prod.img) prod.gallery = [prod.img];
      store.db.products.push(prod);
      store.logActivity(admin.name, 'product.create', `Created "${prod.name}"`);
      store.save();
      sendJson(res, 201, { product: prod });
    },

    update({ res, admin, body }, prod) {
      const data = sanitizeProduct(body, prod);
      const problem = productProblem(data);
      if (problem) return sendJson(res, 400, { error: problem });

      const before = store.totalStock(prod);
      Object.assign(prod, data, { updatedAt: new Date().toISOString() });

      const delta = store.totalStock(prod) - before;
      if (delta) {
        store.logInventory(prod.id, prod.name, delta, 'manual edit', admin.name);
        if (before <= 0) store.fireStockAlerts(prod);
      }
      store.logActivity(admin.name, 'product.update', `Updated "${prod.name}"`);
      store.save();
      sendJson(res, 200, { product: prod });
    },

    remove({ res, admin }, prod) {
      store.db.products = store.db.products.filter(p => p.id !== prod.id);
      store.logActivity(admin.name, 'product.delete', `Deleted "${prod.name}"`);
      store.save();
      sendJson(res, 200, { ok: true });
    },

    actions: {
      duplicate({ res, method, admin }, prod) {
        if (method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
        const now = new Date().toISOString();
        const copy = {
          ...structuredClone(prod),
          id: store.nextId('prod'),
          name: prod.name + ' (copy)',
          status: 'draft',
          views: 0, sold: 0, createdAt: now, updatedAt: now,
        };
        store.db.products.push(copy);
        store.logActivity(admin.name, 'product.duplicate', `Duplicated "${prod.name}"`);
        store.save();
        sendJson(res, 201, { product: copy });
      },
    },
  });
}

/* ================= categories ================= */

const toSubs = (subs) => (Array.isArray(subs) ? subs : [])
  .map(s => ({ label: String(s.label), thumb: String(s.thumb || '') }));

function categories(ctx) {
  return resource(ctx, {
    notFound: 'Category not found',
    // Categories are keyed by slug rather than held in an array.
    find: (slug) => store.db.categories[slug],

    list({ res }) {
      const counts = {};
      for (const p of store.db.products) {
        for (const c of p.categories) counts[c.cat] = (counts[c.cat] || 0) + 1;
      }
      sendJson(res, 200, { categories: store.db.categories, counts });
    },

    create({ res, admin, body }) {
      const slug = String(body.slug || '').toLowerCase().trim().replaceAll(/[^a-z0-9-]/g, '-');
      if (!slug || !body.title) return sendJson(res, 400, { error: 'Slug and title are required' });
      if (store.db.categories[slug]) return sendJson(res, 409, { error: 'Category already exists' });

      store.db.categories[slug] = {
        title: String(body.title),
        curated: String(body.curated || PLACEHOLDER_IMG),
        banner: String(body.banner || PLACEHOLDER_IMG),
        subs: toSubs(body.subs),
        order: Object.keys(store.db.categories).length,
      };
      store.logActivity(admin.name, 'category.create', `Created category "${body.title}"`);
      store.save();
      sendJson(res, 201, { ok: true });
    },

    update({ res, admin, body }, cat) {
      cat.title = String(body.title ?? cat.title);
      cat.curated = String(body.curated ?? cat.curated);
      cat.banner = String(body.banner ?? cat.banner);
      if (Array.isArray(body.subs)) cat.subs = toSubs(body.subs);
      if (body.order != null) cat.order = Number(body.order);
      store.logActivity(admin.name, 'category.update', `Updated category "${cat.title}"`);
      store.save();
      sendJson(res, 200, { ok: true });
    },

    remove({ res, admin, parts }, cat) {
      const slug = parts[0];
      const inUse = store.db.products.filter(p => p.categories.some(c => c.cat === slug));
      if (inUse.length) {
        return sendJson(res, 409, {
          error: `${inUse.length} product(s) still use this category. Reassign them first.`,
        });
      }
      delete store.db.categories[slug];
      store.logActivity(admin.name, 'category.delete', `Deleted category "${cat.title}"`);
      store.save();
      sendJson(res, 200, { ok: true });
    },
  });
}

/* ================= journal ================= */

function sanitizeStory(body, existing) {
  const s = existing || {};
  const paragraphs = Array.isArray(body.body)
    ? body.body.map(String)
    : (typeof body.body === 'string'
      ? body.body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
      : (s.body || []));

  return {
    id: s.id,
    featured: body.featured != null ? !!body.featured : !!s.featured,
    category: String(body.category ?? s.category ?? 'craft'),
    categoryLabel: String(body.categoryLabel ?? s.categoryLabel ?? 'Craft & Heritage'),
    title: String(body.title ?? s.title ?? '').trim(),
    excerpt: String(body.excerpt ?? s.excerpt ?? ''),
    date: String(body.date ?? s.date ?? new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })),
    image: String(body.image ?? s.image ?? ''),
    alt: String(body.alt ?? body.title ?? s.alt ?? s.title ?? ''),
    readingTime: String(body.readingTime ?? s.readingTime ?? '4 min read'),
    body: paragraphs,
  };
}

/** Exactly one story carries the flag; the listing shows the first it finds. */
function clearFeatured() {
  for (const s of store.db.journal) s.featured = false;
}

function journal(ctx) {
  return resource(ctx, {
    notFound: 'Story not found',
    find: (id) => store.db.journal.find(s => s.id === id),

    list({ res }) {
      sendJson(res, 200, { stories: store.db.journal });
    },

    create({ res, admin, body }) {
      const id = String(body.id || body.title || '').toLowerCase().trim()
        .replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/(^-|-$)/g, '').slice(0, 80);
      if (!id || !body.title) return sendJson(res, 400, { error: 'Title is required' });
      if (store.db.journal.some(s => s.id === id)) {
        return sendJson(res, 409, { error: 'A story with this slug already exists' });
      }

      const story = sanitizeStory(body, { id });
      if (story.featured) clearFeatured();
      store.db.journal.unshift(story);
      store.logActivity(admin.name, 'journal.create', `Published "${story.title}"`);
      store.save();
      sendJson(res, 201, { story });
    },

    update({ res, admin, body }, story) {
      const updated = sanitizeStory(body, story);
      if (updated.featured && !story.featured) clearFeatured();
      Object.assign(story, updated);
      store.logActivity(admin.name, 'journal.update', `Updated "${story.title}"`);
      store.save();
      sendJson(res, 200, { story });
    },

    remove({ res, admin }, story) {
      store.db.journal = store.db.journal.filter(s => s.id !== story.id);
      store.logActivity(admin.name, 'journal.delete', `Deleted "${story.title}"`);
      store.save();
      sendJson(res, 200, { ok: true });
    },
  });
}

module.exports = { products, categories, journal };
