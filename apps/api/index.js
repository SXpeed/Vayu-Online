/**
 * Vayu — API app (api.vayuindia.com).
 *
 * The single API Worker for both the public and the admin surfaces. It is
 * the only app that talks to the services directly; the storefront and
 * admin apps reach the API over the network (fetch / a service binding).
 *
 * Routing here is deliberately the same dispatcher the monolith used — the
 * two route tables in cloudflare/routes/tables.js keyed by
 * "METHOD /path" — so the surface and the role ranks are exactly what they
 * were. The change is the wrapping: a CORS pre-flight gate, then the
 * dispatcher, then CORS headers stamped on the way out.
 */

import { Store } from '#shared/database/store.js';
import { json, notFound, unauthorized, readJson } from '#shared/utils/http.js';
import { cachedResponse, storeResponse, purgeCatalogueCache } from '#shared/utils/cache.js';
import { currentAdmin, roleError } from '#services/auth/sessions.js';
import { PUBLIC_ROUTES, ADMIN_ROUTES } from '#cloudflare/routes/tables.js';
import * as accounts from '#services/users/accounts.js';
import { isPreflight, preflight, withCors } from '#cloudflare/routes/cors.js';
import { paymentsWebhook } from '#services/payments/index.js';

const HAS_BODY = new Set(['POST', 'PUT', 'PATCH']);

async function dispatch(event) {
  const { request, platform, url } = event;
  const env = platform?.env;
  if (!env?.DB) return json(503, { error: 'Bindings unavailable — run through wrangler.' });

  const method = request.method;
  const store = new Store(env);
  const path = url.pathname;

  // The Razorpay webhook is signed, not session-authed, and sits outside the
  // /api/* table. Routed first so it never touches the body parser below.
  if (path === '/payments/webhook') return paymentsWebhook({ env, request, store });

  let body = {};
  if (HAS_BODY.has(method)) {
    try { body = await readJson(request); }
    catch { return json(400, { error: 'Malformed JSON body' }); }
  }

  const ctx = { request, env, ctx: platform.ctx, store, body, method, query: url.searchParams, url, parts: [] };

  const publicRoute = PUBLIC_ROUTES[`${method} ${path}`];
  if (publicRoute) return publicRoute(ctx);

  if (path.startsWith('/api/account/')) {
    const [section, ...parts] = path.slice('/api/account/'.length).split('/').filter(Boolean);
    return accounts.route({ ...ctx, parts }, section);
  }

  if (!path.startsWith('/api/admin/')) return notFound();

  const admin = await currentAdmin(store, request);
  if (!admin) return unauthorized();

  const [section, ...parts] = path.slice('/api/admin/'.length).split('/').filter(Boolean);
  const route = ADMIN_ROUTES[section];
  if (!route) return notFound();

  const denied = roleError(admin, route.role);
  if (denied) return json(denied.status, { error: denied.error });

  const response = await route.handler({ ...ctx, admin, parts });

  // An admin write can change what /api/nav and /api/catalogue answer, so
  // the edge copy in this colo goes when it does.
  if (method !== 'GET' && response.ok) purgeCatalogueCache(platform.ctx, url);

  return response;
}

/** GET is the only method the edge cache serves; see shared/utils/cache.js. */
async function handle(event) {
  const { request, url, platform } = event;
  const env = platform?.env;

  if (isPreflight(request)) return preflight(env, request);

  const hit = await cachedResponse(request, url);
  if (hit) return withCors(env, request, hit);

  const response = await dispatch(event);
  const stored = storeResponse(platform.ctx, request, url, response);
  return withCors(env, request, stored);
}

export async function GET(event) { return handle(event); }
export async function POST(event) { return handle(event); }
export async function PUT(event) { return handle(event); }
export async function PATCH(event) { return handle(event); }
export async function DELETE(event) { return handle(event); }
export async function OPTIONS(event) { return preflight(event.platform?.env, event.request); }
