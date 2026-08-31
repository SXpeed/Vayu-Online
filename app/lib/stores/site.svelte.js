/**
 * Vayu — the site's shared reactive data.
 *
 * Replaces the window-backed data/store.js from the pre-SvelteKit build.
 * That file kept its state on `window` because app.js and each page bundle
 * were separate self-contained bundles and had to agree; under Vite there is
 * one module graph, so a plain rune is enough.
 *
 * Everything starts as the static data the site ships with, which is what
 * gets baked into the prerendered HTML. The admin panel's version is pulled
 * in after mount and swapped in — so a category added in /admin still shows
 * up on a page that was prerendered before it existed, exactly as it did
 * before the migration.
 */

import { staticCategories } from '#lib/data/static-taxonomy.js';
import {
    navResponse, catalogueResponse, pressResponse, eventsResponse, artistsResponse, parseOrNull,
} from '#shared/schemas/responses.js';

export const site = $state({
    categories: staticCategories,
    products: {},
    allProducts: [],
    content: null,
    /** Press coverage, once /api/press has answered; null until then. */
    press: null,
    /** The programme — both houses and their shows. Null until fetched. */
    venues: null,
    /** The people the shop names, in index order. Null until fetched. */
    artists: null,
    /** Shipping & Returns profiles; a product points at one by id. */
    shippingPresets: [],
});

/**
 * fetch → parsed JSON, or null on any failure.
 *
 * Returning null is deliberate: hydrateCatalogue() falls back to the static
 * catalogue, so a backend outage degrades the shop to a browsable set of
 * products rather than an empty page.
 *
 * What that fallback cost once: when every /api/catalogue read began throwing
 * a 500 in production, this swallowed it and the shop rendered stale static
 * products that could not be bought. A total backend failure presented as a
 * display bug — nothing in the page, the console or the deploy said otherwise.
 *
 * So the failure stays non-fatal but is no longer silent. It logs, and it
 * records onto window.__vayuApiFailures, so the outage is visible in the
 * console and to anything scripted against the page, instead of presenting
 * as a shop that merely looks out of date.
 */
const getJson = async (url) => {
    try {
        const res = await fetch(url);
        if (!res.ok) return apiFailed(url, `HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        return apiFailed(url, err?.message || String(err));
    }
};

/** Record and announce a failed API read, then degrade to static data. */
function apiFailed(url, reason) {
    console.error(
        `[vayu] ${url} failed (${reason}) — falling back to the static catalogue. ` +
        'Products shown may be stale and checkout will not work.',
    );
    if (typeof window !== 'undefined') {
        (window.__vayuApiFailures ??= []).push({ url, reason, at: Date.now() });
    }
    return null;
}

const flatten = (data) => Object.entries(data).flatMap(
    ([cat, items]) => items.map((p, idx) => ({ ...p, cat, idx })),
);

/* ---------- last known good ---------- */

/**
 * What this browser was shown last time, kept so a repeat visit does not
 * open on the shop as it was when the site was built.
 *
 * The prerendered pages ship with data/static-catalogue.js and
 * data/static-taxonomy.js baked in — seven categories and a set of products
 * that have not been the shop's for a long time. That is the right thing to
 * fall back to when the API is unreachable, but it was also what every
 * visitor saw for the first second or two of every visit, until
 * /api/catalogue answered and the page swapped underneath them. Worse than
 * looking wrong: the stale tiles are links, and a quick click landed on a
 * category that no longer exists.
 *
 * So the last good answer is kept here and painted straight away — no
 * network, no wait — and the fetch that follows corrects it. A returning
 * visitor now opens on what they last saw, which is almost always what is
 * still true. A visitor with nothing stored still gets the static data;
 * only a build-time snapshot of the live catalogue can fix that one, and
 * that is a deploy step rather than something the page can do.
 *
 * A day, because the point is to be right about "the shop as of recently",
 * not to serve an archive: past that the static fallback is no more wrong
 * than a week-old price, and both are replaced within the same second.
 */
const SNAPSHOT_KEY = 'vayu:last-good:v1';
const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

// localStorage is about 5MB for the whole origin, shared with the cart, the
// wishlist and the session id. A catalogue past this is not worth crowding
// them out for — it is a first-paint convenience, not storage.
const SNAPSHOT_MAX_BYTES = 700_000;

/** Read the stored snapshot, or {} — never throws, never blocks a render. */
function readSnapshot() {
    try {
        if (typeof localStorage === 'undefined') return {};
        const raw = localStorage.getItem(SNAPSHOT_KEY);
        if (!raw) return {};
        const snap = JSON.parse(raw);
        if (!snap?.at || Date.now() - snap.at > SNAPSHOT_TTL_MS) return {};
        return snap;
    } catch {
        return {};
    }
}

/** Merge into the stored snapshot. Silent on failure — this is a nicety. */
function writeSnapshot(patch) {
    try {
        if (typeof localStorage === 'undefined') return;
        const next = JSON.stringify({ ...readSnapshot(), ...patch, at: Date.now() });
        if (next.length > SNAPSHOT_MAX_BYTES) return;
        localStorage.setItem(SNAPSHOT_KEY, next);
    } catch { /* private window, quota, disabled storage — all fine */ }
}

/**
 * Paint the stored answer, if there is one.
 *
 * Only fills what has not already arrived: a hydrator that has already set
 * the real thing must not be walked back over by yesterday's copy.
 */
function applySnapshot(keys) {
    const snap = readSnapshot();
    let used = false;
    if (keys.includes('categories') && snap.categories && !navDone) {
        site.categories = snap.categories;
        used = true;
    }
    // Both guards test the hydrators rather than the values: `content: null`
    // is a real answer meaning "the shop has saved none", and a snapshot
    // that could not tell that apart from "not fetched yet" would put
    // yesterday's copy back over it.
    if (keys.includes('content') && snap.content !== undefined && !navDone && !catalogueDone) {
        site.content = snap.content;
        used = true;
    }
    if (keys.includes('products') && snap.products && !catalogueDone && !site.allProducts.length) {
        site.products = snap.products;
        site.allProducts = flatten(snap.products);
        used = true;
    }
    return used;
}

let navDone = null;
let catalogueDone = null;

/** Categories + editable copy. Small; every page can afford it after paint. */
export function hydrateNav() {
    // Before the fetch, not after it: the point is to be on screen while
    // the request is still in the air.
    applySnapshot(['categories', 'content']);
    navDone ??= getJson('/api/nav').then(raw => {
        const data = raw && parseOrNull(navResponse, raw, '/api/nav');
        if (!data?.categories) return false;
        site.categories = data.categories;
        site.content = data.content ?? null;
        writeSnapshot({ categories: data.categories, content: data.content ?? null });
        return true;
    });
    return navDone;
}

/** The full catalogue. Only pages that render products await this. */
export function hydrateCatalogue() {
    applySnapshot(['products', 'categories', 'content']);
    catalogueDone ??= getJson('/api/catalogue').then(async raw => {
        const data = raw && parseOrNull(catalogueResponse, raw, '/api/catalogue');
        if (!data?.products) {
            const { staticProductData } = await import('#lib/data/static-catalogue.js');
            site.products = staticProductData;
            site.allProducts = flatten(staticProductData);
            return false;
        }
        site.products = data.products;
        site.allProducts = flatten(data.products);
        if (data.categories) site.categories = data.categories;
        site.content = data.content ?? site.content;
        site.shippingPresets = data.shippingPresets ?? [];
        writeSnapshot({
            products: data.products,
            categories: data.categories ?? undefined,
            content: data.content ?? undefined,
        });
        return true;
    });
    return catalogueDone;
}

let pressDone = null;

/**
 * The press coverage, for the one page that lists it.
 *
 * Its own small endpoint rather than a field on the catalogue: see the note
 * on storefront.press for why the press page does not download the shop.
 *
 * Leaving `site.press` null when the table is empty is what lets the page
 * fall back to the static list it ships with, so an unseeded database
 * renders the coverage that was hard-coded before the admin screen existed
 * rather than an empty page.
 */
export function hydratePress() {
    pressDone ??= getJson('/api/press').then(raw => {
        const data = raw && parseOrNull(pressResponse, raw, '/api/press');
        site.press = data?.press?.length ? data.press : null;
        return Boolean(site.press);
    });
    return pressDone;
}

let eventsDone = null;

let artistsDone = null;

/**
 * The artists: everyone the shop names, in the order the index lists them.
 *
 * Only two pages ask for this — the artist index and an artist's own page —
 * so it is not folded into /api/nav, which every page pays for.
 */
export function hydrateArtists() {
    artistsDone ??= getJson('/api/artists').then(raw => {
        const data = raw && parseOrNull(artistsResponse, raw, '/api/artists');
        const list = data?.artists?.filter(a => a?.id) ?? [];
        site.artists = list.length ? list : null;
        return Boolean(site.artists);
    });
    return artistsDone;
}

/**
 * The programme: both houses, each with its shows, current first.
 *
 * Every page asks for this, because the MENU panel carries the two venue
 * cards on all of them. It is a small document — a handful of shows — and
 * it is edge-cached like the rest of the public reads, so the cost is one
 * conditional request rather than a query per visit.
 *
 * Left null when the table is empty so data/events.js can fall back to the
 * two shows the site ships with, exactly as it did before the panel could
 * edit them.
 */
export function hydrateEvents() {
    eventsDone ??= getJson('/api/events').then(raw => {
        const data = raw && parseOrNull(eventsResponse, raw, '/api/events');
        const list = data?.venues?.filter(v => v?.id) ?? [];
        site.venues = list.length ? list : null;
        return Boolean(site.venues);
    });
    return eventsDone;
}
