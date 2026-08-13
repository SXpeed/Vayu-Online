/**
 * Vayu — the bridge to js/script.js.
 *
 * script.js is a classic script and cannot import, so the catalogue, the
 * taxonomy, the shared product tile and the cart/wishlist helpers are
 * handed to it through globals. publishGlobals() must run before
 * script.js is appended to the page.
 */

import { productData } from '../catalogue.js';
import { addToCart, toggleWishlist, isInWishlist } from '../shop.js';
import { categories, categoryTitle, subToSlug, slugToLabel } from '../taxonomy.js';
import { productCardHTML, bindProductTiles } from '../product-card.js';

export function publishGlobals() {
    window.vayuCatalogue = productData;
    window.vayuShop = { addToCart, toggleWishlist, isInWishlist };
    window.vayuTaxonomy = { categories, categoryTitle, subToSlug, slugToLabel };
    window.vayuProductCard = { productCardHTML, bindProductTiles };
}

/** Mobile browsers colour their chrome from this. */
export function ensureThemeColor(color = '#ffffff') {
    if (document.querySelector('meta[name="theme-color"]')) return;
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = color;
    document.head.appendChild(meta);
}
