/**
 * Vayu storefront — vayuindia.com.
 *
 * The customer website. Serves prerendered HTML from Workers Assets, with
 * `hooks.server` folding www onto the apex, mapping "/" to index.html, and
 * consulting the redirects table on a 404 — exactly what the monolith's
 * app/hooks.server.js did. No API routes: the storefront calls the API
 * cross-origin at api.vayuindia.com (or same-origin in dev).
 *
 * Deployed as a SvelteKit Workers project from the existing app/ directory;
 * this file is the conceptual entry point and documents the boundary. The
 * real worker is emitted by adapter-cloudflare from app/.
 */

// The SvelteKit app in app/ is the storefront. Its hooks.server.js, after
// the refactor, imports from the new service/shared paths:
//   #lib/server/db.js  -> #shared/database/store.js
//   #lib/server/http.js -> #shared/utils/http.js
//   #lib/server/cache.js -> #shared/utils/cache.js
// (see the import-rewrite section of the refactor).
//
// Bindings (wrangler.toml):
//   DB, ASSETS, PUBLIC_ORIGIN, API_ORIGIN, BETTER_AUTH_SECRET,
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (optional).

export {};

/**
 * Vayu — the storefront worker (vayuindia.com).
 *
 * A thin edge app: every page is prerendered static HTML served from the
 * ASSETS binding, and every /api/* request is proxied to the API worker at
 * API_ORIGIN. The storefront holds no business logic and no session state of
 * its own — the customer session cookie lives on api.vayuindia.com and is
 * sent to the API on credentialed fetches.
 *
 * The www → apex fold and the bare-domain "/" mapping live here, exactly as
 * they did in app/hooks.server.js, so the behaviour travels with the code.
 */

const API_ORIGIN = (env) => env.API_ORIGIN || '';

/** Same-origin relative paths the storefront proxies to the API. */
function isApiPath(path) {
  return path.startsWith('/api/');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // www folds onto the apex, permanently.
    if (url.hostname.startsWith('www.')) {
      const target = new URL(url);
      target.hostname = url.hostname.slice(4);
      return Response.redirect(target, 301);
    }

    if (url.pathname === '/index.html') {
      return Response.redirect(new URL('/', url.origin), 302);
    }

    // Bare domain → index.html (html_handling is "none", so "/" needs a map).
    if (url.pathname === '/') {
      const asset = await env.ASSETS?.fetch(new URL('/index.html', url.origin));
      if (asset?.ok) {
        return new Response(asset.body, {
          status: 200,
          headers: { ...Object.fromEntries(asset.headers), 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
    }

    // Proxy /api/* to the API origin, forwarding cookies so the session on
    // api.vayuindia.com is presented. The response is passed back verbatim;
    // CORS headers from the API already name this origin.
    if (isApiPath(url.pathname)) {
      const target = new URL(url.pathname + url.search, API_ORIGIN(env) || url.origin);
      const headers = new Headers(request.headers);
      headers.set('host', target.host);
      return fetch(target, { method: request.method, headers, body: request.body, redirect: 'manual' });
    }

    // Everything else is a static asset.
    return env.ASSETS.fetch(request);
  },
};
