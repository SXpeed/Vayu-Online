/**
 * Vayu — the parts of the page the admin panel owns.
 *
 * All of this is additive: when the API is down (`remote` is null) the
 * page simply looks the way it always did.
 */

import { remote } from '../store-data.js';
import { escapeHtml } from './html.js';

/* ---------- announcement bar ---------- */

const ANNOUNCEMENT_CSS = 'background:#141210;color:#f4f1ea;text-align:center;font-family:Jost,sans-serif;font-size:11.5px;letter-spacing:0.18em;text-transform:uppercase;padding:9px 16px;';

function renderAnnouncement(text) {
    if (!text) return;
    const bar = document.createElement('div');
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
    window.vayuInitHero?.();
}

/* ---------- newsletter ---------- */

/**
 * The signup sits on a white footer, where a #d9d3c7 hairline around a
 * white field is all but invisible and #8d887e copy is barely there. It
 * gets its own tinted panel instead, so the block reads as something to
 * act on: a warm ground, a field that is visibly a field, and text dark
 * enough to pass against it.
 *
 * The styles are a real stylesheet rather than inline attributes because
 * :focus and :hover — the states that tell you the field is live — cannot
 * be written inline.
 */
const NEWSLETTER_CSS = `
    /* The !important on every border below is required, not stylistic: the
       flat-design layer in styles.css declares border-color transparent
       !important on every element, so a plain border here computes to
       transparent and never renders. Same workaround as .product. */
    #vayuNewsletter {
        max-width: 560px;
        margin: 34px auto 14px;
        padding: 26px 24px 24px;
        text-align: center;
        font-family: Jost, sans-serif;
        background: #FAF8F5;
        border: 1px solid #EDE6D9 !important;
        border-radius: 4px;
    }
    #vayuNewsletter .nl-title {
        font-family: 'Cormorant Garamond', serif;
        font-size: 24px;
        color: #141210;
        margin-bottom: 5px;
    }
    #vayuNewsletter .nl-sub {
        font-size: 13px;
        color: #6E6A63;
        margin-bottom: 16px;
    }
    #vayuNewsletter form {
        display: flex;
        gap: 8px;
        justify-content: center;
    }
    #vayuNewsletter input {
        flex: 1;
        max-width: 280px;
        padding: 12px 14px;
        border: 1px solid #C9C0AE !important;
        border-radius: 2px;
        font: inherit;
        font-size: 13px;
        color: #141210;
        background: #fff;
        transition: border-color .2s ease, box-shadow .2s ease;
    }
    #vayuNewsletter input::placeholder { color: #8d887e; }
    #vayuNewsletter input:focus {
        outline: none;
        border-color: #9E3A26;
        box-shadow: 0 0 0 3px rgba(158, 58, 38, 0.12);
    }
    #vayuNewsletter button {
        padding: 12px 24px;
        background: #141210;
        color: #fff;
        border: 0;
        border-radius: 2px;
        font: inherit;
        font-size: 11px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        cursor: pointer;
        transition: background .2s ease;
    }
    #vayuNewsletter button:hover { background: #9E3A26; }
    #vayuNewsletter [data-note] {
        font-size: 12.5px;
        margin-top: 11px;
        min-height: 16px;
        color: #6E6A63;
    }
    #vayuNewsletter [data-note].is-error { color: #B03030; }
    #vayuNewsletter [data-note].is-ok { color: #1E6B1E; }
    @media (max-width: 480px) {
        #vayuNewsletter form { flex-direction: column; align-items: center; }
        #vayuNewsletter input { max-width: none; width: 100%; }
        #vayuNewsletter button { width: 100%; }
    }`;

const NEWSLETTER_HTML = `
    <div class="nl-title">Letters from Vayu</div>
    <div class="nl-sub">New pieces, maker stories and quiet offers — once a month.</div>
    <form novalidate>
        <input type="email" required placeholder="Your email" autocomplete="email" aria-label="Your email">
        <button type="submit">Subscribe</button>
    </form>
    <div data-note role="status" aria-live="polite"></div>`;

const EMAIL_RE = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/;

/** Signup box, appended to the footer on every page. */
function renderNewsletter() {
    const footer = document.querySelector('footer');
    if (!footer || document.getElementById('vayuNewsletter')) return;

    const style = document.createElement('style');
    style.textContent = NEWSLETTER_CSS;
    document.head.appendChild(style);

    const box = document.createElement('div');
    box.id = 'vayuNewsletter';
    box.innerHTML = NEWSLETTER_HTML;
    footer.prepend(box);

    const form = box.querySelector('form');
    const note = box.querySelector('[data-note]');

    /** Colour the reply as well as write it — grey text alone reads as noise. */
    const say = (message, kind) => {
        note.textContent = message;
        note.classList.toggle('is-error', kind === 'error');
        note.classList.toggle('is-ok', kind === 'ok');
    };

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = form.querySelector('input').value.trim();
        if (!EMAIL_RE.test(email)) {
            say('Please enter a valid email.', 'error');
            return;
        }
        try {
            const res = await fetch('/api/newsletter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            if (res.ok) {
                say('Thank you — you are on the list.', 'ok');
                form.reset();
            } else {
                say('Could not subscribe right now.', 'error');
            }
        } catch {
            say('Could not subscribe right now.', 'error');
        }
    });
}

/* ---------- entry ---------- */

export function renderSiteContent() {
    const content = remote?.content;
    renderAnnouncement(content?.announcement);
    renderHero(content?.heroSlides);
    renderNewsletter();
}
