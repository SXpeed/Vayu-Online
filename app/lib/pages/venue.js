/**
 * Vayu — the two venue pages: Design for Living (the store) and Gallery
 * Vayu (the gallery).
 *
 * They are siblings by design, and now literally the same page with
 * different content: an editorial head, a 16:9 hero that opens the current
 * show, an italic statement, and the archive of what the house has shown
 * before. A change to the section rhythm should land on both, so the
 * behaviour lives here once rather than being written twice and drifting.
 *
 * Everything belonging to a particular show — its pictures, its plates and
 * the pieces gathered for it — is on that show's own page. These two pages
 * say what the house is and what it has done; they no longer try to be the
 * current show as well.
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
 * The programme is editable in the admin panel, so both pages paint their
 * current show from it and list what each house has shown before, each past
 * show linking to a page of its own.
 *
 * What they no longer carry is the curated edit — the product tiles for the
 * current show. Those describe one show rather than one address, so they
 * live on that show's page (/pages/event.html?id=) and both venue pages are
 * now the same four things: a head, a hero, the plates, and the archive.
 */

import { venueById, eventsOf } from '../data/events.js';
import { hydrateEvents } from '#lib/stores/site.svelte.js';
import { phonePictureHTML } from '#shared/content/picture.js';

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

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));

/**
 * Put the panel's current show onto the page.
 *
 * The document ships with a show written into it, which is what a visitor
 * sees before any fetch lands and what a crawler reads. Once the programme
 * arrives, the fields it actually carries are written over that markup —
 * field by field, not by replacing the section, so a show that has a title
 * and dates but no plates yet keeps the plates the page already had rather
 * than emptying the grid.
 */
function paintCurrent(event) {
    if (!event) return;

    const title = document.querySelector('.g-head .g-title');
    const meta = document.querySelector('.g-head .g-meta');
    const statement = document.querySelector('.g-statement');
    const heroEl = document.querySelector('.g-hero');

    if (title && event.title) title.textContent = event.title;
    if (meta && event.dates) meta.textContent = event.dates;
    if (statement && event.statement) statement.textContent = event.statement;
    // Replaced wholesale rather than having its src reassigned: a phone crop
    // needs a <picture> around the <img>, and the markup that ships is a bare
    // <img> because the page does not know yet which show it will lead with.
    if (heroEl && event.image) {
        heroEl.innerHTML = phonePictureHTML(event.image, event.imageMobile, {
            alt: event.alt || event.title,
            priority: true,
            escape: esc,
        });
    }
    if (event.title) document.title = `${event.title} — Vayu`;

    // The way into the show. The hero used to jump to a plate section on
    // this page; the pictures live on the show's own page now, so it points
    // there instead — an anchor to a section that no longer exists is a
    // link that silently does nothing.
    const hero = document.querySelector('a.g-hero');
    if (hero && event.href) hero.href = event.href;
}


/**
 * Everything this house has shown before, each linking to its own page.
 *
 * A show that closes used to simply disappear — no list, no page, and the
 * photographs of it gone with it. This is the record: the tiles are the
 * shows' own hero plates, and they go to /pages/event.html?id=, where the
 * whole thing is still hanging.
 */
function paintPast(past) {
    const main = document.querySelector('main.wrap');
    if (!main || !past.length) return;

    const section = document.createElement('section');
    section.id = 'past';
    section.setAttribute('aria-labelledby', 'past-title');
    section.innerHTML = `
        <div class="g-sec-head">
          <h2 class="g-sec-title" id="past-title">Previously</h2>
          <span class="g-sec-note">${past.length} past show${past.length === 1 ? '' : 's'}</span>
        </div>
        <div class="g-grid">
          ${past.map(ev => `
            <figure class="g-card">
              <a class="g-card-media" href="${esc(ev.href)}" style="cursor:pointer">
                <img src="${esc(ev.image)}" alt="${esc(ev.alt || ev.title)}" loading="lazy">
              </a>
              <figcaption>
                <span class="g-card-name">${esc(ev.title)}</span>
                <span class="g-card-tag">${esc(ev.dates)}</span>
              </figcaption>
            </figure>`).join('')}
        </div>`;

    // Appended INSIDE main, as its last section. It used to be inserted
    // before the lightbox <dialog> — which sits *outside* main on both venue
    // pages, so the selector missed, the fallback resolved to main itself,
    // and insertBefore put the whole archive above the page: a list of
    // finished shows was the first thing anyone saw, above the breadcrumb
    // and above what is actually on.
    main.append(section);
}

/**
 * @param venueId  the id of the house, as in data/events.js
 */
export async function initVenuePage({ venueId }) {
    // Only the programme now. The catalogue used to be fetched here too, to
    // resolve the curated pieces for the edit grid; that grid has gone to the
    // show's own page, and with it the whole shop on a page that lists none.
    await hydrateEvents();

    const venue = venueById(venueId);
    if (!venue) return;

    const list = eventsOf(venue);
    // `current` is the panel's flag. The shipped fallback has no flag and is
    // written newest first, so the first entry is the current show there.
    const current = list.find(e => e.current) || list[0];
    const past = list.filter(e => e !== current);

    paintCurrent(current);
    paintPast(past);
}
