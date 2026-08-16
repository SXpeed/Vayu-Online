/**
 * Vayu — the public API the storefront calls. No session required;
 * everything here is either read-only or append-only, and each writer
 * clamps what it stores so a hostile caller cannot grow the database
 * without bound.
 *
 * The analytics beacon is the part that changed most in the move to D1.
 * It used to read the whole day document, mutate it and write the file
 * back; now each event is one or two UPSERTs of one row, which is both
 * cheaper and safe when two visitors are counted at the same instant.
 */

import { json, ok, badRequest, notFound } from './http.js';
import { now, today } from './db.js';
import {
  loadProducts, loadCategories, toLegacyCatalogue, toLegacyTaxonomy,
  productById, productByCatIdx, sweepScheduled,
} from './catalogue.js';

const EMAIL_RE = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/;

/* ---------- catalogue ---------- */

/**
 * Public, identical for everyone and read on a hot path, so both endpoints
 * below are cached at the edge by src/cache.js. `s-maxage` is what the edge
 * honours; `max-age` is the visitor's own browser. An admin write purges
 * both immediately (see the admin dispatch in src/worker.js), so the
 * stale-while-revalidate window is a safety net rather than the mechanism.
 */
const CATALOGUE_CACHE = 'public, max-age=60, s-maxage=1800, stale-while-revalidate=86400';

/**
 * The menus, the footer columns and the announcement bar — and nothing
 * else.
 *
 * This endpoint exists because every page on the site wants the category
 * list, and until now the only way to get it was /api/catalogue, which
 * carries every product, every gallery image path and the whole journal
 * with it. A page with no products on it was downloading the entire shop to
 * put six words in a menu.
 */
export async function nav({ store }) {
  const [categories, content] = await Promise.all([
    loadCategories(store),
    store.config('content'),
  ]);

  return json(200, {
    categories: toLegacyTaxonomy(categories),
    content,
  }, { 'Cache-Control': CATALOGUE_CACHE });
}

/** Everything the storefront needs to render: catalogue, taxonomy, copy. */
export async function catalogue({ store }) {
  await sweepScheduled(store);

  const [products, categories, journal, content] = await Promise.all([
    loadProducts(store),
    loadCategories(store),
    store.all('SELECT * FROM journal ORDER BY sort_order, rowid'),
    store.config('content'),
  ]);

  return json(200, {
    products: toLegacyCatalogue(products, categories),
    categories: toLegacyTaxonomy(categories),
    journal: journal.map(storyRow),
    content,
  }, { 'Cache-Control': CATALOGUE_CACHE });
}

const safeJson = (s, fallback = []) => { try { return JSON.parse(s); } catch { return fallback; } };

/** A journal row in the shape js/journal-data.js exports. */
export const storyRow = (j) => ({
  id: j.id,
  featured: !!j.featured,
  category: j.category,
  categoryLabel: j.category_label,
  title: j.title,
  excerpt: j.excerpt,
  date: j.date,
  image: j.image,
  alt: j.alt,
  readingTime: j.reading_time,
  body: safeJson(j.body),
});

/* ---------- analytics beacon ---------- */

/** Make sure today's row exists, then hand back its key. */
async function ensureDay(store) {
  const day = today();
  await store.run('INSERT INTO analytics_days (day) VALUES (?) ON CONFLICT (day) DO NOTHING', day);
  return day;
}

/** Attribute a product view from /pages/product.html?id=… (or ?cat=&idx=). */
async function creditProductView(store, day, pathname, query) {
  if (!pathname.endsWith('/product.html') || !query) return;
  const params = new URLSearchParams(query);
  const product = params.get('id')
    ? await productById(store, params.get('id'))
    : await productByCatIdx(store, params.get('cat'), Number(params.get('idx')));
  if (!product) return;

  await store.batch([
    store.stmt('UPDATE products SET views = views + 1 WHERE id = ?', product.id),
    store.stmt(
      `INSERT INTO analytics_products (day, product_id, count) VALUES (?, ?, 1)
       ON CONFLICT (day, product_id) DO UPDATE SET count = count + 1`,
      day, product.id,
    ),
  ]);
}

async function recordPageView(store, day, body, sid) {
  const full = String(body.path || '/').slice(0, 300);
  const [pathname, query = ''] = full.split('?');

  const statements = [
    store.stmt('UPDATE analytics_days SET views = views + 1 WHERE day = ?', day),
    store.stmt(
      `INSERT INTO analytics_paths (day, path, count) VALUES (?, ?, 1)
       ON CONFLICT (day, path) DO UPDATE SET count = count + 1`,
      day, pathname,
    ),
    store.stmt('INSERT INTO analytics_recent (t, path, ref) VALUES (?, ?, ?)',
      now(), full, String(body.ref || '').slice(0, 200)),
  ];
  if (sid) {
    statements.push(store.stmt(
      'INSERT INTO analytics_visitors (day, sid) VALUES (?, ?) ON CONFLICT (day, sid) DO NOTHING', day, sid,
    ));
  }

  await store.batch(statements);
  await creditProductView(store, day, pathname, query);
}

async function recordSearch(store, body, sid) {
  const q = String(body.q || '').trim().slice(0, 80);
  if (!q) return;
  await store.batch([
    store.stmt('INSERT INTO searches (q, results, sid, t) VALUES (?, ?, ?, ?)',
      q, Number(body.results) || 0, sid, now()),
    // Cap the log without reading it: keep the newest 500 rows.
    store.stmt('DELETE FROM searches WHERE id <= (SELECT MAX(id) - 500 FROM searches)'),
  ]);
}

/** Snapshot a live cart so Analytics can show the ones never checked out. */
async function recordCart(store, body, sid) {
  if (!sid) return;
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 40).map(i => ({
    name: String(i.name || '').slice(0, 120),
    qty: Number(i.qty) || 1,
    price: String(i.price || '').slice(0, 20),
    img: String(i.img || '').slice(0, 200),
  }));

  if (!items.length) {
    await store.run('DELETE FROM carts WHERE sid = ?', sid);
    return;
  }
  await store.run(
    `INSERT INTO carts (sid, items, total, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (sid) DO UPDATE SET items = excluded.items, total = excluded.total, updated_at = excluded.updated_at`,
    sid, JSON.stringify(items), 0, now(),
  );
}

/**
 * One beacon endpoint for every storefront event:
 *   view (default)  page view, with product views attributed from the URL
 *   atc             added to cart          } the two middle steps of the
 *   checkoutStart   checkout form opened   } conversion funnel
 *   search          header search {q, results}
 *   cart            cart snapshot for abandoned-cart tracking
 */
export async function track({ store, body }) {
  const day = await ensureDay(store);
  const sid = String(body.sid || '').slice(0, 40);

  switch (String(body.type || 'view')) {
    case 'atc':
      await store.run('UPDATE analytics_days SET atc = atc + 1 WHERE day = ?', day);
      break;
    case 'checkout':
    case 'checkoutStart':
      await store.run('UPDATE analytics_days SET checkout_start = checkout_start + 1 WHERE day = ?', day);
      break;
    case 'search': await recordSearch(store, body, sid); break;
    case 'cart': await recordCart(store, body, sid); break;
    default: await recordPageView(store, day, body, sid);
  }

  return ok();
}

/* ---------- reviews ---------- */

export async function listReviews({ store, query }) {
  const productId = query.get('productId');
  const rows = productId
    ? await store.all(
      `SELECT name, rating, text, t FROM reviews WHERE status = 'approved' AND product_id = ?
        ORDER BY t DESC LIMIT 50`, productId)
    : await store.all(
      `SELECT name, rating, text, t FROM reviews WHERE status = 'approved' ORDER BY t DESC LIMIT 50`);

  const stats = productId
    ? await store.one(
      `SELECT COUNT(*) AS n, AVG(rating) AS avg FROM reviews WHERE status = 'approved' AND product_id = ?`, productId)
    : await store.one(`SELECT COUNT(*) AS n, AVG(rating) AS avg FROM reviews WHERE status = 'approved'`);

  return json(200, {
    reviews: rows,
    count: stats?.n || 0,
    avg: Math.round((stats?.avg || 0) * 10) / 10,
  });
}

/** Reviews arrive pending — nothing reaches the storefront unmoderated. */
export async function postReview({ store, body }) {
  const product = await productById(store, String(body.productId || ''));
  if (!product) return notFound('Product not found');

  const rating = Math.min(5, Math.max(1, Math.round(Number(body.rating) || 0)));
  const text = String(body.text || '').trim().slice(0, 1500);
  const name = String(body.name || '').trim().slice(0, 80);
  if (!name || !text || !rating) return badRequest('Name, rating and review text are required');

  await store.run(
    `INSERT INTO reviews (id, product_id, product_name, name, email, rating, text, status, t)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    await store.nextId('rev'), product.id, product.name, name,
    String(body.email || '').toLowerCase().trim().slice(0, 120), rating, text, now(),
  );
  return json(201, { ok: true, message: 'Thank you — your review will appear once approved.' });
}

/* ---------- waitlists ---------- */

export async function notifyMe({ store, body }) {
  const product = await productById(store, String(body.productId || ''));
  const email = String(body.email || '').toLowerCase().trim();
  if (!product) return notFound('Product not found');
  if (!EMAIL_RE.test(email)) return badRequest('Invalid email');

  // The UNIQUE (product_id, email) pair makes "already waiting" a no-op
  // rather than something to check for first.
  await store.run(
    `INSERT INTO stock_alerts (product_id, email, notified, t) VALUES (?, ?, 0, ?)
     ON CONFLICT (product_id, email) DO NOTHING`,
    product.id, email, now(),
  );
  return ok();
}

export async function newsletter({ store, body }) {
  const email = String(body.email || '').toLowerCase().trim();
  if (!EMAIL_RE.test(email)) return badRequest('Invalid email');
  await store.run(
    `INSERT INTO subscribers (email, t, source) VALUES (?, ?, 'footer') ON CONFLICT (email) DO NOTHING`,
    email, now(),
  );
  return ok();
}
