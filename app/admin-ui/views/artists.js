/**
 * Vayu Admin — the artists, and the page that lists them.
 *
 * Its own file rather than a fifth section of catalog.js, which already
 * carries products, categories, press and the programme. What is edited
 * here is one thing: the people the shop names, and the room they are
 * shown in.
 *
 * An artist is a row with a page of their own at /pages/artist-profile.html
 * — unless the shop unticks "has a page of their own", in which case they
 * are a card on the index and the card is not a link. That switch is the
 * one editorial decision on this screen, and it exists because the
 * hand-written page it replaces had the opposite bug: five of its six cards
 * animated under the cursor and led nowhere.
 */

import { $, viewEl, esc, toast, guard, openModal, closeModal, modalChrome } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { pickImage } from '../lib/media.js';
// ../shared/artist-page.js is shared/content/artist-page.js, re-served
// through the admin route: the panel's files ship as source, so a bare
// #shared/ specifier would reach the browser unresolved.
import { ARTIST_PAGE_SHIPPED, artistPageEffective } from '../shared/artist-page.js';

const HINT = 'text-transform:none;letter-spacing:0;color:var(--muted)';
const CHECK_LABEL = 'display:flex;align-items:center;gap:9px;cursor:pointer';

/** A blank line between paragraphs, in the textarea and in the database. */
const PARA = '\n\n';

/** One piece of an artist's capsule: category slug and the product's name. */
const pieceRow = (c = {}) => `
    <div class="ar-piece" style="display:grid;grid-template-columns:160px 1fr auto;gap:8px;margin-bottom:8px">
        <input class="ar-piece-cat" value="${esc(c.cat || '')}" placeholder="fashion">
        <input class="ar-piece-name" value="${esc(c.name || '')}" placeholder="Heritage Linen Kurta">
        <button type="button" class="btn small danger" data-piece-del>&#10005;</button>
    </div>`;

/**
 * Move an artist one place earlier or later on the index.
 *
 * Renumbered from the top rather than the two neighbours trading numbers,
 * for the reason the categories screen is: positions default to 0, and
 * swapping two zeroes moves nothing. Only rows whose number changes are
 * written.
 */
async function moveArtist(ordered, id, delta) {
    const i = ordered.findIndex(a => a.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ordered.length) return;

    const next = [...ordered];
    [next[i], next[j]] = [next[j], next[i]];
    const writes = next
        .map((a, idx) => ({ id: a.id, order: idx }))
        .filter((w, idx) => ordered[idx]?.id !== w.id);

    const moved = ordered[i].name;
    const ok = await guard(async () => {
        for (const w of writes) await api(`artists/${w.id}`, 'PUT', { order: w.order });
    }, `"${moved}" is now ${j + 1} of ${ordered.length}`);
    if (ok) renderArtists();
}

export async function renderArtists() {
    const [{ artists }, { content }] = await Promise.all([api('artists'), api('content')]);
    const page = artistPageEffective(content.artistPage);
    const ordered = [...artists];

    // Said on the card, because an artist missing one of these has a page
    // that reads as broken rather than empty, and there is no way to see
    // that from a list of names.
    const gaps = (a) => {
        const missing = [];
        if (!a.portrait) missing.push('no picture');
        if (a.listed && !a.story?.length) missing.push('no story');
        if (a.listed && !a.curated?.length) missing.push('no pieces');
        return missing.length
            ? ` &middot; <span style="color:var(--critical)">${missing.join(' &middot; ')}</span>`
            : '';
    };

    const cards = ordered.map((a, i) => `
        <div class="card cat-card" data-id="${esc(a.id)}">
            <div class="cat-head">
                <img src="${esc(a.portrait || '')}" alt="">
                <div class="grow">
                    <h2 style="margin:0">${esc(a.name)}</h2>
                    <div class="slug">${esc([a.tag, a.place].filter(Boolean).join(' · ') || '—')}</div>
                    <div class="slug">${a.curated?.length || 0} piece(s)${
                        a.listed ? '' : ' &middot; card only, no page'}${gaps(a)}</div>
                </div>
                <span class="chip" title="Where they come on the artist page">${i + 1}</span>
            </div>
            <div style="display:flex;gap:8px">
                <button class="btn small" data-act="up" title="Move earlier" ${i === 0 ? 'disabled' : ''}>&larr;</button>
                <button class="btn small" data-act="down" title="Move later" ${
                    i === ordered.length - 1 ? 'disabled' : ''}>&rarr;</button>
                <button class="btn small" data-act="edit">Edit</button>
                <button class="btn small danger" data-act="del">Delete</button>
            </div>
        </div>`).join('') || '<div class="empty">No artists yet.</div>';

    viewEl.innerHTML = `
        <div class="card" style="max-width:760px;margin-bottom:16px">
            <h2>The artist page</h2>
            <p class="sub">Everything on the artist page that is not an artist — filled in below with
                what it is showing now. Empty a field to put back what the page ships with. The
                people themselves are the cards underneath.</p>
            <div class="slide-two">
                <div class="field"><label>Title</label>
                    <input id="ap-title" value="${esc(page.title)}" placeholder="${esc(ARTIST_PAGE_SHIPPED.title)}"></div>
                <div class="field"><label>Line beside it</label>
                    <input id="ap-meta" value="${esc(page.meta)}" placeholder="${esc(ARTIST_PAGE_SHIPPED.meta)}"></div>
            </div>
            <div class="field" style="margin-top:12px"><label>Wide picture</label>
                <div style="display:flex;gap:8px">
                    <input id="ap-heroimg" value="${esc(page.heroImg)}" placeholder="${esc(ARTIST_PAGE_SHIPPED.heroImg)}">
                    <button type="button" class="btn small" id="ap-hero-up">Upload</button></div></div>
            <div class="slide-two">
                <div class="field"><label>Picture description</label>
                    <input id="ap-heroalt" value="${esc(page.heroAlt)}" placeholder="${esc(ARTIST_PAGE_SHIPPED.heroAlt)}"></div>
                <div class="field"><label>Caption on the picture</label>
                    <input id="ap-herolabel" value="${esc(page.heroLabel)}" placeholder="${esc(ARTIST_PAGE_SHIPPED.heroLabel)}"></div>
            </div>
            <div class="field" style="margin-top:12px"><label>Statement</label>
                <textarea id="ap-statement" rows="3">${esc(page.statement)}</textarea></div>
            <div class="field"><label>Heading above the artists</label>
                <input id="ap-sectitle" value="${esc(page.sectionTitle)}" placeholder="${esc(ARTIST_PAGE_SHIPPED.sectionTitle)}">
                <div class="help">The count beside it writes itself from how many artists there are.</div></div>
            <div class="modal-actions" style="margin-top:14px">
                <div class="form-error" id="ap-err"></div>
                <button class="btn primary" id="ap-save">Save page</button>
            </div>
        </div>

        <div class="toolbar">
            <div style="font-size:12px;color:var(--muted)">Numbered in the order they appear on the
                artist page. &larr; and &rarr; move one earlier or later.</div>
            <div class="spacer"></div>
            <button class="btn primary" id="new-artist">+ New artist</button>
        </div>
        <div class="cat-grid" id="artist-grid">${cards}</div>`;

    $('#ap-hero-up').addEventListener('click', async () => {
        const u = await pickImage();
        if (u) $('#ap-heroimg').value = u;
    });

    $('#ap-save').addEventListener('click', async () => {
        const err = $('#ap-err');
        err.textContent = '';
        // Only what differs from what the page shows by itself is stored, so
        // saving an untouched form does not freeze the shipped copy into the
        // database as though the shop had chosen every word of it.
        const pin = (value, self) => (value === self ? '' : value);
        try {
            await api('content', 'PUT', {
                artistPage: {
                    title: pin($('#ap-title').value.trim(), ARTIST_PAGE_SHIPPED.title),
                    meta: pin($('#ap-meta').value.trim(), ARTIST_PAGE_SHIPPED.meta),
                    heroImg: pin($('#ap-heroimg').value.trim(), ARTIST_PAGE_SHIPPED.heroImg),
                    heroAlt: pin($('#ap-heroalt').value.trim(), ARTIST_PAGE_SHIPPED.heroAlt),
                    heroLabel: pin($('#ap-herolabel').value.trim(), ARTIST_PAGE_SHIPPED.heroLabel),
                    statement: pin($('#ap-statement').value.trim(), ARTIST_PAGE_SHIPPED.statement),
                    sectionTitle: pin($('#ap-sectitle').value.trim(), ARTIST_PAGE_SHIPPED.sectionTitle),
                },
            });
            toast('Saved — refresh the artist page to see it');
        } catch (error_) { err.textContent = error_.message; }
    });

    $('#new-artist').addEventListener('click', () => artistEditor(null));
    $('#artist-grid').addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const id = btn.closest('[data-id]').dataset.id;
        const artist = ordered.find(a => a.id === id);
        const act = btn.dataset.act;

        if (act === 'edit') return artistEditor(artist);
        if (act === 'up' || act === 'down') return moveArtist(ordered, id, act === 'up' ? -1 : 1);

        if (!confirm(`Remove "${artist.name}"? Their page goes with them.`)) return;
        if (await guard(() => api(`artists/${id}`, 'DELETE'), 'Artist removed')) renderArtists();
    });
}

/**
 * The editor, grouped by where each field lands: the card on the index,
 * the artist's own page, and the pieces at the foot of it.
 */
export function artistEditor(artist) {
    const v = artist || {
        name: '', tag: '', place: '', bio: '', portrait: '', hero: '', heroAlt: '',
        story: [], curated: [], listed: true,
    };
    const story = Array.isArray(v.story) ? v.story.join(PARA) : String(v.story || '');

    const modal = openModal(`
        <h2>${artist ? 'Edit artist' : 'New artist'}</h2>

        <div class="form-grid">
            <div class="field"><label>Name</label><input id="ar-name" value="${esc(v.name)}"></div>
            <div class="field"><label>Address <span style="${HINT}">— set once, from the name</span></label>
                <input id="ar-id" value="${esc(artist?.id || '')}" ${artist ? 'disabled' : ''}
                       placeholder="left blank: from the name"></div>
        </div>

        <h3 style="margin:22px 0 4px">On the artist page</h3>
        <p class="sub" style="margin:0 0 12px">How they appear in the row of cards.</p>
        <div class="form-grid">
            <div class="field"><label>Standing</label>
                <input id="ar-tag" value="${esc(v.tag)}" placeholder="Artist in Residence"></div>
            <div class="field"><label>Where they work</label>
                <input id="ar-place" value="${esc(v.place)}" placeholder="Tirbin, Arunachal Pradesh"></div>
            <div class="field full"><label>Picture <span style="${HINT}">— the card is 4:5, so give it an upright photograph</span></label>
                <div style="display:flex;gap:8px">
                    <input id="ar-portrait" value="${esc(v.portrait)}">
                    <button type="button" class="btn small" id="ar-portrait-up">Upload</button></div></div>
            <div class="field full"><label>The line on the card</label>
                <textarea id="ar-bio" rows="2">${esc(v.bio)}</textarea></div>
        </div>

        <h3 style="margin:22px 0 4px">Their own page</h3>
        <p class="sub" style="margin:0 0 12px">An artist with a page gets one at
            /pages/artist-profile.html — the only place their story and their pieces appear.</p>
        <div class="form-grid">
            <div class="field full"><label>Has a page of their own</label>
                <label style="${CHECK_LABEL}">
                    <input type="checkbox" id="ar-listed" ${v.listed === false ? '' : 'checked'} style="width:auto">
                    Give them a page, and make their card a link</label>
                <div style="${HINT};font-size:12px;margin-top:6px">Off: they stay on the artist page as a card, and the card leads nowhere rather than promising a click it cannot keep.</div></div>
            <div class="field full"><label>Wide picture <span style="${HINT}">— 21:9 across the top of their page</span></label>
                <div style="display:flex;gap:8px">
                    <input id="ar-hero" value="${esc(v.hero)}" placeholder="left blank: the card picture">
                    <button type="button" class="btn small" id="ar-hero-up">Upload</button></div></div>
            <div class="field full"><label>Picture description <span style="${HINT}">— for screen readers. Left blank: their name.</span></label>
                <input id="ar-heroalt" value="${esc(v.heroAlt)}"></div>
            <div class="field full"><label>Story <span style="${HINT}">— one blank line between paragraphs</span></label>
                <textarea id="ar-story" rows="8">${esc(story)}</textarea></div>
            <div class="field full"><label>Their pieces <span style="${HINT}">— category slug and the product's exact name, as in the catalogue</span></label>
                <div id="ar-pieces">${(v.curated || []).map(pieceRow).join('')}</div>
                <button type="button" class="btn small" id="ar-piece-add">+ Add piece</button>
                <div style="${HINT};font-size:12px;margin-top:6px">Named, not numbered: a piece that has been renamed or withdrawn drops out of the row rather than turning into somebody else's work. With none, the collection at the foot of their page is not shown at all.</div></div>
        </div>

        <div class="modal-actions">
            <div class="form-error" id="ar-err"></div>
            <button class="btn" id="ar-cancel">Cancel</button>
            <button class="btn primary" id="ar-save">${artist ? 'Save changes' : 'Add artist'}</button>
        </div>`);

    $('#ar-portrait-up', modal).addEventListener('click', async () => {
        const u = await pickImage(); if (u) $('#ar-portrait', modal).value = u;
    });
    $('#ar-hero-up', modal).addEventListener('click', async () => {
        const u = await pickImage(); if (u) $('#ar-hero', modal).value = u;
    });
    $('#ar-piece-add', modal).addEventListener('click', () => {
        $('#ar-pieces', modal).insertAdjacentHTML('beforeend', pieceRow());
    });
    $('#ar-pieces', modal).addEventListener('click', (e) => {
        const del = e.target.closest('[data-piece-del]');
        if (del) del.closest('.ar-piece').remove();
    });

    const err = modalChrome(modal, '#ar-cancel', '#ar-err');
    $('#ar-save', modal).addEventListener('click', async () => {
        const body = {
            name: $('#ar-name', modal).value.trim(),
            tag: $('#ar-tag', modal).value.trim(),
            place: $('#ar-place', modal).value.trim(),
            bio: $('#ar-bio', modal).value.trim(),
            portrait: $('#ar-portrait', modal).value.trim(),
            hero: $('#ar-hero', modal).value.trim(),
            heroAlt: $('#ar-heroalt', modal).value.trim(),
            story: $('#ar-story', modal).value,
            listed: $('#ar-listed', modal).checked,
            curated: [...modal.querySelectorAll('.ar-piece')].map(row => ({
                cat: row.querySelector('.ar-piece-cat').value.trim().toLowerCase(),
                name: row.querySelector('.ar-piece-name').value.trim(),
            })).filter(c => c.cat && c.name),
        };
        if (!body.name) return err.textContent = 'A name is required';
        if (!artist) body.id = $('#ar-id', modal).value.trim();

        try {
            if (artist) await api(`artists/${artist.id}`, 'PUT', body);
            else await api('artists', 'POST', body);
            closeModal();
            toast(artist ? 'Artist saved' : 'Artist added');
            renderArtists();
        } catch (error_) { err.textContent = error_.message; }
    });
}
