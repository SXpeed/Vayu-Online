/**
 * Vayu — the two venue pages: Design for Living (the store) and Gallery
 * Vayu (the gallery).
 *
 * They are siblings by design. Both are one show at one address, written in
 * the same `.g-*` language: an editorial head, a 16:9 hero, an italic
 * statement, a plate grid, and the pieces from that show as the site's own
 * product tiles. A change to the section rhythm should land on both, so the
 * behaviour lives here once rather than being written twice and drifting.
 *
 * Two things this restores, both lost in the SvelteKit migration:
 *
 *   the lightbox   Every plate is a <button class="g-card-media"> with
 *                  `cursor: zoom-in` and a hover zoom, and the pages carry
 *                  the <dialog> markup — but the script that opened it was
 *                  inline in the old public/pages/*.html and was not
 *                  carried across. Every tile on both pages has been
 *                  promising to enlarge and doing nothing.
 *
 *   the edit       data/events.js gives each venue a curated list. Only the
 *                  store page rendered its own; the gallery's three pieces
 *                  existed in the data and were shown in the MENU panel,
 *                  but never on the gallery page itself.
 */

import { venues, eventsOf } from '../data/events.js';
import { renderProductCards, bindProductTiles } from '../product-card.js';
import { hydrateCatalogue } from '#lib/stores/site.svelte.js';
import { showToast } from '../core/toast.js';

/**
 * The pieces in this venue's current show, as the same tiles the collection
 * grid uses — wishlist, add-to-cart and the options rule included.
 */
async function renderEdit(venueId, gridId) {
    const grid = document.getElementById(gridId);
    if (!grid) return;

    const venue = venues.find(v => v.id === venueId);
    if (!venue) return;

    // Before the catalogue is here, eventsOf() resolves every curated entry
    // against an empty product list and hands back an event with nothing in
    // it — so the await has to come first, not after.
    await hydrateCatalogue();

    const current = eventsOf(venue)[0];
    if (!current?.curated?.length) return;

    renderProductCards(grid, current.curated.map(p => [p.cat, p.idx]));
    bindProductTiles(grid, showToast);
}

/**
 * Wire every plate on the page to the shared <dialog> viewer.
 *
 * Escape, the focus trap and the inert backdrop come from the platform;
 * this adds the sequence — arrow keys and prev/next follow DOM order, so
 * they match the order the plates are read in.
 */
export function initLightbox() {
    const dialog = document.getElementById('galleryLightbox');
    const imgEl = document.getElementById('lbImage');
    const capEl = document.getElementById('lbCaption');
    const countEl = document.getElementById('lbCount');
    if (!dialog?.showModal || !imgEl) return;

    const tiles = [...document.querySelectorAll('.g-card-media')]
        .map(btn => {
            const img = btn.querySelector('img');
            const fig = btn.closest('figure');
            return {
                btn,
                src: img?.getAttribute('src') || '',
                alt: img?.getAttribute('alt') || '',
                name: fig?.querySelector('.g-card-name')?.textContent.trim() || '',
                tag: fig?.querySelector('.g-card-tag')?.textContent.trim() || '',
            };
        })
        .filter(t => t.src);

    if (!tiles.length) return;

    let index = 0;
    let opener = null;   // the tile that opened the viewer, to hand focus back

    const show = (i) => {
        index = (i + tiles.length) % tiles.length;
        const t = tiles[index];
        imgEl.src = t.src;
        imgEl.alt = t.alt;
        if (capEl) capEl.textContent = t.tag ? `${t.name} · ${t.tag}` : t.name;
        if (countEl) countEl.textContent = `${index + 1} / ${tiles.length}`;
    };

    tiles.forEach((t, i) => {
        t.btn.addEventListener('click', () => {
            opener = t.btn;
            show(i);
            dialog.showModal();
        });
    });

    document.getElementById('lbNext')?.addEventListener('click', () => show(index + 1));
    document.getElementById('lbPrev')?.addEventListener('click', () => show(index - 1));
    document.getElementById('lbClose')?.addEventListener('click', () => dialog.close());

    dialog.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); show(index + 1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); show(index - 1); }
    });

    // The backdrop, and the padding around the image, both close it.
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog || e.target.classList.contains('g-lightbox-inner')) dialog.close();
    });

    dialog.addEventListener('close', () => {
        opener?.focus();
        // Drop the src so a large photograph is not held while it is shut.
        imgEl.removeAttribute('src');
    });
}

/**
 * @param venueId  the id in data/events.js
 * @param gridId   the element the curated tiles render into
 */
export function initVenuePage({ venueId, gridId }) {
    // The lightbox first, and only once: the plates are static markup, so
    // they are all present now, and a click lands while the catalogue is
    // still in flight. The edit renders .product tiles, which are links to
    // the product page rather than plates to enlarge, so they are not part
    // of the viewer's sequence and it does not need rewiring after.
    initLightbox();
    return renderEdit(venueId, gridId);
}
