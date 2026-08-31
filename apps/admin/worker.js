/**
 * Vayu admin panel — admin.vayuindia.com.
 *
 * Serves the vanilla-JS panel from app/admin-ui/ behind two gates, and
 * forwards everything under /api/ to the API Worker over a service binding.
 *
 * THE TWO GATES, outermost first:
 *
 *   Cloudflare Access  answers "may this person reach the admin panel at
 *                      all". It runs at the edge and is re-checked here from
 *                      the JWT it stamps, because Access is bound to a
 *                      hostname and this Worker answers on more than one —
 *                      see services/auth/access.js. Off until
 *                      ACCESS_TEAM_DOMAIN and ACCESS_AUD are both set, which
 *                      is what dev wants.
 *
 *   The admin session  answers "which admin is this, and what may they do".
 *                      A password, a row in D1, revocable server-side.
 *
 * Two questions, two answers. Neither is a substitute for the other, and
 * losing either one should not be enough on its own.
 *
 * THE SESSION MODEL, which is the point of the whole split:
 *
 *   The admin cookie is host-only on admin.vayuindia.com. It is set by a
 *   Set-Cookie that travels back out through the proxy below, so the browser
 *   attributes it to THIS origin — never to api.vayuindia.com. A customer
 *   browsing the storefront therefore has no cookie that can reach an admin
 *   route, and an admin's cookie is never sent to the public API by any
 *   browser, because host-only cookies are not shared between subdomains.
 *
 *   The API Worker still validates that cookie: the proxy forwards the whole
 *   request, headers included, so `currentAdmin` on the far side reads the
 *   same token out of the same D1 sessions table. One session row, one
 *   cookie, two Workers — and no browser-reachable admin surface on the API.
 *
 * WHY PROXY RATHER THAN CALL THE API CROSS-ORIGIN:
 *
 *   The panel's client already calls a relative '/api/admin/' + path (see
 *   app/admin-ui/lib/api.js). Proxying means that code needs no change at
 *   all, admin traffic never becomes a cross-origin request, and there is no
 *   CORS allowance for the admin origin to get wrong. It also keeps
 *   /api/admin/* off the public internet: the API Worker rejects any admin
 *   request that does not carry the internal header stamped below.
 *
 * The panel's files are bundled into this Worker rather than published as
 * assets — see the virtual:admin-ui plugin in scripts/build-workers.mjs for
 * why that distinction is load-bearing.
 */

import { Store } from '#shared/database/store.js';
import { currentAdmin } from '#services/auth/sessions.js';
import { accessGate } from '#services/auth/access.js';
import { adminRoute, contentTypeFor, PANEL_CACHE_CONTROL } from '#services/auth/admin-gate.js';
import { INTERNAL_HEADER } from '#shared/config/index.js';
import FILES from 'virtual:admin-ui';

const redirect = (location) => new Response(null, { status: 302, headers: { Location: location } });

const notFound = () => new Response('Not found', { status: 404 });

function send(file) {
  const body = FILES[file];
  if (body === undefined) return notFound();
  return new Response(body, {
    headers: {
      'Content-Type': contentTypeFor(file),
      'Cache-Control': PANEL_CACHE_CONTROL,
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ---- Zero Trust ------------------------------------------------
    // Ahead of everything, the /api/ proxy included: the panel's own XHR
    // calls carry the Access cookie like any other same-origin request, and
    // a gate that covered the HTML but not the API it talks to would be
    // decorative. A no-op until Access is configured.
    const denied = await accessGate(env, request, (reason) => {
      console.log(`access denied: ${reason} ${request.method} ${path}`);
    });
    if (denied) return denied;

    // ---- proxy to the API Worker -----------------------------------
    if (path.startsWith('/api/')) {
      if (!env.API) return new Response('API binding unavailable', { status: 503 });

      // A fresh Request so the internal header can be added: Request headers
      // are immutable once constructed, and mutating the original throws.
      const forwarded = new Request(request);
      forwarded.headers.set(INTERNAL_HEADER, env.INTERNAL_SECRET || '');
      return env.API.fetch(forwarded);
    }

    if (!env?.DB) return new Response('Bindings unavailable', { status: 503 });

    // The bare origin is the panel, not a 404 — admin.vayuindia.com/ is what
    // an admin will actually type.
    if (path === '/') return redirect('/admin');

    if (path !== '/admin' && !path.startsWith('/admin/')) return notFound();

    const store = new Store(env);
    const signedIn = await currentAdmin(store, request);

    // The routing decision itself is shared with the monolith's mount of the
    // same panel (app/routes/admin/[...path]) — one policy, two adapters.
    const route = adminRoute(path, signedIn);
    if (route.kind === 'redirect') return redirect(route.to);
    if (route.kind === 'notFound') return notFound();
    return send(route.file);
  },
};
