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
 * THE EDGE CACHES; THE BROWSER DOES NOT. That asymmetry is the whole point,
 * and the previous policy — `max-age=60, stale-while-revalidate=86400` — got
 * it wrong in a way that took a day to wash out.
 *
 * purgeCatalogueCache() below clears this colo's entry when an admin writes,
 * and the comment here used to claim it purged "both". It cannot. A purge
 * reaches Cloudflare; it has no way to reach a copy already sitting in
 * somebody's browser. So every directive aimed at the browser is a promise
 * that the shop's own data may be wrong for that long — and
 * stale-while-revalidate has no shared-cache-only spelling, so that 86400
 * applied to browsers as much as to the edge. A visitor could be shown a
 * day-old shipping rate, and be shown it INSTANTLY, because SWR serves the
 * stale body first and revalidates afterwards. That is exactly how a cart
 * came to quote ₹150 when the shop had set ₹1.
 *
 *   max-age=0, must-revalidate   the browser may keep a copy but must ask
 *                                before using it. The ask is answered by the
 *                                colo, not by D1.
 *   s-maxage=1800                the edge still serves it for half an hour
 *                                without waking the Worker, which is where
 *                                the saving actually came from.
 *   no stale-while-revalidate    deliberately. There is no way to grant it
 *                                to the edge alone, and granting it to
 *                                browsers is the bug above.
 *
 * It is stamped on the way out because the header set by the route handler
 * does not survive the trip through SvelteKit's response pipeline — the
 * catalogue was going out as `no-store` and every visitor was reaching D1.
 * Setting it next to the code that depends on it means the two cannot drift.
 */
export const CACHE_POLICY = 'public, max-age=0, must-revalidate, s-maxage=1800';

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
