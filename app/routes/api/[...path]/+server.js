/**
 * Vayu — every /api/* route, in one endpoint.
 *
 * The pre-SvelteKit Worker already had a complete router: two route tables
 * keyed by "METHOD /path", a customer-session gate for /api/account/*, and a
 * role gate for /api/admin/*. Splitting that into thirty-six +server.js files
 * would have meant thirty-six chances to change a gate by accident, so the
 * dispatcher is reused as-is and this file only adapts the calling
 * convention: SvelteKit hands us `platform.env` where the Worker had `env`.
 *
 * Zod validation happens here, once, in front of the whole surface — see
 * lib/schemas. A handler is never reached with a body it did not expect.
 */

import { json as sveltejson, error } from '@sveltejs/kit';
import { Store } from '#lib/server/db.js';
import { json, notFound, unauthorized, readJson } from '#lib/server/http.js';
import { currentAdmin, roleError } from '#lib/server/sessions.js';
import { accessGate } from '#services/auth/access.js';
import { cachedResponse, storeResponse, purgeCatalogueCache } from '#lib/server/cache.js';
import { PUBLIC_ROUTES, ADMIN_ROUTES } from '#lib/server/routes.js';
import * as accounts from '#lib/server/accounts.js';
import { validate } from '#shared/schemas/index.js';

const HAS_BODY = new Set(['POST', 'PUT', 'PATCH']);

async function dispatch(event) {
    const { request, platform, url } = event;
    const env = platform?.env;
    if (!env?.DB) error(503, 'Bindings unavailable — run through wrangler, not `vite dev`.');

    const method = request.method;
    const store = new Store(env);
    const path = url.pathname;

    let body = {};
    if (HAS_BODY.has(method)) {
        try {
            body = await readJson(request);
        } catch {
            return json(400, { error: 'Malformed JSON body' });
        }
    }

    // One validation gate in front of every write. `validate` returns the
    // parsed value, so a handler downstream reads only fields that survived
    // the schema — the hand-rolled cleanText/clamp calls in the handlers stay
    // as a second line of defence rather than the only one.
    const checked = validate(method, path, body);
    if (!checked.ok) return json(400, { error: checked.error, issues: checked.issues });
    body = checked.value;

    const ctx = {
        request, env, ctx: platform.ctx, store, body, method,
        query: url.searchParams, url, parts: [],
    };

    const publicRoute = PUBLIC_ROUTES[`${method} ${path}`];
    if (publicRoute) return publicRoute(ctx);

    if (path.startsWith('/api/account/')) {
        const [section, ...parts] = path.slice('/api/account/'.length).split('/').filter(Boolean);
        return accounts.route({ ...ctx, parts }, section);
    }

    if (!path.startsWith('/api/admin/')) return notFound();

    // Zero Trust in front of the admin API, not only the panel that calls it.
    // Without this, turning Access on would gate /admin/* — the HTML and the
    // scripts — while every endpoint they drive stayed reachable on the
    // session cookie alone, which is half a perimeter.
    //
    // Same-origin, so the browser sends Access's CF_Authorization cookie here
    // exactly as it does to the panel. Inert until Access is configured:
    // accessGate returns null when ACCESS_TEAM_DOMAIN and ACCESS_AUD are both
    // unset, so this changes nothing on a deployment that is not using it.
    //
    // Deliberately NOT added to cloudflare/routes/admin.js: that dispatcher
    // runs on the split api Worker, which apps/admin/worker.js reaches over a
    // service binding. Such a call carries no hostname and no Access JWT, so
    // the same gate there would reject the panel's own traffic.
    const forbidden = await accessGate(env, request, (reason) => {
        console.log(`access denied: ${reason} ${method} ${path}`);
    });
    if (forbidden) return forbidden;

    const admin = await currentAdmin(store, request);
    if (!admin) return unauthorized();

    const [section, ...parts] = path.slice('/api/admin/'.length).split('/').filter(Boolean);
    const route = ADMIN_ROUTES[section];
    if (!route) return notFound();

    const denied = roleError(admin, route.role);
    if (denied) return json(denied.status, { error: denied.error });

    const response = await route.handler({ ...ctx, admin, parts });

    // Anything the panel writes can change what /api/nav and /api/catalogue
    // answer, so the edge copy goes when it does.
    if (method !== 'GET' && response.ok) purgeCatalogueCache(platform.ctx, url);

    return response;
}

/** GET is the only method the edge cache serves; see lib/server/cache.js. */
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
