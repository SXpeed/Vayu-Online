/**
 * Vayu — server hooks.
 *
 * Two jobs: fold www onto the bare domain, and serve the home page for "/".
 *
 * Workers Assets runs with html_handling "none", because every link on this
 * site is written out in full ("/pages/cart.html") and the default would 307
 * each of them to an extensionless URL. The cost of turning it off is that
 * "/" no longer resolves to index.html on its own, and SvelteKit will not
 * render a prerendered route at request time either — so the bare domain
 * 404s unless someone maps it, which is what this does.
 *
 * Skipped while prerendering: that runs in Node with no bindings, and "/" is
 * being written out as a file there rather than served.
 */

import { building } from '$app/environment';
import { Store } from '#lib/server/db.js';

export async function handle({ event, resolve }) {
    // www folds onto the apex, permanently. Both hostnames are custom
    // domains on the same Worker — without this they would serve identical
    // pages under two names and split every URL in the shop in two. It is
    // done here rather than as a Cloudflare Redirect Rule so the behaviour
    // lives with the code and survives a rebuild from a clean checkout.
    // Matching on the "www." prefix leaves localhost and *.workers.dev alone.
    if (!building && event.url.hostname.startsWith('www.')) {
        const target = new URL(event.url);
        target.hostname = event.url.hostname.slice(4);
        return Response.redirect(target, 301);
    }

    if (event.url.pathname === '/index.html') {
        return Response.redirect(new URL('/', event.url.origin), 302);
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
        } catch {
            // Vite dev fallback
        }
    }
    const response = await resolve(event);

    // ---- the redirects table ----------------------------------------
    //
    // Consulted only on a 404 — the one case where a redirect can still
    // help, and the only way to use the table without adding a query to
    // every request on the site.
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

/**
 * Every uncaught server error, in the logs with enough context to act on.
 *
 * This exists because of how the catalogue outage presented. The Worker was
 * deployed ahead of its database — five migrations were applied locally and
 * none of them remotely — so `loadProducts` asked production for
 * `product_specs`, a table that only existed on the developer's machine.
 * D1 threw, SvelteKit caught it, and every caller got exactly this:
 *
 *     {"status":500,"message":"Internal Error"}
 *
 * No table name, no SQL, nothing in the dashboard. The storefront's fetch
 * helper turns a non-ok response into `null` and falls back to the static
 * catalogue, so the shop still rendered — with stale products that could
 * not be bought. A total backend failure looked like a display bug.
 *
 * `handleError` only runs for *uncaught* errors, so nothing that already
 * returns a 4xx passes through here; this is the unexpected-failure path.
 * The message is logged rather than returned — a SQL error naming columns
 * is not something to hand an anonymous caller — and the id that is
 * returned is what ties a user's report to the logged line.
 */
export function handleError({ error, event, status, message }) {
    // 404s are routing noise, not failures worth a log line each.
    if (status === 404) return { message, id: '' };

    const id = crypto.randomUUID().slice(0, 8);

    console.error(JSON.stringify({
        id,
        status,
        method: event.request.method,
        path: event.url.pathname,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
    }));

    return { message: 'Internal Error', id };
}

/** An active row in the redirects table matching this path, or null. */
async function tableRedirect(event) {
    try {
        const store = new Store(event.platform.env);
        return await store.one(
            'SELECT to_path, status FROM redirects WHERE from_path = ? AND active = 1',
            event.url.pathname,
        );
    } catch {
        return null;
    }
}