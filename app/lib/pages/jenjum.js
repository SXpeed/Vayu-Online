/**
 * Vayu — /pages/jenjum.html.
 *
 * Lifted verbatim out of the page's inline <script type="module">. It used
 * to import straight from /js/, so every one of those imports was another
 * level of request chaining hanging off the HTML. It is now a bundled chunk
 * that app.js imports only when <body data-page="jenjum">.
 */

import { productCardHTML, bindProductTiles } from '../product-card.js';
import { hydrateCatalogue } from '#lib/stores/site.svelte.js';

await hydrateCatalogue();

/* Name the collection after the artist, taking the name from the page
   heading so it is never duplicated in the source. Renaming the
   artist in the <h1> renames this section too. */
const artist = document.querySelector('.jenjum-title')?.textContent.trim();
const heading = document.getElementById('capsuleHeading');
if (artist && heading) heading.textContent = `${artist} Collection`;

/* The capsule, as [category, index] pairs into the catalogue. Kept as
   references rather than copied product data so a price or image edited
   in catalogue.js reaches this page too. */
const capsule = [
    ['fashion', 0],
    ['fashion', 3],
    ['furniture', 0],
    ['decor', 0]
];

/* The shared tile from js/product-card.js — the same card the
   collection grid and "You May Also Like" render. This page used to
   carry its own copy, which had drifted: its buttons fired no toast,
   so a tap here gave no confirmation that anything had happened. */
const grid = document.getElementById('jenjumGrid');
if (grid) {
    grid.innerHTML = capsule.map(([cat, idx]) => productCardHTML(cat, idx)).join('');
    bindProductTiles(grid, (msg) => window.showToast?.(msg));
}
