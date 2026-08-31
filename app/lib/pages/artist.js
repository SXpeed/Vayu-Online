/**
 * Vayu — /pages/artist.html: everyone the shop names.
 *
 * The cards were markup, one <article> per artist, so a new artist meant a
 * deploy and an artist's card and their own page repeated the same name and
 * photograph in two files. They are rows now (see data/artists.js), and the
 * page's own copy — title, hero, statement — is edited under Artists in the
 * panel.
 *
 * Everything here is a repaint over what the document already shows, so a
 * shop that has saved nothing, or an API that never answers, gets exactly
 * the page that shipped.
 */

import { hydrateArtists, hydrateNav } from '#lib/stores/site.svelte.js';
import { site } from '#lib/stores/site.svelte.js';
import { allArtists } from '../data/artists.js';
import { artistPageEffective } from '#shared/content/artist-page.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));

const setText = (sel, text) => {
    const el = document.querySelector(sel);
    if (el && text) el.textContent = text;
};

/**
 * One card. `is-linked` is set only when the artist has a page — the class
 * carries the hover zoom and the whole-tile click target, and a card that
 * animates under the cursor and leads nowhere is a promise the page cannot
 * keep. That rule used to be a comment asking whoever added an artist to
 * remember it; it is now read off the artist.
 */
const cardHTML = (a) => {
    const linked = Boolean(a.href);
    return `
        <article class="a-card${linked ? ' is-linked' : ''}" id="${esc(a.id)}">
            <span class="a-card-media">
              ${a.portrait ? `<img src="${esc(a.portrait)}" alt="${esc(a.name)}" loading="lazy">` : ''}
            </span>
            <div class="a-card-body">
                ${a.tag ? `<div class="a-card-tag">${esc(a.tag)}</div>` : ''}
                <h3 class="a-card-name">${esc(a.name)}</h3>
                ${a.place ? `<div class="a-card-place">${esc(a.place)}</div>` : ''}
                ${a.bio ? `<p class="a-card-bio">${esc(a.bio)}</p>` : ''}
                ${linked ? `<a class="a-card-link" href="${esc(a.href)}">Know More &rarr;</a>` : ''}
            </div>
        </article>`;
};

export default async function initArtistPage() {
    const grid = document.querySelector('.a-grid');
    if (!grid) return;

    // The artists, and the page copy that /api/nav carries alongside the
    // categories. Neither is on the page before its fetch lands.
    await Promise.all([hydrateArtists(), hydrateNav()]);

    const copy = artistPageEffective(site.content?.artistPage);
    setText('.a-title', copy.title);
    setText('.a-meta', copy.meta);
    setText('.a-statement', copy.statement);
    setText('.a-sec-title', copy.sectionTitle);

    const hero = document.querySelector('.a-hero img');
    if (hero && copy.heroImg) {
        hero.src = copy.heroImg;
        hero.alt = copy.heroAlt;
    }
    setText('.a-hero-label', copy.heroLabel);

    const list = allArtists();
    if (list.length) grid.innerHTML = list.map(cardHTML).join('');

    // Counted, not typed: the note beside the heading used to say "One
    // studio" in markup, which was true until it was not.
    const note = document.querySelector('.a-sec-note');
    if (note) note.textContent = list.length === 1 ? 'One studio' : `${list.length} studios`;
}
