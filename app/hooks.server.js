/**
 * Vayu — server hooks.
 *
 * One job: serve the home page for a bare "/".
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

export async function handle({ event, resolve }) {
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
    return resolve(event);
}
