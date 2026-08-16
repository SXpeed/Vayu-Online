/**
 * Vayu — /pages/design-for-living.html: the current event's pieces, as the
 * site's own product tiles rather than a second card design.
 *
 * Same source as the MENU panel's edit (data/events.js), so the store page
 * and the menu cannot disagree about what the season holds. This used to be
 * renderVenueEdit() inside js/nav-render.js, which meant every page on the
 * site pulled product-card.js — and through it shop.js and the catalogue —
 * to render a grid that exists on this page alone.
 */

import { venues, eventsOf } from '../data/events.js';
import { renderProductCards, bindProductTiles } from '../product-card.js';
import { hydrateCatalogue } from '#lib/stores/site.svelte.js';
import { showToast } from '../core/toast.js';

export default async function initDesignForLiving() {
    const grid = document.getElementById('dflEdit');
    if (!grid) return;

    const venue = venues.find(v => v.id === 'design-for-living');
    if (!venue) return;

    // Before the catalogue is here, eventsOf() resolves every curated entry
    // against an empty product list and hands back an event with nothing in
    // it — so the await has to come first, not after.
    await hydrateCatalogue();

    const current = eventsOf(venue)[0];
    if (!current) return;

    renderProductCards(grid, current.curated.map(p => [p.cat, p.idx]));
    bindProductTiles(grid, showToast);
}
