/**
 * Vayu — /pages/artist-profile.html?id=<slug>: one artist.
 *
 * Everything is drawn from the artists list (see data/artists.js), which is
 * the admin panel's once /api/artists answers and the shipped one until
 * then. A slug that matches nothing gets a real not-found state rather than
 * an empty frame — the same reasoning as the show pages: people link to
 * these, and a dead link is ordinary link rot, not an edge case.
 *
 * The capsule is the artist's own pieces, named rather than indexed and
 * resolved against the live catalogue, so a piece that has been renamed or
 * withdrawn drops out of the row instead of becoming somebody else's work.
 */

import { hydrateArtists, hydrateCatalogue } from '#lib/stores/site.svelte.js';
import { artistById, capsuleOf, storyOf } from '../data/artists.js';
import { renderProductCards, bindProductTiles } from '../product-card.js';
import { showToast } from '../core/toast.js';
import { setDescription, setCanonical, setOpenGraph } from '../core/head.js';

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
          <h1>We couldn't find that artist</h1>
          <p>Everyone we work with is here:</p>
          <div class="cat-missing-links">
            <a class="sub-pill" href="/pages/artist.html">Meet the artists</a>
          </div>
        </section>`;
    document.title = 'Artist not found — Vayu';
}

export default async function initArtistProfile() {
    const root = document.getElementById('apName');
    if (!root) return;
    const main = root.closest('main') || document.body;

    const id = (new URLSearchParams(location.search).get('id') || '').trim();

    // Both, and in parallel: the artist comes from the panel's list, the
    // pieces of their capsule come from the catalogue, and neither is on
    // the page before its fetch lands.
    await Promise.all([hydrateArtists(), hydrateCatalogue()]);

    const artist = id ? artistById(id) : null;
    // An artist the shop has un-listed has no page — the index shows them as
    // a card and nothing more — so the slug is treated as unknown rather
    // than quietly serving a page nothing links to.
    if (!artist || artist.listed === false) return notFound(main);

    document.title = `${artist.name} — Vayu`;
    set('apCrumb', artist.name);
    set('apName', artist.name);

    // Their standing and where they work, on one line: "Artist in Residence
    // · Tirbin, Arunachal Pradesh". Either half alone still reads.
    const meta = [artist.tag, artist.place].filter(Boolean).join(' · ');
    set('apMeta', meta);
    const metaEl = document.getElementById('apMeta');
    if (metaEl) metaEl.hidden = !meta;

    const hero = document.getElementById('apHero');
    const heroImg = artist.hero || artist.portrait;
    if (hero) {
        hero.innerHTML = heroImg
            ? `<img src="${esc(heroImg)}" alt="${esc(artist.heroAlt || artist.name)}">`
            : '';
        hero.hidden = !heroImg;
    }

    const story = storyOf(artist);
    const storyEl = document.getElementById('apStory');
    if (storyEl) storyEl.innerHTML = story.map(p => `<p>${esc(p)}</p>`).join('');

    // The capsule names the collection after the artist, which is what the
    // page did before from its own <h1>. The section goes entirely when
    // there is nothing in it: an empty "Collection" heading over a blank
    // row reads as a page that failed to load.
    const capsule = capsuleOf(artist);
    const section = document.getElementById('apCapsule');
    const grid = document.getElementById('apGrid');
    if (section) section.hidden = capsule.length === 0;
    if (grid && capsule.length) {
        renderProductCards(grid, capsule.map(p => [p.cat, p.idx]));
        bindProductTiles(grid, showToast);
    }
    set('apCapsuleTitle', `${artist.name} Collection`);

    // Told to search engines as its own page, not as the empty shell every
    // artist shares — the document is one route, the artists are many.
    setCanonical(`/pages/artist-profile.html?id=${encodeURIComponent(artist.id)}`);
    const description = story[0] || artist.bio || `${artist.name} at Vayu.`;
    setDescription(description);
    setOpenGraph({ title: `${artist.name} — Vayu`, description });
}
