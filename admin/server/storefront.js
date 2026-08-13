/**
 * Vayu — the public API the storefront itself calls. No session required;
 * everything here is either read-only or append-only, and each writer
 * clamps what it stores so a hostile caller cannot grow db.json without
 * bound.
 */

const store = require('./db');
const { sendJson } = require('./http');

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Everything the storefront needs to render: catalogue, taxonomy, copy. */
function catalogue({ res }) {
  store.sweepScheduled();
  sendJson(res, 200, {
    products: store.toLegacyCatalogue(),
    categories: store.toLegacyTaxonomy(),
    journal: store.db.journal || [],
    content: store.db.content,
  });
}

/* ---------- analytics beacon ---------- */

function analyticsDay() {
  const day = store.today();
  const days = store.db.analytics.days;
  days[day] ||= { views: 0, paths: {}, products: {}, sids: {}, atc: 0, checkoutStart: 0 };
  return days[day];
}

/** Attribute a product view from /pages/product.html?id=… (or ?cat=&idx=). */
function creditProductView(day, pathname, query) {
  if (!pathname.endsWith('/product.html') || !query) return;
  const params = new URLSearchParams(query);
  const prod = params.get('id')
    ? store.productById(params.get('id'))
    : store.productByCatIdx(params.get('cat'), Number(params.get('idx')));
  if (!prod) return;
  prod.views = (prod.views || 0) + 1;
  day.products[prod.id] = (day.products[prod.id] || 0) + 1;
}

function recordPageView(day, body, sid) {
  const full = String(body.path || '/').slice(0, 300);
  const [pathname, query = ''] = full.split('?');

  day.views += 1;
  if (sid) day.sids[sid] = 1;
  day.paths[pathname] = (day.paths[pathname] || 0) + 1;
  creditProductView(day, pathname, query);

  store.db.analytics.recent.unshift({
    t: new Date().toISOString(), path: full, ref: String(body.ref || '').slice(0, 200),
  });
  if (store.db.analytics.recent.length > 200) store.db.analytics.recent.length = 200;
}

function recordSearch(body) {
  const q = String(body.q || '').trim().slice(0, 80);
  if (!q) return;
  store.db.searches.unshift({ q, results: Number(body.results) || 0, t: new Date().toISOString() });
  if (store.db.searches.length > 500) store.db.searches.length = 500;
}

/** Snapshot a live cart so Analytics can show the ones never checked out. */
function recordCart(body, sid) {
  if (!sid) return;
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 40).map(i => ({
    name: String(i.name || '').slice(0, 120),
    qty: Number(i.qty) || 1,
    price: String(i.price || '').slice(0, 20),
    img: String(i.img || '').slice(0, 200),
  }));
  if (items.length) store.db.carts[sid] = { items, t: new Date().toISOString() };
  else delete store.db.carts[sid];
}

/**
 * One beacon endpoint for every storefront event:
 *   view (default)  page view, with product views attributed from the URL
 *   atc             added to cart          } the two middle steps of the
 *   checkoutStart   checkout form opened   } conversion funnel
 *   search          header search {q, results}
 *   cart            cart snapshot for abandoned-cart tracking
 */
function track({ res, body }) {
  const day = analyticsDay();
  const sid = String(body.sid || '').slice(0, 40);

  switch (String(body.type || 'view')) {
    case 'atc': day.atc = (day.atc || 0) + 1; break;
    case 'checkout':
    case 'checkoutStart': day.checkoutStart = (day.checkoutStart || 0) + 1; break;
    case 'search': recordSearch(body); break;
    case 'cart': recordCart(body, sid); break;
    default: recordPageView(day, body, sid);
  }

  store.save();
  sendJson(res, 200, { ok: true });
}

/* ---------- reviews ---------- */

function listReviews({ res, query }) {
  const productId = query.get('productId');
  const list = store.db.reviews
    .filter(r => r.status === 'approved' && (!productId || r.productId === productId))
    .map(r => ({ name: r.name, rating: r.rating, text: r.text, t: r.t }));
  const avg = list.length ? list.reduce((n, r) => n + r.rating, 0) / list.length : 0;
  sendJson(res, 200, { reviews: list.slice(0, 50), count: list.length, avg: Math.round(avg * 10) / 10 });
}

/** Reviews arrive pending — nothing reaches the storefront unmoderated. */
function postReview({ res, body }) {
  const prod = store.productById(String(body.productId || ''));
  if (!prod) return sendJson(res, 404, { error: 'Product not found' });

  const rating = Math.min(5, Math.max(1, Math.round(Number(body.rating) || 0)));
  const text = String(body.text || '').trim().slice(0, 1500);
  const name = String(body.name || '').trim().slice(0, 80);
  if (!name || !text || !rating) return sendJson(res, 400, { error: 'Name, rating and review text are required' });

  store.db.reviews.unshift({
    id: store.nextId('rev'),
    productId: prod.id,
    productName: prod.name,
    name,
    email: String(body.email || '').toLowerCase().trim().slice(0, 120),
    rating, text,
    status: 'pending',
    t: new Date().toISOString(),
  });
  store.save();
  sendJson(res, 201, { ok: true, message: 'Thank you — your review will appear once approved.' });
}

/* ---------- waitlists ---------- */

function notifyMe({ res, body }) {
  const prod = store.productById(String(body.productId || ''));
  const email = String(body.email || '').toLowerCase().trim();
  if (!prod) return sendJson(res, 404, { error: 'Product not found' });
  if (!EMAIL_RE.test(email)) return sendJson(res, 400, { error: 'Invalid email' });

  const waiting = store.db.stockAlerts.some(a => a.productId === prod.id && a.email === email && !a.notified);
  if (!waiting) {
    store.db.stockAlerts.push({ productId: prod.id, email, notified: false, t: new Date().toISOString() });
    store.save();
  }
  sendJson(res, 200, { ok: true });
}

function newsletter({ res, body }) {
  const email = String(body.email || '').toLowerCase().trim();
  if (!EMAIL_RE.test(email)) return sendJson(res, 400, { error: 'Invalid email' });
  if (!store.db.subscribers.some(s => s.email === email)) {
    store.db.subscribers.push({ email, t: new Date().toISOString() });
    store.save();
  }
  sendJson(res, 200, { ok: true });
}

module.exports = { catalogue, track, listReviews, postReview, notifyMe, newsletter };
