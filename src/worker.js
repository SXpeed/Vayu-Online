/**
 * Vayu — the Worker.
 *
 * The front door, and the port of both server.js and admin/server/api.js.
 * Static files no longer pass through here at all: wrangler.jsonc lists the
 * routes this Worker runs first (/api/*, /admin*, /uploads/*) and every
 * other request is served straight off Cloudflare's edge, which is what
 * makes the old MIME table and cache-header logic unnecessary.
 *
 * What is left is routing:
 *
 *   /api/nav, /api/catalogue, …     open storefront endpoints
 *   /api/track                      the analytics beacon
 *   /api/account/*                  customer accounts (own session)
 *   /api/admin/*                    the panel's API, behind the role gate
 *   /admin, /admin/*                the panel itself, behind a session
 *   /uploads/*                      images the panel uploaded, from R2
 */

import { Store } from './db.js';
import { cachedResponse, storeResponse, purgeCatalogueCache } from './cache.js';
import { json, notFound, text, redirect, readJson, unauthorized } from './http.js';
import {
  currentAdmin, roleError, adminLogin, adminLogout, adminMe, adminChangePassword,
} from './sessions.js';
import * as accounts from './accounts.js';
import * as storefront from './storefront.js';
import * as checkoutRoutes from './checkout.js';
import * as catalog from './admin-catalog.js';
import * as sales from './admin-sales.js';
import * as insights from './admin-insights.js';
import * as site from './admin-site.js';

/* ---------- route tables ---------- */

/** Open endpoints the storefront calls, keyed by "METHOD /path". */
const PUBLIC_ROUTES = {
  'GET /api/catalogue': storefront.catalogue,
  'GET /api/nav': storefront.nav,
  'POST /api/track': storefront.track,
  'GET /api/reviews': storefront.listReviews,
  'POST /api/reviews': storefront.postReview,
  'POST /api/notify-me': storefront.notifyMe,
  'POST /api/newsletter': storefront.newsletter,
  'POST /api/checkout': checkoutRoutes.checkout,
  'POST /api/checkout/confirm': checkoutRoutes.confirm,
  'POST /api/coupon/validate': checkoutRoutes.validateCoupon,
  'POST /api/admin/login': adminLogin,
};

/**
 * Signed-in endpoints, keyed by the first path segment after /api/admin/.
 * `role` is the minimum rank required — absent means any signed-in admin,
 * which covers the day-to-day work a staff account has to do.
 */
const ADMIN_ROUTES = {
  logout: { handler: adminLogout },
  me: { handler: adminMe },
  password: { handler: adminChangePassword },

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

/* ---------- the admin panel's own files ---------- */

/**
 * Serve admin/ui, gating the panel itself behind a session. The files ship
 * in the assets bundle but /admin* is claimed by this Worker, so they are
 * only ever handed out through here — the login page freely, the panel
 * only to someone signed in.
 */
async function serveAdminUi(ctx, url) {
  const { store, request, env } = ctx;
  const path = url.pathname;

  const asset = (file) => env.ASSETS.fetch(new URL(`/admin/ui/${file}`, url.origin));

  if (path === '/admin' || path === '/admin/') {
    return (await currentAdmin(store, request)) ? asset('index.html') : redirect('/admin/login');
  }
  if (path === '/admin/login') {
    return (await currentAdmin(store, request)) ? redirect('/admin') : asset('login.html');
  }

  // Anything else under /admin/ is a panel file (admin.js, admin.css,
  // views/*). The data directory is not in the bundle at all, so there is
  // nothing under /admin/data to leak.
  return asset(path.slice('/admin/'.length));
}

/* ---------- uploaded images, from R2 ---------- */

async function serveUpload(ctx, url) {
  const key = decodeURIComponent(url.pathname.slice('/uploads/'.length));
  if (!key) return notFound('Not found');

  const object = await ctx.env.UPLOADS.get(key);
  if (!object) return text('404 Not Found', 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  // Uploads are content-addressed by name and never rewritten in place,
  // so they can be cached hard.
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(object.body, { headers });
}

/* ---------- API dispatch ---------- */

async function dispatchApi(ctx, url) {
  const path = url.pathname;

  const publicRoute = PUBLIC_ROUTES[`${ctx.method} ${path}`];
  if (publicRoute) return publicRoute(ctx);

  // Customer accounts run their own session and gate, so they are
  // dispatched whole rather than listed route by route above.
  if (path.startsWith('/api/account/')) {
    const [section, ...parts] = path.slice('/api/account/'.length).split('/').filter(Boolean);
    return accounts.route({ ...ctx, parts }, section);
  }

  if (!path.startsWith('/api/admin/')) return notFound();

  const admin = await currentAdmin(ctx.store, ctx.request);
  if (!admin) return unauthorized();

  const [section, ...parts] = path.slice('/api/admin/'.length).split('/').filter(Boolean);
  const route = ADMIN_ROUTES[section];
  if (!route) return notFound();

  const denied = roleError(admin, route.role);
  if (denied) return json(denied.status, { error: denied.error });

  const response = await route.handler({ ...ctx, admin, parts });

  // Anything the panel *writes* can change what /api/nav and /api/catalogue
  // answer, so the edge copy goes when it does. One hook here rather than a
  // purge call sprinkled through every admin route.
  if (ctx.method !== 'GET' && response.ok) purgeCatalogueCache(ctx.ctx, ctx.url);

  return response;
}

/* ---------- entry ---------- */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const store = new Store(env);

    // The body is read once, here, because a Request body can only be
    // consumed a single time — route handlers receive the parsed object.
    // Only API routes carry one; an asset request must keep its body
    // stream intact for env.ASSETS.fetch().
    let body = {};
    if (HAS_BODY.has(request.method) && url.pathname.startsWith('/api/')) {
      try {
        body = await readJson(request);
      } catch {
        return json(400, { error: 'Malformed JSON body' });
      }
    }

    const requestCtx = {
      request, env, ctx, store, body,
      method: request.method,
      query: url.searchParams,
      url,
      parts: [],
    };

    try {
      if (url.pathname === '/uploads' || url.pathname.startsWith('/uploads/')) {
        return await serveUpload(requestCtx, url);
      }
      if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
        return await serveAdminUi(requestCtx, url);
      }
      if (url.pathname.startsWith('/api/')) {
        // The public read endpoints are served from the colo where one is
        // stored. A Worker response is not cached by the edge on its own —
        // see src/cache.js.
        const hit = await cachedResponse(request, url);
        if (hit) return hit;

        const response = await dispatchApi(requestCtx, url);
        return storeResponse(ctx, request, url, response);
      }
      // Not ours: hand it back to the static assets. Directory URLs get
      // their index.html here, because html_handling is off — the site
      // writes its links out in full and must not be redirected.
      if (url.pathname.endsWith('/')) {
        return env.ASSETS.fetch(new URL(url.pathname + 'index.html', url.origin));
      }
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error('[vayu]', request.method, url.pathname, '-', err.stack || err.message);
      return url.pathname.startsWith('/api/')
        ? json(500, { error: 'Server error: ' + err.message })
        : text('500 Server Error', 500);
    }
  },
};
