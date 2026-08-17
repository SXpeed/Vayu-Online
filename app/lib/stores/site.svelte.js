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
import { navResponse, catalogueResponse, parseOrNull } from '#lib/schemas/responses.js';

export const site = $state({
    categories: staticCategories,
    products: {},
    allProducts: [],
    content: null,
    journal: null,
    /** Shipping & Returns profiles; a product points at one by id. */
    shippingPresets: [],
});

const getJson = async (url) => {
    try {
        const res = await fetch(url);
        return res.ok ? await res.json() : null;
    } catch {
        return null;
    }
};

const flatten = (data) => Object.entries(data).flatMap(
    ([cat, items]) => items.map((p, idx) => ({ ...p, cat, idx })),
);

let navDone = null;
let catalogueDone = null;

/** Categories + editable copy. Small; every page can afford it after paint. */
export function hydrateNav() {
    navDone ??= getJson('/api/nav').then(raw => {
        const data = raw && parseOrNull(navResponse, raw, '/api/nav');
        if (!data?.categories) return false;
        site.categories = data.categories;
        site.content = data.content ?? null;
        return true;
    });
    return navDone;
}

/** The full catalogue. Only pages that render products await this. */
export function hydrateCatalogue() {
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
        site.journal = data.journal?.length ? data.journal : null;
        site.shippingPresets = data.shippingPresets ?? [];
        return true;
    });
    return catalogueDone;
}
