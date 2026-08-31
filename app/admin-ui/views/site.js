/**
 * Vayu Admin — running the shop: storefront content, team access, and
 * store settings (including backups and the account password).
 */

import {
    $, viewEl, esc, dateFmt, toast, guard,
    openModal, closeModal, modalChrome, confirmDelete,
} from '../lib/dom.js';
import { api, state, catTitle } from '../lib/api.js';
import { pickImage } from '../lib/media.js';
// ../shared/curated-spaces.js is shared/content/curated-spaces.js, re-served
// through the admin route: the panel's files are shipped as source, so a bare
// #shared/ specifier would reach the browser unresolved.
import { CURATED_SPACES_DEFAULT, BLANK_ROOM, withCuratedDefaults } from '../shared/curated-spaces.js';
import {
    INSIDE_VAYU_SHIPPED, insideVayuEffective, currentShow, sameTiles,
} from '../shared/inside-vayu.js';
import { ARTIST_BAND_SHIPPED, artistBandEffective } from '../shared/home-artist.js';
// The phone, the email and the social links, with the values the footer
// falls back to. Filled in below rather than left as empty boxes: the card
// has to be able to answer "what does the site say now?".
import { CONTACT_SHIPPED, SOCIAL_NETWORKS, contactEffective } from '../shared/contact.js';

/* ================= storefront content ================= */

const BLANK_SLIDE = { img: '', imgMobile: '', alt: '', title: '', ctaText: '', ctaHref: '' };

/** The house the home page's Inside Vayu block follows. */
const INSIDE_VAYU_VENUE = 'gallery-vayu';

/**
 * One image slot: the plate, and the button that replaces it.
 *
 * `which` is the field it writes to, so the desktop and phone slots are the
 * same control twice rather than two near-copies that can drift.
 */
const imgSlot = (url, which, label) => `
    <div class="slide-img" data-slot="${which}">
        ${url ? `<img src="${esc(url)}" alt="">` : '<div class="slide-img-empty">No image</div>'}
        <div class="slide-img-label">${label}</div>
        <div class="slide-img-actions">
            <button type="button" class="btn small" data-act="pick" data-f="${which}">Upload</button>
        </div>
    </div>`;

function slideCard(s, i, total) {
    // A slide with neither heading nor button becomes a poster: the whole
    // image is one link. Say so, rather than leaving it to be discovered.
    const posterNote = !s.title && !s.ctaText
        ? '<div class="help">Poster slide — the whole image links to the button link above.</div>'
        : '';

    return `
        <div class="slide-row" data-i="${i}">
            <div class="slide-imgs">
                ${imgSlot(s.img, 'img', 'Desktop')}
                ${imgSlot(s.imgMobile, 'imgMobile', 'Phone')}
            </div>
            <div class="slide-fields">
                <div class="slide-head">
                    <b>Slide ${i + 1}</b>
                    <div class="slide-move">
                        <button type="button" class="btn small" data-act="up" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button>
                        <button type="button" class="btn small" data-act="down" ${i === total - 1 ? 'disabled' : ''} title="Move down">↓</button>
                        <button type="button" class="btn small danger" data-act="rm" title="Remove slide">✕</button>
                    </div>
                </div>
                <div class="field"><label>Desktop image URL</label>
                    <input data-f="img" value="${esc(s.img)}" placeholder="/assets/images/hero.jpg"></div>
                <div class="field"><label>Phone image URL</label>
                    <input data-f="imgMobile" value="${esc(s.imgMobile || '')}" placeholder="Empty = use the desktop image on phones too">
                    <div class="help">Shown instead of the desktop image on screens up to 768px wide.
                        Upload one framed upright — a wide campaign shot loses its subject when a phone
                        crops it.</div></div>
                <div class="field"><label>Heading</label>
                    <input data-f="title" value="${esc(s.title)}" placeholder="Empty = image-only poster slide"></div>
                <div class="slide-two">
                    <div class="field"><label>Button text</label>
                        <input data-f="ctaText" value="${esc(s.ctaText)}" placeholder="Empty = no button"></div>
                    <div class="field"><label>Button link</label>
                        <input data-f="ctaHref" value="${esc(s.ctaHref)}" placeholder="/pages/collection.html"></div>
                </div>
                ${posterNote}
                <div class="field"><label>Image description (for screen readers)</label>
                    <input data-f="alt" value="${esc(s.alt)}" placeholder="Vayu Autumn / Winter Campaign 2026"></div>
            </div>
        </div>`;
}

/**
 * The shop-wide fallback for the product page's detail accordion.
 *
 * A product that has been given its own Dimensions, Materials, Care or
 * Description in the product editor overrides this section by section;
 * everything else shows what is set here. Without it, a catalogue that has
 * not been written up yet renders product pages with a single section on
 * them, which is what this shop had.
 */
const defaultsCard = (d) => `
    <div class="card" style="max-width:760px;margin-bottom:16px">
        <h2>Default product details</h2>
        <p class="sub">Shown on any product that has not been given its own. Fill these in per
            product from Products → Edit → Product details, and that product stops using the
            defaults for that section.</p>
        <div class="field"><label>Description</label>
            <textarea id="pd-desc">${esc(d.description || '')}</textarea></div>
        <div class="field" style="margin-top:12px"><label>Care instructions</label>
            <textarea id="pd-care">${esc(d.care || '')}</textarea></div>
        <div class="field" style="margin-top:12px"><label>Dimensions</label>
            <div class="det-rows" id="pd-dimensions"></div>
            <button type="button" class="btn small" data-add="dimensions" style="margin-top:8px">+ Row</button>
            <div class="help">These apply to every unmeasured piece in the shop. Worth clearing
                once products carry their own.</div></div>
        <div class="field" style="margin-top:12px"><label>Materials &amp; Origin</label>
            <div class="det-rows" id="pd-materials"></div>
            <button type="button" class="btn small" data-add="materials" style="margin-top:8px">+ Row</button></div>
    </div>`;

export async function renderContent() {
    const { content } = await api('content');
    // The programme, because Inside Vayu below is drawn from it. Tolerated
    // failing: a panel role without events, or a shop with no shows yet,
    // still gets the card — filled from what the page ships with instead.
    const { events = [] } = await api('events').catch(() => ({ events: [] }));
    let slides = structuredClone(content.heroSlides || []);
    // Only an explicit false turns the box off — an unsaved setting has to
    // keep the look the shop already has.
    const tileBox = content.productTileBox !== false;
    const defaults = {
        description: '', care: '', dimensions: [], materials: [],
        ...structuredClone(content.productDefaults || {}),
    };
    // Inside Vayu is shown filled, with what the home page is actually
    // showing: the current exhibition's hero and plates where it has them,
    // the shipped block where it does not. A card left blank cannot answer
    // the question it is opened with — what is on the page now? — and the
    // shop has no other way to find out but to go and look.
    //
    // Filled fields have to be saved carefully, though. Writing them back as
    // they stand would pin every one of them, and the block would stop
    // following the programme it was built to follow. So both readings are
    // kept: `live` fills the form, `derived` is what the page would show
    // with nothing saved at all, and at save time a field still equal to
    // `derived` is stored empty — which is how "keep following" is spelled.
    // A field the shop had already overridden differs from `derived`, so it
    // survives untouched.
    const show = currentShow(events.filter(e => e.venue === INSIDE_VAYU_VENUE));
    const live = insideVayuEffective(content.insideVayu, show);
    const derived = insideVayuEffective(null, show);
    let tiles = structuredClone(live.tiles);

    // The artist band under it. Only one source to fall back to here — the
    // shipped picture — so what the page shows is what the shop saved over
    // it, and ARTIST_BAND_SHIPPED plays the part `derived` plays above.
    const band = artistBandEffective(content.artist);

    // What's On in the header. One — the show that is on now — for a shop
    // that has never chosen, which is what the panel does with no setting.
    const menuShows = Math.min(6, Math.max(1, Math.trunc(Number(content.menuShows)) || 1));

    // Contact details, shown as the footer is printing them. Unlike Inside
    // Vayu above there is nothing to keep following here — the fallback is a
    // fixed string, not a programme — so the fields are filled and saved as
    // they stand, and no `pin` dance is needed.
    const contact = contactEffective(content.contact);

    viewEl.innerHTML = `
        <div class="card" style="max-width:760px;margin-bottom:16px">
            <h2>Announcement bar</h2>
            <p class="sub">A slim dark strip across the top of every page. Leave empty to hide it.</p>
            <div class="field">
                <input id="ct-ann" value="${esc(content.announcement)}" placeholder="e.g. Free shipping above ₹5,000 · Diwali dispatch till 18 Oct">
            </div>
        </div>
        <div class="card" style="max-width:760px;margin-bottom:16px">
            <h2>Contact &amp; social</h2>
            <p class="sub">Printed in the footer of every page, and on the press page. Changing the
                number here changes it everywhere it appears, including the shop details search
                engines read.</p>
            <div class="slide-two">
                <div class="field"><label>Phone</label>
                    <input id="ct-phone" value="${esc(contact.phone)}" placeholder="${esc(CONTACT_SHIPPED.phone)}">
                    <div class="help">Write it the way it should read. The tap-to-dial link is
                        built from the digits, so spaces and the +91 are fine.</div></div>
                <div class="field"><label>Email</label>
                    <input id="ct-email" type="email" value="${esc(contact.email)}" placeholder="${esc(CONTACT_SHIPPED.email)}"></div>
            </div>
            <p class="sub" style="margin-top:14px">Social profiles — the full address of each one.
                <strong>Empty takes that icon off the footer</strong>, which is how a network the
                shop is not on is removed.</p>
            <div class="slide-two">
                ${SOCIAL_NETWORKS.map(n => `
                <div class="field"><label>${n.label}</label>
                    <input id="ct-soc-${n.key}" value="${esc(contact[n.key])}" placeholder="${esc(CONTACT_SHIPPED[n.key])}"></div>`).join('')}
            </div>
            <div class="help">These also tell Google which accounts belong to the shop, so they
                are worth filling in even for a profile that is rarely posted to. Anything that is
                not a http:// or https:// address is stored empty.</div>
        </div>
        <div class="card" style="max-width:760px;margin-bottom:16px">
            <h2>What&rsquo;s On in the menu</h2>
            <p class="sub">The panel that opens under MENU. Each house shows what is on there now;
                ask for more and it lists its most recent closed shows under it, marked Past.</p>
            <div class="field">
                <label>Shows per house</label>
                <select id="ct-menushows">
                    ${[1, 2, 3, 4].map(n => `<option value="${n}"${n === menuShows ? ' selected' : ''}>${
                        n === 1 ? 'Only what is on now' : `${n} — what is on now, and ${n - 1} before it`
                    }</option>`).join('')}
                </select>
                <div class="help">A house with nothing on shows its most recent, so the panel is
                    never empty.</div>
            </div>
        </div>
        <div class="card" style="max-width:760px;margin-bottom:16px">
            <h2>Product tiles</h2>
            <p class="sub">How a product looks in every grid on the site — the collection, the
                rails on the venue pages and the suggestions under a product.</p>
            <div class="field">
                <label style="display:flex;align-items:center;gap:9px;cursor:pointer">
                    <input type="checkbox" id="ct-tilebox" style="width:auto" ${tileBox ? 'checked' : ''}>
                    Show the box around each tile
                </label>
                <div class="help">On, a tile is a white plate with a hairline around it. Off, the
                    photograph sits directly on the page with no plate, no outline and no hover
                    lift.</div>
            </div>
        </div>
        ${defaultsCard(defaults)}
        <div class="card" style="max-width:760px;margin-bottom:16px">
            <h2>Inside Vayu</h2>
            <p class="sub">The block near the foot of the home page, filled in below with what
                it is showing right now. It follows the gallery's current show by itself — that
                show's hero is the wide photograph and its first two pictures are the thumbnails,
                all linking to its page — so putting up a new exhibition under What&rsquo;s On
                changes the home page with it. Change a field to hold it against that; empty a
                field to let it follow again. Saving without changing anything changes nothing.</p>
            ${show ? `<div class="help" style="margin:-4px 0 14px">Following
                <strong>${esc(show.title)}</strong> at Gallery Vayu${show.current ? ''
                    : ' — its most recent show, since none is marked as on now'}.</div>` : `<div
                class="help" style="margin:-4px 0 14px">No show on the gallery's programme yet, so
                this is what the page ships with. Add one under What&rsquo;s On and the block
                follows it.</div>`}
            <div class="slide-two">
                <div class="field"><label>Heading</label>
                    <input id="iv-title" value="${esc(live.title)}" placeholder="${esc(INSIDE_VAYU_SHIPPED.title)}"></div>
                <div class="field"><label>Link text</label>
                    <input id="iv-ctatext" value="${esc(live.ctaText)}" placeholder="${esc(INSIDE_VAYU_SHIPPED.ctaText)}"></div>
            </div>
            <div class="field"><label>Link goes to</label>
                <input id="iv-ctahref" value="${esc(live.ctaHref)}" placeholder="${esc(INSIDE_VAYU_SHIPPED.ctaHref)}"></div>

            <div class="field" style="margin-top:14px"><label>Wide photograph
                <span style="text-transform:none;letter-spacing:0;color:var(--muted)">— empty it to follow the current show</span></label>
                <div id="iv-hero-preview">${heroPreview(live.heroImg)}</div>
                <div class="slide-img-actions" style="margin:8px 0 12px">
                    <button type="button" class="btn small" id="iv-hero-pick">Upload</button>
                </div>
                <input id="iv-heroimg" value="${esc(live.heroImg)}" placeholder="${esc(INSIDE_VAYU_SHIPPED.heroImg)}"></div>
            <div class="slide-two">
                <div class="field"><label>Photograph description</label>
                    <input id="iv-heroalt" value="${esc(live.heroAlt)}" placeholder="${esc(INSIDE_VAYU_SHIPPED.heroAlt)}"></div>
                <div class="field"><label>Photograph goes to</label>
                    <input id="iv-herohref" value="${esc(live.heroHref)}" placeholder="${esc(INSIDE_VAYU_SHIPPED.heroHref)}"></div>
            </div>

            <div class="field" style="margin-top:14px"><label>Thumbnails</label>
                <div class="help">The current exhibition's own pictures, unless you change
                    them. Up to four, each able to point somewhere of its own. Remove them all to
                    follow the exhibition again.</div>
                <div id="iv-tiles" style="margin-top:10px"></div>
                <button class="btn small" id="iv-tile-add" type="button">+ Add thumbnail</button>
            </div>
        </div>
        <div class="card" style="max-width:760px;margin-bottom:16px">
            <h2>Featured artist</h2>
            <p class="sub">The wide picture directly under Inside Vayu on the home page, filled in
                below with what it is showing now. Empty a field to put back what the page ships
                with.</p>
            <div class="field"><label>Picture</label>
                <div id="ar-preview">${heroPreview(band.img)}</div>
                <div class="slide-img-actions" style="margin:8px 0 12px">
                    <button type="button" class="btn small" id="ar-pick">Upload</button>
                </div>
                <input id="ar-img" value="${esc(band.img)}" placeholder="${esc(ARTIST_BAND_SHIPPED.img)}"></div>
            <div class="slide-two">
                <div class="field"><label>Picture description</label>
                    <input id="ar-alt" value="${esc(band.alt)}" placeholder="${esc(ARTIST_BAND_SHIPPED.alt)}"></div>
                <div class="field"><label>Goes to</label>
                    <input id="ar-href" value="${esc(band.href)}" placeholder="${esc(ARTIST_BAND_SHIPPED.href)}"></div>
            </div>
            <div class="help">The band is one picture and nothing else, so the description is all
                a screen reader has to announce it by — and it is what the section is labelled
                with. Name the artist in it.</div>
        </div>
        <div class="card" style="max-width:760px">
            <h2>Home hero carousel</h2>
            <p class="sub">The full-width slideshow at the top of the home page. Each slide has its own
                image, heading, button text and button link — leave the heading and button empty to show
                the image alone as one big clickable poster.</p>
            <div id="ct-slides" class="slide-editor"></div>
            <button class="btn small" id="ct-slide-add" style="margin-top:12px">+ Add slide</button>
            <div class="modal-actions">
                <div class="form-error" id="ct-err"></div>
                <button class="btn primary" id="ct-save">Save content</button>
            </div>
        </div>`;

    /* ---- default detail rows ---- */

    const drawDefaults = (key) => {
        $(`#pd-${key}`).innerHTML = defaults[key].length
            ? defaults[key].map((r, i) => `
                <div class="det-row" data-key="${key}" data-i="${i}">
                    <input data-f="label" value="${esc(r.label)}" placeholder="Label">
                    <input data-f="value" value="${esc(r.value)}" placeholder="Value">
                    <button type="button" class="btn small danger" data-act="rm-row">✕</button>
                </div>`).join('')
            : '<div class="help">None — this section is hidden unless a product supplies its own.</div>';
    };
    for (const key of ['dimensions', 'materials']) drawDefaults(key);

    // Delegated from the view so it survives each redraw of the rows.
    viewEl.addEventListener('input', (e) => {
        const row = e.target.closest('.det-row[data-key]');
        if (row && e.target.dataset.f) defaults[row.dataset.key][Number(row.dataset.i)][e.target.dataset.f] = e.target.value;
    });
    viewEl.addEventListener('click', (e) => {
        const add = e.target.closest('button[data-add]');
        if (add) {
            defaults[add.dataset.add].push({ label: '', value: '' });
            drawDefaults(add.dataset.add);
            return;
        }
        const rm = e.target.closest('button[data-act="rm-row"]');
        if (rm) {
            const row = rm.closest('.det-row');
            defaults[row.dataset.key].splice(Number(row.dataset.i), 1);
            drawDefaults(row.dataset.key);
        }
    });

    const slidesEl = $('#ct-slides');
    const draw = () => {
        slidesEl.innerHTML = slides.map((s, i) => slideCard(s, i, slides.length)).join('')
            || '<div class="empty">No slides — the home page will show its built-in hero.</div>';
    };
    draw();

    // Typing updates the model in place without redrawing, so the caret
    // never jumps out of the field being edited.
    slidesEl.addEventListener('input', (e) => {
        const row = e.target.closest('[data-i]');
        if (row && e.target.dataset.f) slides[Number(row.dataset.i)][e.target.dataset.f] = e.target.value;
    });

    slidesEl.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const i = Number(btn.closest('[data-i]').dataset.i);

        switch (btn.dataset.act) {
            case 'pick': {
                const url = await pickImage();
                if (!url) return;
                // data-f says which slot's button this was — desktop or phone.
                slides[i][btn.dataset.f || 'img'] = url;
                break;
            }
            case 'rm': slides.splice(i, 1); break;
            case 'up': if (i > 0) [slides[i - 1], slides[i]] = [slides[i], slides[i - 1]]; break;
            case 'down': if (i < slides.length - 1) [slides[i + 1], slides[i]] = [slides[i], slides[i + 1]]; break;
        }
        draw();
    });

    $('#ct-slide-add').addEventListener('click', () => {
        slides.push({ ...BLANK_SLIDE });
        draw();
    });

    /* ---- Inside Vayu ---- */
    const drawTiles = () => {
        $('#iv-tiles').innerHTML = tiles.map((t, i) => `
            <div class="slide-two" data-tile="${i}" style="margin-bottom:10px">
                <div class="field"><label>Picture ${i + 1}</label>
                    <div style="display:flex;gap:8px">
                        <input class="iv-tile-img" value="${esc(t.img)}" placeholder="/assets/images/gallery_tile1.jpg">
                        <button type="button" class="btn small" data-tile-pick="${i}">Upload</button>
                        <button type="button" class="btn small danger" data-tile-del="${i}">✕</button>
                    </div></div>
                <div class="field"><label>Goes to</label>
                    <input class="iv-tile-href" value="${esc(t.href)}" placeholder="/pages/event.html?id=…"></div>
                <div class="field" style="grid-column:1 / -1"><label>Description</label>
                    <input class="iv-tile-alt" value="${esc(t.alt)}" placeholder="What the picture shows"></div>
            </div>`).join('') || '<div class="empty">None — the row follows the current exhibition&rsquo;s pictures.</div>';
    };

    /** Read the rows back before anything redraws them. */
    const readTiles = () => [...document.querySelectorAll('#iv-tiles [data-tile]')].map(row => ({
        img: row.querySelector('.iv-tile-img').value.trim(),
        href: row.querySelector('.iv-tile-href').value.trim(),
        alt: row.querySelector('.iv-tile-alt').value.trim(),
    })).filter(t => t.img);

    drawTiles();

    $('#ar-pick').addEventListener('click', async () => {
        const url = await pickImage();
        if (!url) return;
        $('#ar-img').value = url;
        $('#ar-preview').innerHTML = heroPreview(url);
    });

    $('#iv-hero-pick').addEventListener('click', async () => {
        const url = await pickImage();
        if (!url) return;
        $('#iv-heroimg').value = url;
        $('#iv-hero-preview').innerHTML = heroPreview(url);
    });

    $('#iv-tile-add').addEventListener('click', () => {
        if (tiles.length >= 4) return;
        tiles = [...readTiles(), { img: '', alt: '', href: '' }];
        drawTiles();
    });

    $('#iv-tiles').addEventListener('click', async (e) => {
        const del = e.target.closest('[data-tile-del]');
        const pick = e.target.closest('[data-tile-pick]');
        if (del) {
            tiles = readTiles().filter((_, i) => i !== Number(del.dataset.tileDel));
            drawTiles();
            return;
        }
        if (pick) {
            const url = await pickImage();
            if (!url) return;
            const current = readTiles();
            const i = Number(pick.dataset.tilePick);
            current[i] = { ...(current[i] || { alt: '', href: '' }), img: url };
            tiles = current;
            drawTiles();
        }
    });

    $('#ct-save').addEventListener('click', async () => {
        const err = $('#ct-err');
        err.textContent = '';
        if (slides.some(s => !String(s.img).trim())) {
            err.textContent = 'Every slide needs an image (or remove the empty slide).';
            return;
        }

        // Inside Vayu's fields arrived filled with what the page is showing,
        // so what is stored is only what the shop actually changed. A value
        // still equal to what the block would show by itself is stored empty
        // — that is what keeps it following the exhibition rather than
        // freezing today's picture onto the home page for good. A field
        // overridden on some earlier visit differs from `derived` and so is
        // written back as it stands.
        const pin = (value, self) => (value === self ? '' : value);
        const rowTiles = readTiles();

        try {
            const r = await api('content', 'PUT', {
                announcement: $('#ct-ann').value,
                productTileBox: $('#ct-tilebox').checked,
                menuShows: Number($('#ct-menushows').value),
                heroSlides: slides,
                insideVayu: {
                    title: pin($('#iv-title').value.trim(), derived.title),
                    ctaText: pin($('#iv-ctatext').value.trim(), derived.ctaText),
                    ctaHref: pin($('#iv-ctahref').value.trim(), derived.ctaHref),
                    heroImg: pin($('#iv-heroimg').value.trim(), derived.heroImg),
                    heroAlt: pin($('#iv-heroalt').value.trim(), derived.heroAlt),
                    heroHref: pin($('#iv-herohref').value.trim(), derived.heroHref),
                    tiles: sameTiles(rowTiles, derived.tiles) ? [] : rowTiles,
                },
                contact: {
                    phone: $('#ct-phone').value.trim(),
                    email: $('#ct-email').value.trim(),
                    // Built from the same list the fields were drawn from, so
                    // a network added to SOCIAL_NETWORKS cannot end up with an
                    // input the save silently ignores.
                    ...Object.fromEntries(SOCIAL_NETWORKS.map(
                        n => [n.key, $(`#ct-soc-${n.key}`).value.trim()],
                    )),
                },
                artist: {
                    img: pin($('#ar-img').value.trim(), ARTIST_BAND_SHIPPED.img),
                    alt: pin($('#ar-alt').value.trim(), ARTIST_BAND_SHIPPED.alt),
                    href: pin($('#ar-href').value.trim(), ARTIST_BAND_SHIPPED.href),
                },
                productDefaults: {
                    description: $('#pd-desc').value.trim(),
                    care: $('#pd-care').value.trim(),
                    // Rows with no label are dropped here as well as on the
                    // server, so an empty pair left behind by "+ Row" does
                    // not come back as a blank line on every product page.
                    dimensions: defaults.dimensions.filter(r_ => r_.label.trim()),
                    materials: defaults.materials.filter(r_ => r_.label.trim()),
                },
            });
            slides = structuredClone(r.content.heroSlides || []);
            draw();
            toast('Saved — refresh the home page to see it');
        } catch (error_) { err.textContent = error_.message; }
    });
}

/* ================= curated spaces ================= */

/**
 * The Curated Spaces page, edited whole.
 *
 * It gets its own view rather than a fourth card under Site Content
 * because it is a page, not a setting: it has a hero, a statement and a
 * variable number of rooms, and folding that into the content form would
 * have made one very long scroll behind a single save button.
 *
 * The plates reuse the hero carousel's .slide-* rows, so a room is edited
 * with the same picture-left / fields-right shape as a slide and the panel
 * keeps one way of editing an image with words attached to it.
 */

/**
 * A room's category is picked from the live taxonomy rather than typed: it
 * is looked up against the catalogue by that slug, and a typo would leave
 * the room's rail silently empty with nothing to say why.
 */
function categoryOptions(selected) {
    const cats = Object.entries(state.categories || {});
    const known = cats.some(([slug]) => slug === selected);
    return [
        `<option value=""${selected ? '' : ' selected'}>— none (no pieces below) —</option>`,
        ...cats.map(([slug]) => `
            <option value="${esc(slug)}"${slug === selected ? ' selected' : ''}>${esc(catTitle(slug))}</option>`),
        // A category since renamed or removed still shows, so opening the
        // form does not quietly repoint the room at something else.
        !known && selected ? `<option value="${esc(selected)}" selected>${esc(selected)} (missing)</option>` : '',
    ].join('');
}

function roomCard(r, i, total) {
    const preview = r.img
        ? `<img src="${esc(r.img)}" alt="">`
        : '<div class="slide-img-empty">No image</div>';

    return `
        <div class="slide-row" data-i="${i}">
            <div class="slide-img">
                ${preview}
                <div class="slide-img-actions">
                    <button type="button" class="btn small" data-act="pick">Upload</button>
                </div>
            </div>
            <div class="slide-fields">
                <div class="slide-head">
                    <b>Room ${i + 1}</b>
                    <div class="slide-move">
                        <button type="button" class="btn small" data-act="up" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button>
                        <button type="button" class="btn small" data-act="down" ${i === total - 1 ? 'disabled' : ''} title="Move down">↓</button>
                        <button type="button" class="btn small danger" data-act="rm" title="Remove room">✕</button>
                    </div>
                </div>
                <div class="field"><label>Image URL</label>
                    <input data-f="img" value="${esc(r.img)}" placeholder="/assets/images/cat_furniture.jpg"></div>
                <div class="slide-two">
                    <div class="field"><label>Room name</label>
                        <input data-f="name" value="${esc(r.name)}" placeholder="The Living Room"></div>
                    <div class="field"><label>Caption</label>
                        <input data-f="tag" value="${esc(r.tag)}" placeholder="Furniture"></div>
                </div>
                <div class="field"><label>Furnished from</label>
                    <select data-f="category">${categoryOptions(r.category)}</select>
                    <div class="help">The pieces under &ldquo;Shop the Spaces&rdquo; come from this category.</div></div>
                <div class="field"><label>Image description (for screen readers)</label>
                    <input data-f="alt" value="${esc(r.alt)}" placeholder="A chair, a throw and a vase in a quiet corner"></div>
            </div>
        </div>`;
}

const heroPreview = (img) => img
    ? `<img src="${esc(img)}" alt="" style="width:100%;max-height:220px;object-fit:cover">`
    : '<div class="slide-img-empty" style="height:140px">No image</div>';

export async function renderCuratedSpaces() {
    const { content } = await api('content');
    const saved = withCuratedDefaults(content.curatedSpaces);
    let rooms = structuredClone(saved.rooms);

    viewEl.innerHTML = `
        <div class="card" style="max-width:760px;margin-bottom:16px">
            <h2>Page heading</h2>
            <p class="sub">The title at the top of the Curated Spaces page, and the small note
                beside it.</p>
            <div class="slide-two">
                <div class="field"><label>Title</label>
                    <input id="cs-title" value="${esc(saved.title)}" placeholder="${esc(CURATED_SPACES_DEFAULT.title)}"></div>
                <div class="field"><label>Note</label>
                    <input id="cs-meta" value="${esc(saved.meta)}" placeholder="${esc(CURATED_SPACES_DEFAULT.meta)}"></div>
            </div>
        </div>

        <div class="card" style="max-width:760px;margin-bottom:16px">
            <h2>Hero image</h2>
            <p class="sub">The wide photograph under the title. A photographed room reads better here
                than a catalogue shot on white.</p>
            <div id="cs-hero-preview">${heroPreview(saved.heroImg)}</div>
            <div class="slide-img-actions" style="margin:8px 0 12px">
                <button type="button" class="btn small" id="cs-hero-pick">Upload</button>
            </div>
            <div class="field"><label>Image URL</label>
                <input id="cs-heroImg" value="${esc(saved.heroImg)}" placeholder="/assets/images/cat_furniture.jpg"></div>
            <div class="field" style="margin-top:12px"><label>Image description (for screen readers)</label>
                <input id="cs-heroAlt" value="${esc(saved.heroAlt)}" placeholder="A room set with cane and teak"></div>
        </div>

        <div class="card" style="max-width:760px;margin-bottom:16px">
            <h2>Introduction</h2>
            <p class="sub">The line in italics between the hero and the rooms.</p>
            <div class="field"><textarea id="cs-statement" rows="3">${esc(saved.statement)}</textarea></div>
        </div>

        <div class="card" style="max-width:760px;margin-bottom:16px">
            <h2>Section headings</h2>
            <div class="slide-two">
                <div class="field"><label>Rooms section</label>
                    <input id="cs-sectionTitle" value="${esc(saved.sectionTitle)}" placeholder="${esc(CURATED_SPACES_DEFAULT.sectionTitle)}"></div>
                <div class="field"><label>Note beside it</label>
                    <input id="cs-sectionNote" value="${esc(saved.sectionNote)}" placeholder="${esc(CURATED_SPACES_DEFAULT.sectionNote)}"></div>
            </div>
            <div class="field" style="margin-top:12px"><label>Products section</label>
                <input id="cs-shopTitle" value="${esc(saved.shopTitle)}" placeholder="${esc(CURATED_SPACES_DEFAULT.shopTitle)}"></div>
        </div>

        <div class="card" style="max-width:760px">
            <h2>The rooms</h2>
            <p class="sub">Each room is one plate on the page. The category it is furnished from also
                fills the product rail underneath, so the pictures and the pieces stay in step.</p>
            <div id="cs-rooms" class="slide-editor"></div>
            <button class="btn small" id="cs-room-add" style="margin-top:12px">+ Add room</button>
            <div class="modal-actions">
                <div class="form-error" id="cs-err"></div>
                <button class="btn primary" id="cs-save">Save page</button>
            </div>
        </div>`;

    const roomsEl = $('#cs-rooms');
    const draw = () => {
        roomsEl.innerHTML = rooms.map((r, i) => roomCard(r, i, rooms.length)).join('')
            || '<div class="empty">No rooms — the page will show the three it ships with.</div>';
    };
    draw();

    // Typing updates the model in place without redrawing, so the caret
    // never jumps out of the field being edited. <select> fires change
    // rather than input, so both are listened for.
    const track = (e) => {
        const row = e.target.closest('[data-i]');
        if (row && e.target.dataset.f) rooms[Number(row.dataset.i)][e.target.dataset.f] = e.target.value;
    };
    roomsEl.addEventListener('input', track);
    roomsEl.addEventListener('change', track);

    roomsEl.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const i = Number(btn.closest('[data-i]').dataset.i);

        switch (btn.dataset.act) {
            case 'pick': {
                const url = await pickImage();
                if (!url) return;
                rooms[i].img = url;
                break;
            }
            case 'rm': rooms.splice(i, 1); break;
            case 'up': if (i > 0) [rooms[i - 1], rooms[i]] = [rooms[i], rooms[i - 1]]; break;
            case 'down': if (i < rooms.length - 1) [rooms[i + 1], rooms[i]] = [rooms[i], rooms[i + 1]]; break;
        }
        draw();
    });

    $('#cs-room-add').addEventListener('click', () => {
        rooms.push({ ...BLANK_ROOM });
        draw();
    });

    $('#cs-hero-pick').addEventListener('click', async () => {
        const url = await pickImage();
        if (!url) return;
        $('#cs-heroImg').value = url;
        $('#cs-hero-preview').innerHTML = heroPreview(url);
    });

    $('#cs-save').addEventListener('click', async () => {
        const err = $('#cs-err');
        err.textContent = '';
        if (rooms.some(r => !String(r.img).trim())) {
            err.textContent = 'Every room needs an image (or remove the empty room).';
            return;
        }
        try {
            const r = await api('content', 'PUT', {
                curatedSpaces: {
                    title: $('#cs-title').value.trim(),
                    meta: $('#cs-meta').value.trim(),
                    heroImg: $('#cs-heroImg').value.trim(),
                    heroAlt: $('#cs-heroAlt').value.trim(),
                    statement: $('#cs-statement').value.trim(),
                    sectionTitle: $('#cs-sectionTitle').value.trim(),
                    sectionNote: $('#cs-sectionNote').value.trim(),
                    shopTitle: $('#cs-shopTitle').value.trim(),
                    rooms,
                },
            });
            rooms = structuredClone(withCuratedDefaults(r.content.curatedSpaces).rooms);
            draw();
            toast('Saved — refresh the Curated Spaces page to see it');
        } catch (error_) { err.textContent = error_.message; }
    });
}

/* ================= team ================= */

const ROLES = ['owner', 'manager', 'staff'];

function addMemberModal(onDone) {
    const modal = openModal(`
        <h2>Add team member</h2>
        <div class="form-grid">
            <div class="field"><label>Name</label><input id="tm-name"></div>
            <div class="field"><label>Role</label><select id="tm-role">
                ${ROLES.slice().reverse().map(r => `<option value="${r}">${r}</option>`).join('')}</select></div>
            <div class="field full"><label>Email</label><input id="tm-email" type="email"></div>
            <div class="field full"><label>Temporary password (min 8 chars)</label><input id="tm-pass">
                <div class="help">They'll be asked to change it on first sign-in.</div></div>
        </div>
        <div class="modal-actions">
            <div class="form-error" id="tm-err"></div>
            <button class="btn" id="tm-cancel">Cancel</button>
            <button class="btn primary" id="tm-save">Add member</button>
        </div>`, true);

    const err = modalChrome(modal, '#tm-cancel', '#tm-err');
    $('#tm-save', modal).addEventListener('click', async () => {
        try {
            await api('team', 'POST', {
                name: $('#tm-name', modal).value.trim(),
                email: $('#tm-email', modal).value.trim(),
                role: $('#tm-role', modal).value,
                password: $('#tm-pass', modal).value,
            });
            closeModal();
            toast('Member added');
            onDone();
        } catch (error_) { err.textContent = error_.message; }
    });
}

/**
 * A member's picture and name in one cell.
 *
 * Initials when there is no picture — a password admin, or a Google one who
 * has not signed in since the avatar started being captured. onerror hides a
 * URL that has stopped resolving, because Google rotates these and a torn
 * image reads as a broken panel rather than a missing photo.
 */
const who = (m) => `
    <span class="who">${m.avatar
        ? `<img class="avatar" src="${esc(m.avatar)}" alt="" onerror="this.remove()">`
        : `<span class="avatar initials">${esc((m.name || m.email || '?').trim().charAt(0).toUpperCase())}</span>`}
        <b>${esc(m.name)}</b></span>`;

export async function renderTeam() {
    const { team } = await api('team');

    // Requests first, and in their own table. A pending row has no business
    // in the members list: it has no role to change yet, and showing the
    // role selector beside somebody who cannot sign in reads as though they
    // already can.
    const waiting = team.filter(m => m.status === 'pending');
    const members = team.filter(m => m.status !== 'pending');

    const pendingRows = waiting.map(m => `
        <tr data-id="${m.id}">
            <td>${who(m)}</td>
            <td>${esc(m.email)}</td>
            <td><select class="status-select" data-act="grant">
                ${ROLES.map(r => `<option ${r === 'staff' ? 'selected' : ''}>${r}</option>`).join('')}</select></td>
            <td>${dateFmt(m.createdAt)}</td>
            <td style="white-space:nowrap">
                <button class="btn small primary" data-act="approve">Approve</button>
                <button class="btn small danger" data-act="del">Reject</button>
            </td>
        </tr>`).join('');

    const rows = members.map(m => `
        <tr data-id="${m.id}">
            <td>${who(m)}${m.id === state.meId ? ' <span class="chip">you</span>' : ''}</td>
            <td>${esc(m.email)}</td>
            <td><select class="status-select" data-act="role">
                ${ROLES.map(r => `<option ${m.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></td>
            <td>${dateFmt(m.createdAt)}</td>
            <td><button class="btn small danger" data-act="del">Remove</button></td>
        </tr>`).join('');

    const pendingCard = waiting.length ? `
        <div class="card" style="margin-bottom:16px">
            <h2>Waiting for approval ${waiting.length > 1 ? `(${waiting.length})` : ''}</h2>
            <p class="sub" style="margin-top:0">Signed in with Google and cannot reach anything yet. Pick
                what they should be able to do, then approve — or reject, which deletes the request.</p>
            <div class="table-scroll"><table class="grid">
                <thead><tr><th>Name</th><th>Email</th><th>Give the role</th><th>Asked</th><th></th></tr></thead>
                <tbody id="pending-rows">${pendingRows}</tbody>
            </table></div>
        </div>` : '';

    viewEl.innerHTML = `
        <div class="toolbar">
            <div class="spacer"></div>
            <button class="btn primary" id="new-member">+ Add member</button>
        </div>
        ${pendingCard}
        <div class="card">
            <p class="sub" style="margin-top:0"><b>owner</b> — everything · <b>manager</b> — everything except team, settings &amp; backups · <b>staff</b> — orders, customers, outbox &amp; analytics only.</p>
            <div class="table-scroll"><table class="grid">
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Since</th><th></th></tr></thead>
                <tbody id="team-rows">${rows}</tbody>
            </table></div>
        </div>`;

    $('#new-member').addEventListener('click', () => addMemberModal(renderTeam));

    // Approve / reject. Sends the role chosen in the same row, so approving
    // and ranking are one decision rather than two screens.
    const pendingEl = $('#pending-rows');
    if (pendingEl) {
        pendingEl.addEventListener('click', async (e) => {
            const btn = e.target.closest('button[data-act]');
            if (!btn) return;
            const tr = btn.closest('tr');
            const id = tr.dataset.id;
            const member = waiting.find(m => m.id === id);

            if (btn.dataset.act === 'approve') {
                const role = tr.querySelector('select[data-act=grant]').value;
                await guard(
                    () => api(`team/${id}`, 'PUT', { email: member.email, role, status: 'active' }),
                    'Approved',
                );
                renderTeam();
                return;
            }
            if (!confirm(`Reject ${member.email}? They can ask again by signing in.`)) return;
            if (await guard(() => api(`team/${id}`, 'DELETE'), 'Request rejected')) renderTeam();
        });
    }

    const rowsEl = $('#team-rows');
    rowsEl.addEventListener('change', async (e) => {
        const sel = e.target.closest('select[data-act=role]');
        if (!sel) return;
        const id = sel.closest('tr').dataset.id;
        // On failure the row still shows the new value, so re-render to
        // put the select back to what the server actually has.
        const member = members.find(m => m.id === id);
        if (!await guard(
            () => api(`team/${id}`, 'PUT', { email: member.email, role: sel.value }),
            'Role updated',
        )) renderTeam();
    });
    rowsEl.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-act=del]');
        if (!btn) return;
        const id = btn.closest('tr').dataset.id;
        const member = members.find(m => m.id === id);
        if (!await confirmDelete({
            title: `Remove ${esc(member.email)}?`,
            body: `<p>They are signed out immediately and lose access to the panel. If they sign in
                   with Google again they will land back in the approval queue.</p>`,
        })) return;
        if (await guard(() => api(`team/${id}`, 'DELETE'), 'Member removed')) renderTeam();
    });
}

/* ================= settings ================= */

function storeCard(s) {
    return `
        <div class="card">
            <h2>Store</h2>
            <div class="form-grid">
                <div class="field full"><label>Store name</label><input id="s-name" value="${esc(s.storeName)}"></div>
                <div class="field"><label>Free shipping above (₹)</label><input id="s-free" type="number" min="0" value="${s.freeShippingAbove}"></div>
                <div class="field"><label>Flat shipping (₹)</label><input id="s-flat" type="number" min="0" value="${s.shippingFlat}"></div>
                <div class="field"><label>Low-stock alert at</label><input id="s-low" type="number" min="0" value="${s.lowStockThreshold}"></div>
                <div class="field"><label>Store email</label><input id="s-email" value="${esc(s.storeEmail)}"></div>
                <div class="field full"><label>Store phone</label><input id="s-phone" value="${esc(s.storePhone)}"></div>
                <div class="field full"><label>Store address (appears on invoices)</label><input id="s-addr" value="${esc(s.storeAddress)}"></div>
            </div>
            <h2 style="margin-top:22px">Shipping zones</h2>
            <p class="sub">Rates by PIN prefix — first match wins; anything else uses the flat rate. Free-shipping threshold still applies.</p>
            <div id="s-zones" style="display:grid;gap:8px"></div>
            <button class="btn small" id="s-zone-add" style="margin-top:8px">+ Add zone</button>
            <h2 style="margin-top:22px">Payments</h2>
            <div class="form-grid">
                <div class="field full"><label>Provider</label><select id="s-pay">
                    <option value="cod" ${s.payment.provider !== 'razorpay' ? 'selected' : ''}>Record orders only (pay on delivery / offline)</option>
                    <option value="razorpay" ${s.payment.provider === 'razorpay' ? 'selected' : ''}>Razorpay (online payment)</option></select></div>
                <div class="field"><label>Razorpay Key ID</label><input id="s-rzp-id" value="${esc(s.payment.razorpayKeyId)}" placeholder="rzp_live_…"></div>
                <div class="field"><label>Razorpay Key Secret</label><input id="s-rzp-secret" type="password" value="${esc(s.payment.razorpayKeySecret)}"></div>
                <div class="field full"><div class="help">Razorpay only takes effect when both keys are filled in — until then checkout records the order for offline payment.</div></div>
            </div>
            <div class="modal-actions"><button class="btn primary" id="s-save">Save settings</button></div>
        </div>`;
}

function backupsCard(backups) {
    const rows = backups.map(b => `
        <div class="mini-row"><div class="grow"><div class="nm" style="font-weight:400">${esc(b.file)}</div></div>
            <div class="meta">${Math.round(b.size / 1024)} KB</div>
            <a class="btn small" href="/api/admin/backup/${encodeURIComponent(b.file)}">Download</a></div>`).join('');

    return `
        <div class="card" style="margin-top:16px">
            <h2>Backups</h2>
            <p class="sub">A copy of the whole database (products, orders, customers…) — one is taken automatically at every server start; the newest 20 are kept in admin/data/backups.</p>
            <div class="toolbar"><button class="btn primary" id="bk-now">Back up now</button></div>
            ${backups.length ? `<div class="mini-list">${rows}</div>` : '<div class="empty">No backups yet.</div>'}
        </div>`;
}

/** Zones are edited as a small repeating list, like variants and subs. */
function wireZones(settings) {
    const zones = structuredClone(settings.zones || []);
    const zonesEl = $('#s-zones');

    const draw = () => {
        zonesEl.innerHTML = zones.map((z, i) => `
            <div style="display:grid;grid-template-columns:1.2fr 1.5fr .8fr auto;gap:8px" data-i="${i}">
                <input placeholder="Zone name" value="${esc(z.name)}" data-f="name">
                <input placeholder="PIN prefixes, e.g. 11, 12, 40" value="${esc(Array.isArray(z.pinPrefixes) ? z.pinPrefixes.join(', ') : z.pinPrefixes)}" data-f="pinPrefixes">
                <input placeholder="Rate ₹" type="number" min="0" value="${z.rate}" data-f="rate">
                <button class="btn small danger" data-act="rm">✕</button>
            </div>`).join('') || '<div class="empty" style="padding:10px">No zones — flat rate applies everywhere.</div>';
    };
    draw();

    zonesEl.addEventListener('input', (e) => {
        const row = e.target.closest('[data-i]');
        if (row) zones[Number(row.dataset.i)][e.target.dataset.f] = e.target.value;
    });
    zonesEl.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-act=rm]');
        if (btn) { zones.splice(Number(btn.closest('[data-i]').dataset.i), 1); draw(); }
    });
    $('#s-zone-add').addEventListener('click', () => {
        zones.push({ name: '', pinPrefixes: '', rate: 150 });
        draw();
    });

    return zones;
}

export async function renderSettings() {
    const isOwner = state.me?.role === 'owner';

    // Store settings and backups are owner-only; a manager or staff member
    // still gets this page for their own password.
    const settings = isOwner ? (await api('settings')).settings : null;
    const backups = isOwner ? (await api('backup')).backups : [];

    const accountCard = `
        <div class="card">
            <h2>Account</h2>
            <p class="sub">Signed in as ${esc(state.me?.email || '')} (${esc(state.me?.role || '')})</p>
            <div class="form-grid">
                <div class="field full"><label>Current password</label><input id="pw-cur" type="password" autocomplete="current-password"></div>
                <div class="field full"><label>New password (min 8 chars)</label><input id="pw-new" type="password" autocomplete="new-password"></div>
            </div>
            <div class="modal-actions">
                <div class="form-error" id="pw-err"></div>
                <button class="btn primary" id="pw-save">Change password</button>
            </div>
        </div>`;

    viewEl.innerHTML = `
        ${state.me?.mustChangePassword ? `<div class="card" style="border-color:var(--warning);margin-bottom:16px">
            <b>Change your password.</b> You're still on the first-run password — set a new one below.</div>` : ''}
        <div class="dash-grid-2">
            ${settings ? storeCard(settings) : ''}
            ${accountCard}
        </div>
        ${settings ? backupsCard(backups) : ''}`;

    if (settings) {
        const zones = wireZones(settings);

        $('#s-save').addEventListener('click', () => guard(() => api('settings', 'PUT', {
            storeName: $('#s-name').value,
            freeShippingAbove: Number($('#s-free').value),
            shippingFlat: Number($('#s-flat').value),
            lowStockThreshold: Number($('#s-low').value),
            storeEmail: $('#s-email').value,
            storePhone: $('#s-phone').value,
            storeAddress: $('#s-addr').value,
            zones,
            payment: {
                provider: $('#s-pay').value,
                razorpayKeyId: $('#s-rzp-id').value.trim(),
                razorpayKeySecret: $('#s-rzp-secret').value.trim(),
            },
        }), 'Settings saved'));

        $('#bk-now').addEventListener('click', async () => {
            try {
                const r = await api('backup', 'POST', {});
                toast(`Backed up: ${r.file}`);
                renderSettings();
            } catch (err) { toast(err.message, true); }
        });
    }

    $('#pw-save').addEventListener('click', async () => {
        const err = $('#pw-err');
        err.textContent = '';
        try {
            await api('password', 'POST', { current: $('#pw-cur').value, next: $('#pw-new').value });
            toast('Password changed');
            state.me.mustChangePassword = false;
            $('#pw-cur').value = '';
            $('#pw-new').value = '';
        } catch (error_) { err.textContent = error_.message; }
    });
}
