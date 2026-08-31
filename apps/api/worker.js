/**
 * Vayu API — api.vayuindia.com.
 *
 * The standalone fetch handler for the API Worker. It mounts the public
 * surface (catalogue, checkout, account, auth) and the admin surface
 * (/api/admin/*) from apps/api/index.js, which is the dispatcher shared with
 * the monolith mount so there is one route table, not two.
 *
 * Two isolation boundaries meet here, and they are different in kind:
 *
 *   Customers  reach this Worker cross-origin from the storefront. Their
 *              session cookie is host-only on api.vayuindia.com and the CORS
 *              gate names the storefront origin explicitly — never `*`,
 *              which a browser refuses to combine with credentials anyway.
 *
 *   Admins     do NOT reach this Worker from a browser. The admin panel
 *              calls its own origin, and the admin Worker forwards to
 *              /api/admin/* over a service binding. So an admin request
 *              arrives here already inside Cloudflare, carrying the internal
 *              header below rather than a cookie a browser could be tricked
 *              into sending. That removes admin routes from the CSRF surface
 *              entirely: there is no browser origin that can address them.
 *
 * A previous draft of this file had two copies of the same module merged
 * together — `withCors` and `preflight` were each declared twice and there
 * were two default exports, so it could not be bundled at all. This is the
 * single-copy version.
 */

import { preflight, withCors, isPreflight } from '#cloudflare/routes/cors.js';
import { internalCallVerified } from '#shared/config/index.js';
import * as api from '#apps/api/index.js';

// The internal check is imported rather than written here on purpose, and
// for two separate reasons. workerd treats every named export of an entry
// module as an entrypoint, so declaring the header name here would fail the
// Worker at startup. And the comparison itself is constant-time (see
// shared/config/index.js) — having one implementation means the admin Worker
// that stamps the header and the Worker that checks it cannot drift apart.
//
// The check is belt-and-braces — a service binding is not publicly
// addressable, so an attacker cannot call it at all. It earns its place
// because this Worker ALSO has a public route: without it, anyone could POST
// to api.vayuindia.com/api/admin/* directly and only the session gate behind
// would stand in the way.

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (isPreflight(request)) return preflight(env, request);

    if (!METHODS.has(request.method)) {
      return withCors(env, request, new Response('Method not allowed', { status: 405 }));
    }

    // Admin routes are reachable only over the service binding. Rejected
    // before the dispatcher so a public caller never even reaches the
    // session lookup, and gets the same answer whether or not the route
    // exists — a 404 rather than a 401, which would confirm the surface.
    if (url.pathname.startsWith('/api/admin/')) {
      if (!await internalCallVerified(env, request)) {
        return withCors(env, request, new Response('Not found', { status: 404 }));
      }
    }

    // apps/api/index.js builds its own Store from env.DB per request, so the
    // platform object carries only what SvelteKit would have supplied.
    const event = { request, url, platform: { env, ctx } };

    const handler = api[request.method];
    if (!handler) {
      return withCors(env, request, new Response('Method not allowed', { status: 405 }));
    }

    return handler(event);
  },
};
