/**
 * Vayu — /pages/curated-spaces.html.
 *
 * The third page in the `.g-*` editorial language, after the store and the
 * gallery. It differs from those two in what fills its shopping rail: they
 * each show one curated list from data/events.js, because each is one show
 * with pieces chosen for it. A space is not a show — it is a room, and the
 * room is furnished from the categories it is made of.
 *
 * So the rail is built from the catalogue rather than from a hand-written
 * list: every space names its category, and the tiles come from there. That
 * means a piece added to Furniture in the admin panel appears under The
 * Living Room without anyone remembering to add it twice.
 */

import { site, hydrateCatalogue } from '#lib/stores/site.svelte.js';
import { renderProductCards, bindProductTiles } from '../product-card.js';
import { showToast } from '../core/toast.js';
import { initLightbox } from './venue.js';

/**
 * The rooms, in the order they are shown, each tied to the category it is
 * furnished from. The plates in the markup carry the same slugs, so the
 * grid below and the pictures above cannot drift apart.
 */
const SPACES = ['furniture', 'home', 'decor'];

/**
 * How many pieces each space contributes, so no one category floods it.
 *
 * Four, because the tile grid is four across on a desktop and three-per-
 * space left a single card stranded on a row of its own. A space with
 * fewer than four simply contributes fewer — the rail is built from what
 * the catalogue actually holds, so it shortens rather than showing gaps.
 */
const PER_SPACE = 4;

export default async function initCuratedSpaces() {
    initLightbox();

    const grid = document.getElementById('spacesEdit');
    if (!grid) return;

    await hydrateCatalogue();

    // Round-robin rather than three runs of one category: the rail reads as
    // a room that has been put together, not as three shelves end to end.
    const pairs = [];
    for (let rank = 0; rank < PER_SPACE; rank++) {
        for (const cat of SPACES) {
            const item = site.products[cat]?.[rank];
            if (item) pairs.push([cat, rank]);
        }
    }
    if (!pairs.length) return;

    renderProductCards(grid, pairs);
    bindProductTiles(grid, showToast);
}
