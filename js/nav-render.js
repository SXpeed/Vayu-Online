/**
 * Vayu — renders every category list from js/taxonomy.js.
 *
 * Called by include.js once the header and footer partials are in the
 * DOM, and before script.js loads (the mobile accordion binds to the
 * .macc-group elements this file creates).
 *
 * The partials ship the shells — the panel, the column wrapper, the
 * accordion container — and this fills them, so the category list exists
 * in exactly one place. Each target is optional: a page without the
 * mobile sheet simply skips it.
 */

import { categories, subsOf, catHref } from './taxonomy.js';

const CHEVRON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6" /></svg>';

const entries = () => Object.entries(categories);

/** MENU panel: the flat list of main collections. */
function renderMenuPanel() {
    const list = document.getElementById('mdropCats');
    if (!list) return;
    list.innerHTML = entries()
        .map(([slug, cat]) => `<li><a href="${catHref(slug)}">${cat.title}</a></li>`)
        .join('');
}

/** COLLECTION panel: one column per category, sub-categories beneath. */
function renderCollectionPanel() {
    const cols = document.getElementById('cdropCols');
    if (!cols) return;
    cols.innerHTML = entries().map(([slug, cat]) => {
        const subs = subsOf(slug);
        const list = subs.length
            ? `<ul>${subs.map(s => `<li><a href="${catHref(slug, s.slug)}">${s.label}</a></li>`).join('')}</ul>`
            : '';
        return `<div class="cdrop-col">
            <a class="cdrop-head" href="${catHref(slug)}">${cat.title}</a>
            ${list}
        </div>`;
    }).join('');
}

/** Desktop footer, COLLECTION column. */
function renderFooterColumn() {
    const list = document.getElementById('footCollectionList');
    if (!list) return;
    list.innerHTML = entries()
        .map(([slug, cat]) => `<li><a href="${catHref(slug)}">${cat.title}</a></li>`)
        .join('');
}

/** Mobile footer card, COLLECTION column (chevron per row). */
function renderMobileFooterColumn() {
    const list = document.getElementById('mFootCollectionList');
    if (!list) return;
    list.innerHTML = entries()
        .map(([slug, cat]) =>
            `<li><a href="${catHref(slug)}"><span>${cat.title}</span> ${CHEVRON}</a></li>`)
        .join('');
}

/**
 * Mobile slide-up sheet: one <details> accordion per category. This is
 * the list that had drifted furthest — Accents and Souvenir were in every
 * desktop menu but had never been added here, so on a phone neither
 * category could be reached from the menu at all.
 */
function renderMobileSheet() {
    const acc = document.getElementById('maccGroups');
    if (!acc) return;
    acc.innerHTML = entries().map(([slug, cat]) => {
        const subs = subsOf(slug)
            .map(s => `<a href="${catHref(slug, s.slug)}">${s.label}</a>`)
            .join('');
        return `<details class="macc-group">
            <summary>${cat.title}</summary>
            <div class="macc-links">
                ${subs}
                <a class="macc-all" href="${catHref(slug)}">View All →</a>
            </div>
        </details>`;
    }).join('');
}

/**
 * Collection directory page: a banner per category with a carousel of
 * sub-category thumbs. Only renders where the container exists.
 */
function renderCollectionDirectory() {
    const root = document.getElementById('collectionDirectory');
    if (!root) return;
    root.innerHTML = entries().map(([slug, cat]) => {
        const subs = subsOf(slug);
        const carousel = subs.length
            ? `<div class="collection-sub-carousel">${subs.map(s => `
                <a class="collection-sub-link" href="${catHref(slug, s.slug)}">
                    <span class="collection-sub-thumb"><img src="${s.thumb}" alt="" loading="lazy"></span>
                    <span class="collection-sub-name">${s.label}</span>
                </a>`).join('')}</div>`
            : '';
        return `<div class="collection-cat-block">
            <a class="collection-cat-banner" href="${catHref(slug)}">
                <img src="${cat.banner}" alt="${cat.title}">
                <div class="collection-cat-overlay">
                    <h2>${cat.title}</h2>
                </div>
            </a>
            ${carousel}
        </div>`;
    }).join('');
}

export function renderTaxonomyNav() {
    renderMenuPanel();
    renderCollectionPanel();
    renderFooterColumn();
    renderMobileFooterColumn();
    renderMobileSheet();
    renderCollectionDirectory();
}
