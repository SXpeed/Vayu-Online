/**
 * Vayu — edge caching for the two public read endpoints.
 *
 * A `Cache-Control` header on its own does nothing here. Responses a Worker
 * *generates* are not stored in Cloudflare's cache automatically the way a
 * static asset is — the header only ever reached the visitor's browser, so
 * every cold visitor cost a round trip to D1 for a catalogue that is the
 * same for everybody. Going through the Cache API is what actually puts the
 * answer in the colo.
 *
 * Only GET, only the endpoints listed in CACHEABLE, and never anything that
 * carries a session: /api/account/* and /api/admin/* are not routed through
 * here at all, and the guard below refuses a request with a cookie as a
 * second line of defence.
 */

/** Path → cacheable. Nothing personalised may ever appear in this list. */
export const CACHEABLE = new Set(['/api/catalogue', '/api/nav']);

/**
 * The policy, applied here rather than trusted from the handler.
 *
 * `s-maxage` is what the edge honours, `max-age` the visitor's own browser,
 * and an admin write purges both entries immediately (see purgeCatalogueCache
 * below) so the stale window is a safety net rather than the mechanism.
 *
 * It is stamped on the way out because the header set by the route handler
 * does not survive the trip through SvelteKit's response pipeline — the
 * catalogue was going out as `no-store` and every visitor was reaching D1.
 * Setting it next to the code that depends on it means the two cannot drift.
 */
export const CACHE_POLICY = 'public, max-age=60, s-maxage=1800, stale-while-revalidate=86400';

/**
 * Look for a stored copy.
 *
 * Returns null on a miss, or when the request is not one we may cache.
 */
export async function cachedResponse(request, url) {
    if (request.method !== 'GET' || !CACHEABLE.has(url.pathname)) return null;
    if (request.headers.has('cookie')) return null;
    if (typeof caches === 'undefined' || !caches.default) return null;

    const hit = await caches.default.match(request);
    if (!hit) return null;

    const headers = new Headers(hit.headers);
    headers.set('CF-Cache-Status-Vayu', 'HIT');
    return new Response(hit.body, { status: hit.status, headers });
}

/**
 * Store a fresh response, if it is one we may cache. The body has to be
 * cloned before it is handed to the visitor, and the write is handed to
 * waitUntil so nobody waits for it.
 */
export function storeResponse(ctx, request, url, response) {
    if (request.method !== 'GET' || !CACHEABLE.has(url.pathname)) return response;
    if (request.headers.has('cookie')) return response;
    if (!response.ok) return response;

    const headers = new Headers(response.headers);
    headers.set('Cache-Control', CACHE_POLICY);
    const cacheable = new Response(response.body, { status: response.status, headers });

    if (typeof caches !== 'undefined' && caches.default) {
        const putPromise = caches.default.put(request, cacheable.clone());
        if (ctx && typeof ctx.waitUntil === 'function') {
            ctx.waitUntil(putPromise);
        }
    }
    return cacheable;
}

/**
 * Drop both endpoints from this colo's cache.
 *
 * Called after every admin write. It is a colo-local purge — the edge is
 * not one shared cache — which is why the responses also carry a bounded
 * `s-maxage` rather than relying on this alone: an editor sees their change
 * immediately in the colo they are working from, and every other colo
 * catches up within the half hour. A global purge would mean the Cloudflare
 * cache-purge API and an API token in the Worker; that is a worthwhile
 * change the day the catalogue is edited from several places at once, and
 * overkill before then.
 */
export function purgeCatalogueCache(ctx, url) {
    if (typeof caches === 'undefined' || !caches.default) return;
    for (const path of CACHEABLE) {
        const deletePromise = caches.default.delete(new URL(path, url.origin).toString());
        if (ctx && typeof ctx.waitUntil === 'function') {
            ctx.waitUntil(deletePromise);
        }
    }
}
