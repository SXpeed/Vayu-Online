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
 * list: every room names its category, and the tiles come from there. That
 * means a piece added to Furniture in the admin panel appears under The
 * Living Room without anyone remembering to add it twice.
 *
 * The rooms themselves used to be a `const SPACES` here and literal markup
 * in the .svelte file — two lists that could drift, so the plates named one
 * set of rooms and the rail was built from another. Both now come from the
 * one document in shared/content/curated-spaces.js, which the admin panel
 * edits under Site → Curated Spaces.
 */

import { site, hydrateCatalogue } from '#lib/stores/site.svelte.js';
import { withCuratedDefaults } from '#shared/content/curated-spaces.js';
import { renderProductCards, bindProductTiles } from '../product-card.js';
import { escapeHtml } from '../core/html.js';
import { showToast } from '../core/toast.js';
import { initLightbox } from './venue.js';

/**
 * How many pieces each room contributes, so no one category floods the rail.
 *
 * Four, because the tile grid is four across on a desktop and three-per-
 * room left a single card stranded on a row of its own. A room with fewer
 * than four simply contributes fewer — the rail is built from what the
 * catalogue actually holds, so it shortens rather than showing gaps.
 */
const PER_SPACE = 4;

/** One plate, in the markup the prerendered page already ships. */
const roomHTML = (r) => `
    <figure class="g-card">
        <button type="button" class="g-card-media" aria-label="Enlarge image">
            <img src="${escapeHtml(r.img)}" alt="${escapeHtml(r.alt)}" loading="lazy">
        </button>
        <figcaption>
            <span class="g-card-name">${escapeHtml(r.name)}</span>
            <span class="g-card-tag">${escapeHtml(r.tag)}</span>
        </figcaption>
    </figure>`;

const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el && value) el.textContent = value;
};

/**
 * Paint the saved page over the prerendered one.
 *
 * Additive, like the rest of what the panel owns: with no saved document
 * (or with the API down) every field falls back to what the page already
 * shipped, so nothing here can empty the page out.
 */
function renderContent(c) {
    // The head holds two fields rather than one, so it is not a setText.
    const head = document.getElementById('csHead');
    if (head) {
        const title = head.querySelector('.g-title');
        const meta = head.querySelector('.g-meta');
        if (title && c.title) title.textContent = c.title;
        if (meta && c.meta) meta.textContent = c.meta;
    }

    const heroImg = document.querySelector('#csHero img');
    if (heroImg && c.heroImg) {
        heroImg.src = c.heroImg;
        heroImg.alt = c.heroAlt || '';
    }

    setText('csStatement', c.statement);
    setText('spaces-title', c.sectionTitle);
    setText('csSectionNote', c.sectionNote);
    setText('edit-title', c.shopTitle);

    const grid = document.getElementById('csGrid');
    if (grid && c.rooms.length) grid.innerHTML = c.rooms.map(roomHTML).join('');
}

export default async function initCuratedSpaces() {
    // The catalogue read carries the saved page with it, so it has to land
    // before anything is drawn. That is a change from the other two venue
    // pages, which wire the lightbox first because their plates are static
    // markup that is already present; here the plates can be replaced, and
    // binding first would leave the viewer holding nodes that no longer
    // exist. initLightbox() also binds the dialog's own buttons, so it must
    // be called exactly once — after the grid is final.
    await hydrateCatalogue();

    const content = withCuratedDefaults(site.content?.curatedSpaces);
    renderContent(content);
    initLightbox();

    const grid = document.getElementById('spacesEdit');
    if (!grid) return;

    // Rooms with no category contribute nothing to the rail — the plate
    // still shows, it just has no pieces of its own to offer.
    const cats = content.rooms.map(r => r.category).filter(Boolean);
    if (!cats.length) return;

    // Round-robin rather than one run per category: the rail reads as a
    // room that has been put together, not as three shelves end to end.
    const pairs = [];
    for (let rank = 0; rank < PER_SPACE; rank++) {
        for (const cat of cats) {
            if (site.products[cat]?.[rank]) pairs.push([cat, rank]);
        }
    }
    if (!pairs.length) return;

    renderProductCards(grid, pairs);
    bindProductTiles(grid, showToast);
}
