/**
 * Vayu — the public API dispatcher.
 *
 * One entry point for every open endpoint the storefront calls
 * (catalogue, nav, track, notify-me, newsletter, checkout, coupon, account,
 * Better Auth, Google OAuth). Gated by Zod validation and CORS, then handed
 * to the same route tables the monolith used — only the import paths
 * changed.
 *
 * No admin routes live here. That is the isolation boundary: an admin
 * cookie (host-only on admin.vayuindia.com) is never even sent to this
 * Worker, and this Worker has no admin route table to match.
 */

import { json, notFound, unauthorized, readJson } from '#shared/utils/http.js';
import { cachedResponse, storeResponse, purgeCatalogueCache } from '#shared/utils/cache.js';
import { currentCustomer } from '#services/auth/sessions.js';
import { PUBLIC_ROUTES } from '#cloudflare/routes/tables.js';
import * as accounts from '#services/users/accounts.js';
import { validate } from '#shared/schemas/index.js';
import { getAuth, upgradeLegacyPassword } from '#services/auth/better-auth.js';

const HAS_BODY = new Set(['POST', 'PUT', 'PATCH']);

async function dispatch(event) {
  const { request, platform, url } = event;
  const env = platform?.env;
  if (!env?.DB) return json(503, { error: 'Bindings unavailable' });

  const method = request.method;
  const store = platform.store;
  const path = url.pathname;

  // Better Auth's own endpoints at /api/auth/* are handled first — Better
  // Auth ships a framework-agnostic handler that owns this path tree.
  if (path.startsWith('/api/auth/')) return handleAuth(event);

  let body = {};
  if (HAS_BODY.has(method)) {
    try { body = await readJson(request); }
    catch { return json(400, { error: 'Malformed JSON body' }); }
  }

  const checked = validate(method, path, body);
  if (!checked.ok) return json(400, { error: checked.error, issues: checked.issues });
  body = checked.value;

  const ctx = {
    request, env, ctx: platform.ctx, store, body, method,
    query: url.searchParams, url, parts: [],
  };

  const publicRoute = PUBLIC_ROUTES[`${method} ${path}`];
  if (publicRoute) return publicRoute(ctx);

  // The customer account tree. `me` is open so the storefront can ask
  // "who is this?" on every page without handling a 401.
  if (path.startsWith('/api/account/')) {
    const [section, ...parts] = path.slice('/api/account/'.length).split('/').filter(Boolean);
    const customer = await currentCustomer(store, request, env);
    return accounts.route({ ...ctx, parts, customer }, section);
  }

  return notFound();
}

/** Better Auth handler, lifted from the monolith's /api/auth/[...all] route. */
async function handleAuth(event) {
  const { request, platform, url } = event;
  const env = platform?.env;
  const auth = getAuth(env);

  const SIGN_IN_EMAIL = '/api/auth/sign-in/email';
  const isSignIn = request.method === 'POST' && url.pathname === SIGN_IN_EMAIL;
  let submitted = null;
  if (isSignIn) {
    try { submitted = await request.clone().json(); } catch { submitted = null; }
  }

  // GET /api/auth/sign-in/social (an <a> link) is converted to POST for
  // Better Auth, then the redirect URL it returns is followed.
  if (request.method === 'GET' && url.pathname === '/api/auth/sign-in/social') {
    const provider = url.searchParams.get('provider');
    const callbackURL = url.searchParams.get('callbackURL');
    if (provider) {
      const postReq = new Request(request.url, {
        method: 'POST', headers: request.headers,
        body: JSON.stringify({ provider, callbackURL }),
      });
      postReq.headers.set('content-type', 'application/json');
      const response = await auth.handler(postReq);
      if (response.ok) {
        const data = await response.clone().json().catch(() => null);
        if (data?.url) {
          const redir = new Response(null, { status: 302, headers: response.headers });
          redir.headers.set('Location', data.url);
          return redir;
        }
      }
      return response;
    }
  }

  const response = await auth.handler(request);

  if (isSignIn && response.ok && submitted?.password) {
    try {
      const body = await response.clone().json();
      const userId = body?.user?.id;
      if (userId) {
        platform.ctx.waitUntil(upgradeLegacyPassword(env, userId, submitted.password));
      }
    } catch (err) {
      console.error('[vayu] legacy password upgrade skipped', err);
    }
  }
  return response;
}

/** Edge cache only for the two cacheable GETs; everything else passes through. */
async function handle(event) {
  const { request, url, platform } = event;
  const hit = await cachedResponse(request, url);
  if (hit) return hit;
  const response = await dispatch(event);
  return storeResponse(platform.ctx, request, url, response);
}

export async function GET(event) { return handle(event); }
export async function POST(event) { return handle(event); }
export async function PUT(event) { return handle(event); }
export async function PATCH(event) { return handle(event); }
export async function DELETE(event) { return handle(event); }
