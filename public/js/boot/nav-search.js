/**
 * Vayu — the header search bar.
 *
 * Matches the in-memory catalogue on name, category and subcategory, and
 * renders up to eight hits under the field. Keyboard: ↓/↑ move, Enter
 * opens, Escape closes.
 */

import { allProducts } from '../catalogue.js';
import { categoryTitle, slugToLabel } from '../taxonomy.js';
import { escapeHtml } from './html.js';
import { sessionId, track } from './analytics.js';

const MAX_HITS = 8;

/** Pause before a typed query is reported, so one word is not eight events. */
const SEARCH_PING_MS = 900;

const productHref = (p) =>
    `/pages/product.html?${p.id ? `id=${p.id}&` : ''}cat=${p.cat}&idx=${p.idx}`;

/** Labels come from js/taxonomy.js so every category reads the same everywhere. */
const productLabel = (p) => `${categoryTitle(p.cat)} · ${slugToLabel(p.sub)}`;

function search(raw) {
    const q = raw.trim().toLowerCase();
    if (!q) return [];
    // match on product name, category and subcategory
    return allProducts
        .filter(p => `${p.name} ${productLabel(p)}`.toLowerCase().includes(q))
        .slice(0, MAX_HITS);
}

const hitHTML = (p, isActive) => `
    <a class="nav-search-hit${isActive ? ' is-active' : ''}" href="${escapeHtml(productHref(p))}">
      <img class="nav-search-thumb" src="${escapeHtml(p.img)}" alt="" loading="lazy">
      <span class="nav-search-text">
        <span class="nav-search-name">${escapeHtml(p.name)}</span>
        <span class="nav-search-cat">${escapeHtml(productLabel(p))}</span>
      </span>
      <span class="nav-search-price">${escapeHtml(p.price)}</span>
    </a>`;

export function initNavSearch() {
    const btn = document.getElementById('navSearchBtn');
    const field = document.getElementById('navSearch');
    const input = document.getElementById('navSearchInput');
    const clear = document.getElementById('navSearchClear');
    const panel = document.getElementById('navSearchResults');
    if (!btn || !input || !panel) return;

    panel.dataset.lenisPrevent = '';

    let hits = [];
    let active = -1;

    const render = () => {
        const typed = input.value.trim();
        if (!typed) { panel.innerHTML = ''; return; }
        panel.innerHTML = hits.length
            ? hits.map((p, i) => hitHTML(p, i === active)).join('')
            : `<p class="nav-search-note">No matches for “${escapeHtml(typed)}”</p>`;
    };

    const open = () => {
        document.body.classList.add('search-open');
        btn.classList.add('is-active');
        btn.setAttribute('aria-expanded', 'true');
        // the field is visibility:hidden until the class lands, and a hidden
        // element cannot take focus — read a layout property to flush the
        // style change through before focusing
        field?.getBoundingClientRect();
        input.focus();
    };

    const close = () => {
        document.body.classList.remove('search-open');
        btn.classList.remove('is-active');
        btn.setAttribute('aria-expanded', 'false');
        input.value = '';
        panel.innerHTML = '';
        hits = [];
        active = -1;
    };

    btn.addEventListener('click', () => {
        if (document.body.classList.contains('search-open')) close();
        else open();
    });

    clear?.addEventListener('click', close);

    // Search analytics: report what was typed and whether it found anything,
    // once the user pauses — not on every keystroke.
    let searchPing;
    const reportSearch = () => {
        const q = input.value.trim();
        if (q) track({ type: 'search', q, results: hits.length, sid: sessionId() });
    };

    input.addEventListener('input', () => {
        hits = search(input.value);
        active = -1;
        render();
        clearTimeout(searchPing);
        searchPing = setTimeout(reportSearch, SEARCH_PING_MS);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { close(); return; }
        if (!hits.length) return;

        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const step = e.key === 'ArrowDown' ? 1 : -1;
            active = (active + step + hits.length) % hits.length;
            render();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            location.href = productHref(hits[Math.max(active, 0)]);
        }
    });

    // clicking anywhere outside the bar closes it
    document.addEventListener('click', (e) => {
        if (!document.body.classList.contains('search-open')) return;
        if (btn.contains(e.target) || field?.contains(e.target) || panel.contains(e.target)) return;
        close();
    });
}
