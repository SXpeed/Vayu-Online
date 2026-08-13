/**
 * Vayu — admin panel API + admin UI serving.
 *
 * This file is only the front door: it decides which handler a request
 * belongs to, enforces the session and role rules, and turns a thrown
 * error into a 500. Every actual behaviour lives in a sibling module.
 *
 *   http.js        request/response plumbing, REST resource dispatch
 *   auth.js        admin sessions, sign-in, the role gate
 *   accounts.js    customer accounts: /api/account/*
 *   storefront.js  public API the shop itself calls
 *   checkout.js    coupons, shipping, order creation, payment
 *   catalog.js     products, categories, journal
 *   sales.js       orders + invoices, customers, coupons, review moderation
 *   insights.js    dashboard, analytics, activity, inventory, outbox
 *   site.js        content, settings, team, uploads, exports, backups
 *
 * server.js calls handle(req, res); it returns false for anything that is
 * not ours, and the static site serving carries on as before.
 */

const store = require('./db');
const { sendJson, readJson, serveUiFile } = require('./http');
const auth = require('./auth');
const accounts = require('./accounts');
const storefront = require('./storefront');
const checkout = require('./checkout');
const catalog = require('./catalog');
const sales = require('./sales');
const insights = require('./insights');
const site = require('./site');

/* ---------- route tables ---------- */

/** Open endpoints the storefront calls, keyed by "METHOD /path". */
const PUBLIC_ROUTES = {
  'GET /api/catalogue': storefront.catalogue,
  'POST /api/track': storefront.track,
  'GET /api/reviews': storefront.listReviews,
  'POST /api/reviews': storefront.postReview,
  'POST /api/notify-me': storefront.notifyMe,
  'POST /api/newsletter': storefront.newsletter,
  'POST /api/checkout': checkout.checkout,
  'POST /api/checkout/confirm': checkout.confirm,
  'POST /api/coupon/validate': checkout.validateCoupon,
  'POST /api/admin/login': auth.login,
};

/**
 * Signed-in endpoints, keyed by the first path segment after /api/admin/.
 * `role` is the minimum rank required — absent means any signed-in admin,
 * which covers the day-to-day work a staff account has to do.
 */
const ADMIN_ROUTES = {
  logout: { handler: auth.logout },
  me: { handler: auth.me },
  password: { handler: auth.changePassword },

  overview: { handler: insights.overview },
  analytics: { handler: insights.analytics },
  activity: { handler: insights.activity },
  outbox: { handler: insights.outbox },
  orders: { handler: sales.orders },
  customers: { handler: sales.customers },

  products: { handler: catalog.products, role: 'manager' },
  categories: { handler: catalog.categories, role: 'manager' },
  journal: { handler: catalog.journal, role: 'manager' },
  coupons: { handler: sales.coupons, role: 'manager' },
  reviews: { handler: sales.reviews, role: 'manager' },
  inventory: { handler: insights.inventory, role: 'manager' },
  content: { handler: site.content, role: 'manager' },
  upload: { handler: site.upload, role: 'manager' },
  export: { handler: site.exportCsv, role: 'manager' },

  team: { handler: site.team, role: 'owner' },
  settings: { handler: site.settings, role: 'owner' },
  backup: { handler: site.backup, role: 'owner' },
};

const HAS_BODY = new Set(['POST', 'PUT', 'PATCH']);

/* ---------- admin UI ---------- */

const redirect = (res, location) => {
  res.writeHead(302, { Location: location });
  res.end();
};

/** Serves admin/ui, gating the panel itself behind a session. */
function serveAdminUi(req, res, url) {
  if (url === '/admin' || url === '/admin/') {
    if (auth.currentAdmin(req)) serveUiFile(res, 'index.html');
    else redirect(res, '/admin/login');
    return;
  }
  if (url === '/admin/login') {
    if (auth.currentAdmin(req)) redirect(res, '/admin');
    else serveUiFile(res, 'login.html');
    return;
  }
  serveUiFile(res, url.slice('/admin/'.length));
}

/* ---------- dispatch ---------- */

async function dispatch(req, res, url) {
  const method = req.method;
  const body = HAS_BODY.has(method) ? await readJson(req) : {};
  const query = new URLSearchParams(req.url.split('?')[1] || '');
  const ctx = { req, res, method, body, query, parts: [] };

  const publicRoute = PUBLIC_ROUTES[`${method} ${url}`];
  if (publicRoute) return publicRoute(ctx);

  // Customer accounts run their own session and gate, so they are dispatched
  // whole rather than listed route by route above.
  if (url.startsWith('/api/account/')) {
    const [section, ...parts] = url.slice('/api/account/'.length).split('/').filter(Boolean);
    return accounts.route({ ...ctx, parts }, section);
  }

  if (!url.startsWith('/api/admin/')) return sendJson(res, 404, { error: 'Not found' });

  const admin = auth.currentAdmin(req);
  if (!admin) return sendJson(res, 401, { error: 'Not signed in' });

  const [section, ...parts] = url.slice('/api/admin/'.length).split('/').filter(Boolean);
  const route = ADMIN_ROUTES[section];
  if (!route) return sendJson(res, 404, { error: 'Not found' });

  const denied = auth.roleError(admin, route.role);
  if (denied) return sendJson(res, denied.status, { error: denied.error });

  return route.handler({ ...ctx, admin, parts });
}

/* ---------- entry ---------- */

let started = false;

async function handle(req, res) {
  const url = req.url.split('?')[0];
  const isAdminUi = url === '/admin' || url.startsWith('/admin/');
  if (!url.startsWith('/api/') && !isAdminUi) return false;

  await store.init();

  // One snapshot per boot, so there is always a recent copy to fall back
  // to even if nobody ever presses "Back up now".
  if (!started) {
    started = true;
    try { site.makeBackup(); } catch (err) { console.error('[backup]', err.message); }
  }

  try {
    if (isAdminUi) serveAdminUi(req, res, url);
    else await dispatch(req, res, url);
  } catch (err) {
    console.error('[admin-api]', err.message);
    if (!res.headersSent) sendJson(res, 500, { error: 'Server error: ' + err.message });
  }
  return true;
}

module.exports = { handle };
