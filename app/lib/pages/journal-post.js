/**
 * Vayu — /pages/journal-post.html.
 *
 * Lifted verbatim out of the page's inline <script type="module">. It used
 * to import straight from /js/, so every one of those imports was another
 * level of request chaining hanging off the HTML. It is now a bundled chunk
 * that app.js imports only when <body data-page="journal-post">.
 */

import { STORIES, getStory, postUrl } from '../data/journal-data.js';
import { hydrateJournal } from '../data/journal-data.js';

await hydrateJournal();

const esc = (s) => String(s).replace(/[&<>"]/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));

const root = document.getElementById('postRoot');
const id = new URLSearchParams(location.search).get('id') || '';
const story = getStory(id);

if (!story) {
  document.title = 'Story not found — Vayu';
  root.innerHTML = `
    <section class="post-missing">
      <h1 class="post-title">We couldn't find that story</h1>
      <p style="font-size:14px;color:var(--body);margin-bottom:22px;">
        The link may be out of date.
      </p>
      <a class="post-back" href="/pages/journal.html">← Back to the Journal</a>
    </section>`;
} else {
  document.title = `${story.title} — Vayu Journal`;
  document.querySelector('meta[name="description"]')
    ?.setAttribute('content', story.excerpt);

  const crumb = document.getElementById('crumbTitle');
  const crumbSep = document.getElementById('crumbSep');
  if (crumb) crumb.textContent = story.title;
  if (crumbSep) crumbSep.style.display = 'inline';

  // Where a story has no body paragraphs, show the excerpt as the lead
  // plus an honest note — rather than fabricating editorial copy about
  // the artisans and places these stories describe.
  const hasBody = Array.isArray(story.body) && story.body.length > 0;
  const bodyHTML = hasBody
    ? `<div class="post-body">${story.body.map(p => `<p>${esc(p)}</p>`).join('')}</div>`
    : `<div class="post-pending">
         <h2>Full story in preparation</h2>
         <p>This piece is being written up for the Journal. In the meantime,
            the summary above covers what it will explore.</p>
       </div>`;

  // "next" = the following story in the list, wrapping at the end
  const i = STORIES.findIndex(s => s.id === story.id);
  const next = STORIES[(i + 1) % STORIES.length];

  const more = STORIES.filter(s => s.id !== story.id).slice(0, 3);

  root.innerHTML = `
    <div class="post-hero">
      <img src="${esc(story.image)}" alt="${esc(story.alt)}" fetchpriority="high">
    </div>

    <div class="post-body-wrap">
      <span class="post-cat">${esc(story.categoryLabel)}</span>
      <h1 class="post-title">${esc(story.title)}</h1>
      <div class="post-meta">
        <span>${esc(story.date)}</span>
        ${story.readingTime ? `<span class="post-meta-dot">·</span><span>${esc(story.readingTime)}</span>` : ''}
      </div>

      <p class="post-lead">${esc(story.excerpt)}</p>
      ${bodyHTML}

      <div class="post-foot">
        <a class="post-back" href="/pages/journal.html">← All stories</a>
        ${next && next.id !== story.id
      ? `<a class="post-next" href="${postUrl(next)}">Next: ${esc(next.title)} →</a>`
      : ''}
      </div>
    </div>

    ${more.length ? `
    <section class="post-more" aria-labelledby="more-title">
      <div class="sec-head">
        <h2 class="sec-title" id="more-title">MORE FROM THE JOURNAL</h2>
        <a class="link-cta" href="/pages/journal.html">VIEW ALL &nbsp;→</a>
      </div>
      <div class="post-more-grid">
        ${more.map(s => `
          <a class="post-more-card" href="${postUrl(s)}">
            <span class="post-more-media">
              <img src="${esc(s.image)}" alt="${esc(s.alt)}" loading="lazy">
            </span>
            <span class="post-more-cat">${esc(s.categoryLabel)}</span>
            <span class="post-more-title">${esc(s.title)}</span>
          </a>`).join('')}
      </div>
    </section>` : ''}
  `;
}
