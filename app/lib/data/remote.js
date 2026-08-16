/**
 * Vayu — the two admin-backed endpoints, fetched lazily.
 *
 * This file replaces js/store-data.js, which did the same job with a
 * *top-level await* on /api/catalogue. Because catalogue.js, taxonomy.js,
 * product-card.js and nav-search.js all sat above it, that one await put a
 * D1-backed API call in front of the header, the footer, the menus and
 * script.js on every page of the site — /pages/legal.html included.
 *
 * Nothing here is awaited during boot. Both loaders are memoised promises
 * that a caller starts when it actually needs the data, and both resolve to
 * null when the API is unreachable so every caller falls back to the static
 * data shipped in data/static-*.js.
 *
 *   /api/nav        categories + editable site copy. Small, wanted on every
 *                   page (menus, announcement bar), fetched after paint.
 *   /api/catalogue  the whole product catalogue. Only the shop, product,
 *                   collection and search paths ask for it.
 *
 * A page that knows it needs the catalogue starts the request from an inline
 * snippet in its <head> (see scripts/build.mjs), which parks the promise on
 * window.__vayuCatalogue. That keeps the fetch at depth 1 from the HTML —
 * in parallel with app.js rather than behind it.
 */

/** fetch → parsed JSON, or null on any failure. Never throws. */
async function getJson(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

let navPromise = null;
let cataloguePromise = null;

/** `{ categories, content }` — the small payload every page can use. */
export function loadNav() {
    navPromise ??= (window.__vayuNav || getJson('/api/nav'))
        .then(data => (data && data.categories ? data : null))
        .catch(() => null);
    return navPromise;
}

/** `{ products, categories, journal, content }` — catalogue pages only. */
export function loadCatalogue() {
    cataloguePromise ??= (window.__vayuCatalogue || getJson('/api/catalogue'))
        .then(data => (data && data.products && data.categories ? data : null))
        .catch(() => null);
    return cataloguePromise;
}
