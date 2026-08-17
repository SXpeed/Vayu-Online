/**
 * Vayu — the parts of the page the admin panel owns.
 *
 * All of this is additive: when the API is down (`remote` is null) the
 * page simply looks the way it always did.
 */

import { site } from '#lib/stores/site.svelte.js';
import { escapeHtml } from './html.js';
import { initHero } from './hero.js';

/* ---------- announcement bar ---------- */

const ANNOUNCEMENT_CSS = 'background:#141210;color:#f4f1ea;text-align:center;font-family:Jost,sans-serif;font-size:11.5px;letter-spacing:0.18em;text-transform:uppercase;padding:9px 16px;';

function renderAnnouncement(text) {
    if (!text || document.getElementById('vayuAnnouncement')) return;
    const bar = document.createElement('div');
    bar.id = 'vayuAnnouncement';
    bar.style.cssText = ANNOUNCEMENT_CSS;
    bar.textContent = text;
    document.body.prepend(bar);
}

/* ---------- home hero carousel ---------- */

/**
 * Editable in the admin panel (Site content → Home hero carousel). The
 * markup mirrors what index.html ships with, so the stylesheet and the
 * slideshow script need no special case: a slide with a heading gets the
 * darkened overlay and a button, a slide without one is a poster whose
 * whole image is the link.
 */
function slideHTML(s, i) {
    const active = i === 0 ? ' is-active' : '';
    const img = `<img src="${escapeHtml(s.img)}" alt="${escapeHtml(s.alt)}"${i === 0 ? ' fetchpriority="high"' : ' loading="lazy"'}>`;

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
}
