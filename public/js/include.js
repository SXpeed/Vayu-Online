/**
 * Vayu — the boot sequence every page runs.
 *
 * Loaded once per page as `<script type="module" src="/js/include.js">`.
 * It injects the shared header/footer from /partials, then starts each
 * site-wide behaviour in the order they depend on one another. Every step
 * lives in js/boot/; this file is only the order.
 *
 *   globals.js       the window.vayu* bridge to the classic script.js
 *   speculation.js   prerender/prefetch of the next page
 *   partials.js      header + footer injection
 *   scripts.js       loading classic (non-module) scripts
 *   lenis.js         smooth scroll
 *   nav-search.js    the header search bar
 *   navigation.js    current-page highlight + soft page switch
 *   analytics.js     the /api/track beacon
 *   site-content.js  announcement bar, home hero, newsletter
 *
 * Requires the site to be served over HTTP (e.g. Live Server) — fetch()
 * cannot read local files when a page is opened directly via file://.
 */

import { renderTaxonomyNav } from './nav-render.js';
import { publishGlobals, ensureThemeColor } from './boot/globals.js';
import { enableSpeculation } from './boot/speculation.js';
import { injectPartials } from './boot/partials.js';
import { loadSiteScript } from './boot/scripts.js';
import { startLenis, markNativeScrollAreas } from './boot/lenis.js';
import { initNavSearch } from './boot/nav-search.js';
import { clearPageTransition, initNavigation } from './boot/navigation.js';
import { trackPageView } from './boot/analytics.js';
import { renderSiteContent } from './boot/site-content.js';

// Before script.js is appended below, and before anything can paint.
publishGlobals();
ensureThemeColor();
enableSpeculation();

// ---- the shared shell ----
await injectPartials();

// Fill every category list from js/taxonomy.js — both header panels, the
// mobile sheet, both footer columns and the collection directory. Must run
// before loadSiteScript() below, because script.js binds the mobile
// accordion to the .macc-group elements this creates.
renderTaxonomyNav();

clearPageTransition();

// Immediately after the header/footer land and *before* the Lenis fetch:
// script.js measures and publishes --hdr-h, and awaiting a download first
// left every page visibly jumping once it arrived.
loadSiteScript();

// ---- behaviours on top of the shell ----
await startLenis();
markNativeScrollAreas();

initNavSearch();
initNavigation();

trackPageView();
renderSiteContent();
