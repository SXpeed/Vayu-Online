/**
 * Vayu — post-build verification.
 *
 *   npm run verify                     against a local `wrangler dev`
 *   npm run verify -- --url=https://…  against a deployment
 *
 * This exists because of a specific bug that shipped. The header and footer
 * were ported to Svelte components and the old js/nav-render.js stopped being
 * called — but that module filled *eight* containers and only six were in the
 * shell. The home page's Curated Categories rail and the collection directory
 * were left as empty <div>s waiting for a function nothing called any more.
 *
 * The check that was running at the time asserted the header, the footer, the
 * menu columns and the newsletter. All four were fine, so two blank sections
 * passed as "clean". Verifying the shell is not verifying the site.
 *
 * So there are three layers here:
 *
 *   1. CONTRACTS  — what each page must actually show, by selector and count.
 *   2. Empty-container sweep — any element with an id that renders nothing,
 *      unless it is on the AT_REST allowlist. This is the generic net: it
 *      would have caught the bug above with no page-specific knowledge.
 *   3. Console errors and 4xx/5xx responses on every page.
 */

import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const CHROME_CANDIDATES = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const arg = (name, fallback) => {
    const hit = process.argv.find(a => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
};

const BASE = arg('url', 'http://127.0.0.1:8787').replace(/\/$/, '');

/**
 * Every page carries the shell, so it is asserted everywhere rather than
 * repeated in each contract below.
 */
const SHELL = {
    '#header': 1,
    'footer.site-footer-container': 1,
    '.cdrop-col': 7,              // one COLLECTION column per category
    '#vayuNewsletter': 1,
    '#mobileMenuOverlay': 1,
    '.macc-group': 7,             // the mobile accordion, one per category
};

/**
 * What each page must actually render. A number is a minimum; an exact count
 * is written as [n, n]. Keep these tied to what a visitor would notice is
 * missing, not to implementation details.
 */
const CONTRACTS = {
    '/': {
        '.curated-card': [7, 7],       // the rail that shipped empty
        '.hero-slide': 1,
        '.gallery-tiles-thumb': 1,
    },
    '/pages/collection.html': {
        '.collection-cat-block': [7, 7],   // the directory that shipped empty
        '.collection-sub-link': 20,
    },
    '/pages/collection-detail.html?cat=furniture': {
        '.product': 1,
        '.sub-pill': 2,
    },
    '/pages/product.html?cat=furniture&idx=0': {
        '#prodName': 1,
        '#prodGalleryTrack img': 1,
        '#prodSuggestGrid .product': 1,
    },
    '/pages/jenjum.html': { '.product': 1 },
    '/pages/design-for-living.html': { '#dflEdit .product': 1 },
    '/pages/journal.html': { '.journal-card': 3 },
    '/pages/journal-post.html?id=revival-of-indian-brass': { '#postRoot h1': 1 },
    '/pages/press.html': { '#prGrid a': 1, '#prFeature': 1 },
    '/pages/cart.html': { '#cartContent': 1 },
    '/pages/wishlist.html': { '#wishContent': 1 },
    '/pages/user-profile.html': { '#accountWrap': 1 },
    '/pages/about.html': { 'main': 1 },
    '/pages/artist.html': { 'main': 1 },
    '/pages/gallery.html': { 'main': 1 },
    '/pages/help.html': { 'main': 1 },
    '/pages/legal.html': { 'main': 1 },
    '/index.html': { '.curated-card': [7, 7] },
};

/**
 * Containers that are legitimately empty until something happens: search
 * results before a query, the lightbox before it opens, inline error and
 * confirmation slots, and the panels the account page keeps hidden.
 *
 * Anything with an id that is NOT in here and renders nothing is treated as a
 * bug, because on this site an empty container has always meant a render that
 * did not run.
 */
const AT_REST = new Set([
    // SvelteKit's own a11y live region: empty until a client-side navigation
    // announces the new page title.
    'svelte-announcer',
    'navSearchResults', 'galleryLightbox', 'lbCaption', 'lbImage', 'lbCount',
    'addrError', 'addrSaved', 'addrList', 'addrForm', 'detailsError', 'detailsSaved',
    'gateError', 'passwordSaved', 'prodBadge', 'orderList', 'acctAvatar',
    'panel-addresses', 'panel-orders', 'panel-details', 'crumbSub', 'crumbSep',
    'prodAccordion', 'prodGalleryDots', 'jenjumGrid', 'journalFilters',
    'acc-care', 'acc-desc', 'acc-dimensions', 'acc-materials', 'acc-shipping',
    'gateGoogle', 'gateNameField', 'gatePhoneField', 'subNav', 'subGrid',
    'catTitle', 'crumbTitle', 'edit', 'season', 'rooms', 'hands', 'visit',
    'exhibition', 'meet', 'homeHero', 'menu',
]);

const fail = [];
const note = (page, msg) => fail.push(`${page}\n      ${msg}`);

const chrome = CHROME_CANDIDATES.find(p => existsSync(p));
if (!chrome) {
    console.error('Could not find Chrome. Checked:\n  ' + CHROME_CANDIDATES.join('\n  '));
    process.exit(2);
}

const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });

console.log(`verifying ${BASE}\n`);

for (const [path, contract] of Object.entries(CONTRACTS)) {
    const page = await browser.newPage();
    const problems = [];

    page.on('pageerror', e => problems.push(`console: ${e.message}`));
    page.on('console', m => {
        if (m.type() === 'error' && !m.text().includes('favicon')) problems.push(`console: ${m.text()}`);
    });
    page.on('response', r => {
        if (r.status() >= 400 && !r.url().includes('favicon')) {
            problems.push(`HTTP ${r.status()} ${r.url().replace(BASE, '')}`);
        }
    });

    try {
        await page.goto(BASE + path, { waitUntil: 'load', timeout: 30000 });
    } catch (err) {
        note(path, `did not load: ${err.message}`);
        await page.close();
        continue;
    }
    // let the after-load work (page module, hydration) settle
    await new Promise(r => setTimeout(r, 1500));

    const counts = await page.evaluate((selectors) => {
        const out = {};
        for (const sel of selectors) out[sel] = document.querySelectorAll(sel).length;
        return out;
    }, [...Object.keys(SHELL), ...Object.keys(contract)]);

    for (const [sel, want] of Object.entries({ ...SHELL, ...contract })) {
        const got = counts[sel];
        const [min, max] = Array.isArray(want) ? want : [want, Infinity];
        if (got < min || got > max) {
            problems.push(`${sel}: expected ${Array.isArray(want) ? min : `at least ${min}`}, found ${got}`);
        }
    }

    const empties = await page.evaluate((atRest) => {
        const containers = document.querySelectorAll(
            'div[id], section[id], ul[id], ol[id], main[id], aside[id], nav[id]',
        );
        return [...containers]
            .filter(el => !atRest.includes(el.id))
            .filter(el => el.children.length === 0 && el.textContent.trim() === '')
            .filter(el => !el.hasAttribute('hidden') && getComputedStyle(el).display !== 'none')
            .map(el => `#${el.id} <${el.tagName.toLowerCase()}>`);
    }, [...AT_REST]);

    for (const e of empties) problems.push(`empty container: ${e} — nothing rendered into it`);

    if (problems.length) {
        note(path, problems.join('\n      '));
        console.log(`FAIL  ${path}`);
        for (const p of problems) console.log(`        ${p}`);
    } else {
        console.log(`ok    ${path}`);
    }

    await page.close();
}

await browser.close();

if (fail.length) {
    console.log(`\n${fail.length} page(s) failed verification`);
    process.exit(1);
}
console.log('\nall pages verified');
