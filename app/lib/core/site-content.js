/**
 * Vayu — the parts of the page the admin panel owns.
 *
 * All of this is additive: when the API is down (`remote` is null) the
 * page simply looks the way it always did.
 */

import { site } from '#lib/stores/site.svelte.js';
import { escapeHtml } from './html.js';
import { venueById, eventsOf } from '#lib/data/events.js';
import { insideVayuEffective, currentShow } from '#shared/content/inside-vayu.js';
import { artistBandEffective } from '#shared/content/home-artist.js';
import { deliverySrc, sizeAttrs, phonePictureHTML } from '#shared/content/picture.js';
import { initHero } from './hero.js';
import { measureBars } from './shell.js';

/* ---------- announcement bar ---------- */

/**
 * The strip across the very top of the page.
 *
 * It goes inside the <header>, above the nav row — not prepended to <body>,
 * which is where it used to go and why it never appeared on the home page.
 * On desktop the header is `position: fixed`, and only pages *without* the
 * full-bleed hero take a body top padding to clear it (see styles.css). The
 * home page is the one page that has that hero, so it has no padding, and a
 * bar sitting at the top of the body was covered by the fixed header on the
 * only page anyone would announce anything on.
 *
 * Inside the header it also rides along for free: --hdr-h is measured from
 * header.offsetHeight, so every content offset that depends on it — the body
 * padding, the COLLECTION dropdown, the sticky product gallery — accounts for
 * the bar without being told about it. measureBars() re-runs that
 * measurement, because the bar arrives after the shell has already measured.
 */
function renderAnnouncement(text) {
    if (!text || document.getElementById('vayuAnnouncement')) return;
    const bar = document.createElement('div');
    bar.id = 'vayuAnnouncement';
    bar.textContent = text;

    const header = document.getElementById('header');
    if (header) header.prepend(bar);
    else document.body.prepend(bar);
    measureBars();

    // The bar rolls up on scroll, which changes the header's height — and
    // --hdr-h is what the COLLECTION dropdown's `top` and the sticky product
    // gallery are positioned from. Re-measuring at the end of the roll rather
    // than at the start of it: offsetHeight mid-transition is a number the
    // bar is only passing through.
    bar.addEventListener('transitionend', (e) => {
        if (e.propertyName === 'max-height') measureBars();
    });
}

/* ---------- home hero carousel ---------- */

/**
 * The slide's picture, with the phone crop when the shop has uploaded one.
 *
 * The markup this used to build by hand is `phonePictureHTML` now, shared
 * with the show heroes on the venue and event pages — those grew the same
 * field, and two hand-rolled <picture> elements answering the same question
 * is how the breakpoint in one of them ends up not matching the other. That
 * function is also where the reasoning lives: why <picture> and not a script
 * swapping the src, and why a phone crop is a different photograph rather
 * than a different encoding of one.
 */
const slidePicture = (s, i) => phonePictureHTML(s.img, s.imgMobile, {
    alt: s.alt,
    // The first slide is the page's LCP element; the rest are behind the
    // carousel and can wait.
    priority: i === 0,
    escape: escapeHtml,
});

/**
 * Editable in the admin panel (Site content → Home hero carousel). The
 * markup mirrors what index.html ships with, so the stylesheet and the
 * slideshow script need no special case: a slide with a heading gets the
 * darkened overlay and a button, a slide without one is a poster whose
 * whole image is the link.
 */
function slideHTML(s, i) {
    const active = i === 0 ? ' is-active' : '';
    const img = slidePicture(s, i);

    // No heading and no button — the image itself is the whole slide.
    if (!s.title && !s.ctaText) {
        return s.ctaHref
            ? `<a class="hero-slide hero-slide-poster${active}" data-hero-slide href="${escapeHtml(s.ctaHref)}">${img}</a>`
            : `<div class="hero-slide hero-slide-poster${active}" data-hero-slide>${img}</div>`;
    }

    // Only the first slide's heading is an <h1>; the rest are <h2> so the
    // page keeps one top-level heading. Both wear the same class.
    const tag = i === 0 ? 'h1' : 'h2';
    return `<div class="hero-slide${active}" data-hero-slide>
        ${img}
        <div class="hero-full-content">
            <div class="hero-full-inner">
                ${s.title ? `<${tag} class="hero-full-title">${escapeHtml(s.title)}</${tag}>` : ''}
                ${s.ctaText ? `<a href="${escapeHtml(s.ctaHref || '#')}" class="hero-full-btn">${escapeHtml(s.ctaText)}</a>` : ''}
            </div>
        </div>
    </div>`;
}

/**
 * One rail per slide — pointless with a single slide, which the slideshow
 * script also leaves static.
 */
function heroBarsHTML(slides) {
    if (slides.length < 2) return '';
    return `<div class="hero-bars" role="tablist" aria-label="Choose slide">
        ${slides.map((s, i) => `
            <button type="button" class="hero-bar${i === 0 ? ' is-active' : ''}" role="tab"
                aria-selected="${i === 0}" aria-label="${escapeHtml(s.title || s.alt || `Slide ${i + 1}`)}">
                <span class="hero-bar-fill"></span>
            </button>`).join('')}
       </div>`;
}

function renderHero(slides) {
    const onHome = location.pathname === '/' || location.pathname.endsWith('/index.html');
    const hero = document.getElementById('homeHero');
    if (!onHome || !hero || !Array.isArray(slides) || !slides.length) return;

    hero.innerHTML = slides.map(slideHTML).join('') + heroBarsHTML(slides);
    initHero();
}

/* ---------- product tiles ---------- */

/**
 * The shop-wide tile treatment (Site content -> Product tiles).
 *
 * A class on <body> rather than a rewrite of every tile: the tiles are
 * rendered in half a dozen places — the collection grid, the venue rails,
 * the "you may also like" row — and they are re-rendered as a visitor
 * filters. A class set once applies to every tile that exists now and every
 * tile drawn later, with nothing to remember.
 *
 * Default is boxed: `undefined` (nothing saved yet) must keep the look the
 * shop already has, so only an explicit `false` strips the plate.
 */
function renderTileStyle(boxed) {
    document.body.classList.toggle('tiles-flat', boxed === false);
}

/**
 * The "Inside Vayu" block on the home page: a heading, a link, one wide
 * photograph and the row of thumbnails under it.
 *
 * It was three hardcoded <img> tags — gallery_hero.jpg, gallery_tile1.jpg
 * and summer_cut.png — all linking to the gallery page, so the home page
 * went on advertising a season the shop had moved past, and the only way to
 * change it was a deploy.
 *
 * It now draws itself from the gallery's current show, which is already in
 * the panel under What's On: that show's hero becomes the wide photograph,
 * its first plates become the thumbnails, and all of them open the show's
 * own page. Nothing has to be entered twice, and the block cannot fall
 * behind the programme — putting up a new exhibition changes the home page
 * as a consequence of putting it up.
 *
 * Which of the three sources wins each field is decided in
 * shared/content/inside-vayu.js rather than here, because the admin panel
 * has to reach the same answer: the card there shows the shop what is on
 * the page right now, and it can only do that by running this same order.
 */
function renderInsideVayu(saved) {
    const section = document.querySelector('.gallery-tiles');
    if (!section) return;

    const gallery = venueById('gallery-vayu');
    const inside = insideVayuEffective(saved, currentShow(gallery ? eventsOf(gallery) : []));

    const title = section.querySelector('.sec-title');
    if (title) title.textContent = inside.title;

    const cta = section.querySelector('.link-cta');
    if (cta) {
        cta.innerHTML = `${escapeHtml(inside.ctaText)} &nbsp;&rarr;`;
        cta.href = inside.ctaHref;
    }

    const hero = section.querySelector('.gallery-tiles-hero');
    const heroEl = hero?.querySelector('img');
    if (heroEl) {
        heroEl.src = inside.heroImg;
        heroEl.alt = inside.heroAlt;
    }
    if (hero) hero.href = inside.heroHref;

    // The row is replaced whole rather than patched tile by tile — a list of
    // one must not leave a shipped tile stranded beside it.
    const row = section.querySelector('.gallery-tiles-row');
    if (row && inside.tiles.length) {
        row.innerHTML = inside.tiles.filter(t => t?.img).map(t => `
            <a class="gallery-tiles-thumb" href="${escapeHtml(t.href || inside.heroHref)}">
              <img src="${escapeHtml(deliverySrc(t.img))}" alt="${escapeHtml(t.alt || '')}"${
                  sizeAttrs(t.img)} loading="lazy" decoding="async">
            </a>`).join('');
    }
}

/**
 * The artist band under Inside Vayu: one wide picture that opens the
 * artist's page.
 *
 * The section keeps its accessible name in step with the picture — the
 * markup ships with aria-label="Jenjum Gadi Artist", and a band changed to
 * another artist while still announcing itself as Jenjum Gadi to a screen
 * reader would be worse than having no label at all.
 */
function renderArtistBand(saved) {
    const section = document.querySelector('.jenjum-section');
    if (!section) return;

    const band = artistBandEffective(saved);
    const link = section.querySelector('a');
    const img = section.querySelector('img');

    if (link) link.href = band.href;
    if (img) {
        img.src = band.img;
        img.alt = band.alt;
    }
    section.setAttribute('aria-label', band.alt);
}

/* ---------- entry ---------- */

/**
 * Draw whatever the admin panel owns on this page.
 *
 * There used to be a second entry point here for the newsletter box, which
 * this module built by hand and appended to the footer. components/
 * Newsletter.svelte is that box now — same id, same markup, part of the
 * prerendered document — so the hand-built copy has gone rather than being
 * left to drift against it.
 *
 * Safe to call repeatedly: the announcement bar returns early once it
 * exists, and re-rendering the hero tears down the previous slideshow
 * before starting the next.
 */
export function renderRemoteSiteContent() {
    const content = site.content;
    renderAnnouncement(content?.announcement);
    renderHero(content?.heroSlides);
    renderTileStyle(content?.productTileBox);
    renderInsideVayu(content?.insideVayu);
    renderArtistBand(content?.artist);
}
