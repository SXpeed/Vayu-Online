/**
 * Vayu — /pages/press.html.
 *
 * Lifted verbatim out of the page's inline <script type="module">. It used
 * to import straight from /js/, so every one of those imports was another
 * level of request chaining hanging off the HTML. It is now a bundled chunk
 * that the page imports on mount.
 */

/* ============================================================
   Press page
   ------------------------------------------------------------
   Coverage comes from the admin panel's Press screen, over
   /api/press. The static list in data/press-data.js is the
   fallback: it is what the prerendered document was built
   against, and what the page keeps showing if the table is
   empty or the request fails, so the coverage never blanks out.

   Entries carrying verified: false are rendered deliberately
   bare — source, Vayu's own one-line description and the link,
   and nothing else. The page will not print a headline, byline,
   date or quotation that was not read at the source. The admin
   handler enforces the same rule on the way in.
   ============================================================ */
import { site, hydratePress } from '#lib/stores/site.svelte.js';
import { PRESS as STATIC_PRESS } from '../data/press-data.js';

const EXTERNAL_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" /></svg>';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));

/* Shared by both renderers: a quotation is only ever built from the
   article's own `quote`, never from `snippet`, which is Vayu's copy. */
const quoteHTML = (p) => p.quote
  ? `<blockquote class="pr-quote">“${esc(p.quote)}”${p.quoteAttribution ? `<cite>${esc(p.quoteAttribution)}</cite>` : ''}</blockquote>`
  : '';

const bylineHTML = (p) => {
  const parts = [p.byline && `By ${p.byline}`, p.date].filter(Boolean);
  return parts.length ? `<div class="pr-byline">${esc(parts.join(' · '))}</div>` : '';
};

/**
 * The piece with the flag, or the first one listed.
 *
 * The fallback matters: the page gives the featured slot its own large
 * block, so a list where nobody has been flagged in the admin panel would
 * otherwise render a visible empty container. Rows arrive newest first, so
 * "the first one" is the most recent piece.
 */
const featuredOf = (list) => list.find(p => p.featured) || list[0];

function renderFeature(p) {
  const slot = document.getElementById('prFeature');
  if (!slot || !p) return;
  slot.innerHTML = `
    <a class="pr-feature" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">
      <div class="pr-feature-media">
        <img src="${esc(p.image)}" alt="${esc(p.alt)}">
      </div>
      <div class="pr-feature-body">
        <span class="pr-badge">Most Recent</span>
        <span class="pr-feature-source">${esc(p.source)}</span>
        <h2 class="pr-feature-headline">${esc(p.headline || p.snippet)}</h2>
        ${bylineHTML(p)}
        ${quoteHTML(p)}
        <span class="pr-read">Read at ${esc(p.source)} ${EXTERNAL_SVG}</span>
      </div>
    </a>`;
}

function renderGrid(list, featured) {
  const grid = document.getElementById('prGrid');
  if (!grid) return;

  const rest = list.filter(p => p !== featured);
  grid.innerHTML = rest.map(p => `
    <a class="pr-card${p.verified ? '' : ' is-unverified'}" href="${esc(p.url)}"
       target="_blank" rel="noopener noreferrer">
      <div class="pr-card-media">
        <img src="${esc(p.image)}" alt="${esc(p.alt)}" loading="lazy">
      </div>
      <div class="pr-card-body">
        <span class="pr-source">${esc(p.source)}</span>
        <h3 class="pr-headline">${esc(p.headline || p.snippet)}</h3>
        ${bylineHTML(p)}
        ${quoteHTML(p)}
        ${p.verified ? '' : `<p class="pr-note">${esc(p.snippet)}</p>`}
        <span class="pr-read">Read at ${esc(p.source)} ${EXTERNAL_SVG}</span>
      </div>
    </a>`).join('');

  const count = document.getElementById('prCount');
  if (count) count.textContent = `${rest.length} more`;
}

/* The header's date range is derived rather than typed, so it cannot
   fall out of step with the list below it. */
function renderRange(list) {
  const el = document.getElementById('prRange');
  if (!el) return;
  const years = list
    .map(p => Number((p.date || '').match(/\b(19|20)\d{2}\b/)?.[0]))
    .filter(Boolean);
  if (!years.length) return;
  const lo = Math.min(...years);
  const hi = Math.max(...years);
  el.textContent = lo === hi ? `Selected coverage · ${lo}` : `Selected coverage · ${lo}—${hi}`;
}

/**
 * Draw once, from whichever list is authoritative.
 *
 * The page is prerendered with an empty #prFeature and #prGrid, so this runs
 * on every visit; awaiting the fetch first means the coverage is painted
 * once, rather than painted from the static list and visibly replaced a
 * moment later by the admin panel's.
 */
export default async function initPress() {
  await hydratePress();
  const list = site.press ?? STATIC_PRESS;
  const featured = featuredOf(list);

  renderFeature(featured);
  renderGrid(list, featured);
  renderRange(list);
}
