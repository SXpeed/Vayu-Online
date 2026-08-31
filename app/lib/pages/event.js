/**
 * Vayu — /pages/event.html?id=<slug>: one show at one of the two houses.
 *
 * One document serves every show, the same way collection-detail.html serves
 * every category: the programme is editable in the panel, so a page per show
 * cannot be prerendered without a deploy per show — which is the thing this
 * feature exists to stop.
 *
 * Everything is drawn from the programme (see data/events.js), which is the
 * admin panel's list once /api/events answers and the shipped one until
 * then. A slug that matches nothing gets a real not-found state rather than
 * an empty frame: the shows people link to are the ones that have finished,
 * so a dead link here is the normal kind of link rot, not an edge case.
 */

import { hydrateEvents, hydrateCatalogue } from '#lib/stores/site.svelte.js';
import { eventById, venueById, eventsOf } from '../data/events.js';
import { renderProductCards, bindProductTiles } from '../product-card.js';
import { initLightbox } from './venue.js';
import { showToast } from '../core/toast.js';
import { setDescription, setCanonical, setOpenGraph } from '../core/head.js';
import { phonePictureHTML } from '#shared/content/picture.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));

const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text || '';
};

function notFound(main) {
    main.innerHTML = `
        <section class="cat-missing">
          <h1>We couldn't find that show</h1>
          <p>It may have been taken down. Both houses and their programmes:</p>
          <div class="cat-missing-links">
            <a class="sub-pill" href="/pages/gallery.html">Gallery Vayu</a>
            <a class="sub-pill" href="/pages/design-for-living.html">Design for Living</a>
          </div>
        </section>`;
    document.title = 'Show not found — Vayu';
}

export default async function initEventPage() {
    const root = document.getElementById('evTitle');
    if (!root) return;
    const main = root.closest('main') || document.body;

    const id = (new URLSearchParams(location.search).get('id') || '').trim();

    // Both, and in parallel: the show comes from the programme, the pieces
    // gathered for it come from the catalogue, and neither is on the page
    // before its fetch lands.
    await Promise.all([hydrateEvents(), hydrateCatalogue()]);

    const event = id ? eventById(id) : null;
    if (!event) return notFound(main);

    const venue = venueById(event.venueId);

    /* ---------- the head of the page ---------- */
    document.title = `${event.title} — Vayu`;
    set('evTitle', event.title);
    set('evDates', event.dates);
    set('evCrumb', event.title);
    set('evStatement', event.statement || event.note);
    set('evSecNote', event.secNote);

    const crumb = document.getElementById('evVenueCrumb');
    if (crumb && venue) {
        crumb.textContent = venue.name;
        crumb.href = venue.href;
    }

    const description = event.statement || event.note
        || `${event.title} at ${venue?.name || 'Vayu'} — ${event.dates}`;
    setDescription(description);
    setCanonical(location.pathname + location.search);
    setOpenGraph({ title: `${event.title} — Vayu`, description, image: event.image });

    /* ---------- hero ---------- */
    const hero = document.getElementById('evHero');
    if (hero && event.image) {
        // The hero is the page's LCP element, so it is never lazy. The phone
        // crop is used where the shop has uploaded one — see
        // migrations/0020_event_phone_image.sql for why one picture cannot
        // serve both shapes.
        hero.innerHTML = phonePictureHTML(event.image, event.imageMobile, {
            alt: event.alt || event.title,
            priority: true,
            escape: esc,
        });
    } else if (hero) {
        hero.remove();
    }

    /* ---------- the plates ----------
       Written as the same <figure class="g-card"> the venue pages carry, so
       they inherit the grid, the hover zoom and — once initLightbox runs
       over them — the viewer, rather than a second implementation of it. */
    const plates = document.getElementById('evPlates');
    const images = event.images || [];
    if (plates && images.length) {
        plates.innerHTML = images.map(im => `
            <figure class="g-card">
              <button type="button" class="g-card-media" aria-label="Enlarge image">
                <img src="${esc(im.img)}" alt="${esc(im.alt || im.name || event.title)}" loading="lazy">
              </button>
              ${im.name || im.tag ? `<figcaption>
                <span class="g-card-name">${esc(im.name || '')}</span>
                <span class="g-card-tag">${esc(im.tag || '')}</span>
              </figcaption>` : ''}
            </figure>`).join('');
        // After the plates exist, never before: the viewer reads the tiles
        // that are in the document when it is wired.
        initLightbox();
    } else {
        document.getElementById('exhibition')?.remove();
    }

    /* ---------- the pieces gathered for it ---------- */
    const grid = document.getElementById('evEdit');
    if (grid && event.curated?.length) {
        renderProductCards(grid, event.curated.map(p => [p.cat, p.idx]));
        bindProductTiles(grid, showToast);
    } else {
        document.getElementById('edit')?.remove();
    }

    /* ---------- where to go next ----------
       A finished show is usually reached from a search result or an old
       link, so the page must not be a dead end.

       The shop's own line wins when it has written one. Otherwise the line
       is generated, and only ever from the show actually flagged "Now on":
       it used to fall back to `others[0]` when no other show carried the
       flag, which meant the current show's own page announced the newest
       *past* show as what was on — "Now on at Design for Living: The Wool
       Months", of a season that closed in February. */
    const back = document.getElementById('evBack');
    if (back && venue) {
        const shows = eventsOf(venue);
        const onNow = shows.find(e => e.current);

        if (event.closing) {
            back.textContent = event.closing;
        } else if (onNow && onNow.id !== event.id) {
            back.innerHTML = `Now on at ${esc(venue.name)}: `
                + `<a href="${esc(onNow.href)}" style="color:var(--accent)">${esc(onNow.title)}</a>`
                + ` — ${esc(onNow.dates)}.`;
        } else {
            // Either this IS the current show, or the house has nothing
            // marked as on. Both want the same thing: the house, not a
            // sentence claiming something is on when it is not.
            back.innerHTML = `More from <a href="${esc(venue.href)}" style="color:var(--accent)">${esc(venue.name)}</a>.`;
        }
    }
}
