/**
 * Vayu — /pages/journal.html.
 *
 * Lifted verbatim out of the page's inline <script type="module">. It used
 * to import straight from /js/, so every one of those imports was another
 * level of request chaining hanging off the HTML. It is now a bundled chunk
 * that app.js imports only when <body data-page="journal">.
 */

/* ============================================================
   Journal listing
   ------------------------------------------------------------
   Story and press content lives in /js/journal-data.js, shared
   with the article page so a story is described once.

   Every card here now points at a real article URL. They used
   to be rendered as href="javascript:void(0)" with no click
   handler anywhere, while carrying three hover affordances
   (image zoom, title colour, arrow slide) — so the whole
   listing invited a click and did nothing.
   ============================================================ */
import { STORIES, PRESS, getFeatured, postUrl } from '../data/journal-data.js';
import { hydrateJournal } from '../data/journal-data.js';

// Stories are the page. Wait for the admin panel's set before the first
// render rather than painting the built-in list and replacing it.
await hydrateJournal();

const ARROW_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>';
const EXTERNAL_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" /></svg>';

const esc = (s) => String(s).replace(/[&<>"]/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));

/* ---- featured story ---- */
function renderFeatured() {
  const slot = document.getElementById('journalFeatured');
  const s = getFeatured();
  if (!slot || !s) return;
  slot.innerHTML = `
    <a class="journal-featured" href="${postUrl(s)}" data-category="${esc(s.category)}">
      <div class="journal-featured-img">
        <img src="${esc(s.image)}" alt="${esc(s.alt)}">
        <span class="journal-featured-badge">FEATURED</span>
      </div>
      <div class="journal-featured-content">
        <span class="journal-featured-cat">${esc(s.categoryLabel)}</span>
        <h2 class="journal-featured-title">${esc(s.title)}</h2>
        <span class="journal-featured-date">${esc(s.date)}</span>
        <p class="journal-featured-excerpt">${esc(s.excerpt)}</p>
        <span class="journal-read-link">
          READ FULL STORY
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </span>
      </div>
    </a>`;
}

/* ---- article cards (the featured one is not repeated here) ---- */
function renderStories(filter) {
  const grid = document.getElementById('journalGrid');
  if (!grid) return;

  const pool = STORIES.filter(s => !s.featured);
  const filtered = filter === 'all' ? pool : pool.filter(s => s.category === filter);

  if (!filtered.length) {
    grid.innerHTML = '<p class="journal-empty">No stories in this category yet.</p>';
    return;
  }

  grid.innerHTML = filtered.map(s => `
    <a class="journal-card" href="${postUrl(s)}" data-category="${esc(s.category)}">
      <div class="journal-card-img">
        <img src="${esc(s.image)}" alt="${esc(s.alt)}" loading="lazy">
      </div>
      <div class="journal-card-content">
        <span class="journal-card-cat">${esc(s.categoryLabel)}</span>
        <h3 class="journal-card-title">${esc(s.title)}</h3>
        <p class="journal-card-excerpt">${esc(s.excerpt)}</p>
        <div class="journal-card-meta">
          <span class="journal-card-date">${esc(s.date)}</span>
          <span class="journal-card-arrow">${ARROW_SVG}</span>
        </div>
      </div>
    </a>`).join('');
}

/* ---- press cards ---- */
function renderPress() {
  const grid = document.getElementById('pressGrid');
  if (!grid) return;
  grid.innerHTML = PRESS.map(p => `
    <a class="press-card" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" data-category="press">
      <img src="${esc(p.image)}" alt="${esc(p.alt)}" loading="lazy">
      <div class="press-card-overlay">
        <span class="press-source">${esc(p.source)}</span>
        <span class="press-snippet">${esc(p.snippet)}</span>
      </div>
      <span class="press-external">${EXTERNAL_SVG}</span>
    </a>`).join('');
}

/* ---- filter pills ---- */
function initFilters() {
  const pills = document.querySelectorAll('.journal-pill');
  const gridSection = document.querySelector('.journal-grid')?.closest('section');
  const pressSection = document.querySelector('.press-section');
  const dividers = document.querySelectorAll('.journal-divider');

  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      pills.forEach(p => {
        p.classList.remove('active');
        p.setAttribute('aria-pressed', 'false');
      });
      pill.classList.add('active');
      pill.setAttribute('aria-pressed', 'true');

      const filter = pill.dataset.filter;
      // re-read the featured card each time: it is re-rendered, so a
      // reference captured once would go stale
      const featured = document.querySelector('.journal-featured');

      if (filter === 'all') {
        if (featured) featured.style.display = '';
        renderStories('all');
        if (pressSection) pressSection.style.display = '';
        if (gridSection) gridSection.style.display = '';
        dividers.forEach(d => d.style.display = '');
      } else if (filter === 'press') {
        if (featured) featured.style.display = 'none';
        if (gridSection) gridSection.style.display = 'none';
        if (pressSection) pressSection.style.display = '';
        dividers.forEach((d, i) => d.style.display = i === 1 ? '' : 'none');
      } else {
        if (pressSection) pressSection.style.display = 'none';
        dividers.forEach((d, i) => d.style.display = i === 0 ? '' : 'none');
        if (featured) {
          featured.style.display = featured.dataset.category === filter ? '' : 'none';
        }
        if (gridSection) gridSection.style.display = '';
        renderStories(filter);
      }
    });
  });
}

renderFeatured();
renderStories('all');
renderPress();
initFilters();
