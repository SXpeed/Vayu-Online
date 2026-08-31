/**
 * Vayu — storefront app (vayuindia.com).
 *
 * The customer website. Its pages are prerendered static HTML served by
 * Workers Assets; the only dynamic code is the hooks that fold www onto the
 * apex, serve "/" as index.html, and consult the redirects table on a 404.
 *
 * The storefront does NOT talk to the services directly. Catalogue, nav,
 * track, wishlist and checkout all go to the API app over the network:
 *
 *   - In production: api.vayuindia.com (cross-origin, credentialed).
 *   - In dev: same-origin relative paths, when the API is mounted on the
 *     same Worker via the storefront's wrangler.toml service binding.
 *
 * The prerendered HTML's <script> tags therefore call a relative /api/*
 * which, in production, is rewritten at the edge to api.vayuindia.com by a
 * Cloudflare Redirect/Rule, OR the storefront Worker proxies /api/* to the
 * API service binding. The proxy is here so the storefront's existing
 * relative fetches keep working without a front-end rewrite.
 */

import { building } from '$app/environment';
import { Store } from '#shared/database/store.js';

export async function handle({ event, resolve }) {
  // www folds onto the apex, permanently. Matching on the "www." prefix
  // leaves localhost and *.workers.dev alone.
  if (!building && event.url.hostname.startsWith('www.')) {
    const target = new URL(event.url);
    target.hostname = event.url.hostname.slice(4);
    return Response.redirect(target, 301);
  }

  if (event.url.pathname === '/index.html') {
    return Response.redirect(new URL('/', event.url.origin), 302);
  }

  // Proxy /api/* to the API service binding. The storefront's prerendered
  // pages call /api/catalogue etc. with same-origin credentials; in the
  // split architecture the API lives on api.vayuindia.com, so this keeps
  // those calls working without rewriting every page's fetch URLs.
  if (!building && event.url.pathname.startsWith('/api/') && event.platform?.env?.API) {
    const url = new URL(event.url.pathname + event.url.search, event.url.origin);
    const init = {
      method: event.request.method,
      headers: event.request.headers,
      body: ['GET', 'HEAD'].includes(event.request.method) ? undefined : event.request.body,
      redirect: 'manual',
    };
    return event.platform.env.API.fetch(url.toString(), init);
  }

  if (!building && event.url.pathname === '/') {
    try {
      const asset = await event.platform?.env?.ASSETS?.fetch(
        new URL('/index.html', event.url.origin),
      );
      if (asset?.ok) {
        return new Response(asset.body, {
          status: 200,
          headers: { ...Object.fromEntries(asset.headers), 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
    } catch { /* Vite dev fallback */ }
  }

  const response = await resolve(event);

  // The redirects table, consulted only on a 404.
  if (!building && response.status === 404 && event.platform?.env?.DB) {
    const hit = await tableRedirect(event);
    if (hit) {
      return new Response(null, {
        status: hit.status === 302 ? 302 : 301,
        headers: { Location: hit.to_path },
      });
    }
  }
  return response;
}

export function handleError({ error, event, status, message }) {
  if (status === 404) return { message, id: '' };
  const id = crypto.randomUUID().slice(0, 8);
  console.error(JSON.stringify({
    id, status, method: event.request.method, path: event.url.pathname,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  }));
  return { message: 'Internal Error', id };
}

async function tableRedirect(event) {
  try {
    const store = new Store(event.platform.env);
    return await store.one(
      'SELECT to_path, status FROM redirects WHERE from_path = ? AND active = 1',
      event.url.pathname,
    );
  } catch { return null; }
}
