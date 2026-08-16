/**
 * Vayu — the build.
 *
 * Two jobs, both of them about the shape of the network waterfall rather
 * than about bytes:
 *
 *   1. Bundle src/client into public/assets/js. One entry (app.js) plus a
 *      chunk per page and per deferred feature, so a page costs one request
 *      instead of the fifteen-module runtime graph js/include.js used to
 *      pull in one file at a time.
 *
 *   2. Rewrite the HTML in public/ so the header and footer are *in* the
 *      document. They used to be fetched from /partials by JavaScript,
 *      which put two requests and a module graph in front of the shell.
 *      They now live in src/partials — build inputs rather than site
 *      files, so they are no longer served to anyone.
 *
 * The HTML rewrite is idempotent and works in place, between marker
 * comments. That is deliberate: the site is served straight off
 * Cloudflare's edge as static assets (see wrangler.jsonc — the Worker only
 * claims /api, /admin and /uploads), so there is no server-side render step
 * to hook into, and pushing the whole 40 MB of public/assets/images through
 * a dist/ copy on every build would cost far more than it saves. The
 * partials in src/partials are still the single source of truth; running the
 * build re-syncs every page from them.
 *
 *   npm run build   bundle + rewrite
 */

import { build } from 'esbuild';
import { readFile, writeFile, readdir, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (...parts) => path.join(root, ...parts);

const OUT_DIR = p('public', 'assets', 'js');

/* ---------------------------------------------------------------- JS ---- */

/**
 * The lazily loaded bundles, addressed by URL from src/client/app.js.
 * Adding one means adding it here *and* to the matching list in app.js.
 */
const PAGE_ENTRIES = [
    'collection-detail', 'product', 'cart', 'wishlist', 'journal',
    'journal-post', 'press', 'jenjum', 'design-for-living', 'user-profile',
];

/** Deferred features and the offline catalogue fallback. */
const LAZY_ENTRIES = {
    search: p('src', 'client', 'search.js'),
    lenis: p('src', 'client', 'core', 'lenis.js'),
    analytics: p('src', 'client', 'core', 'analytics.js'),
    'static-catalogue': p('src', 'client', 'data', 'static-catalogue.js'),
};

const shared = {
    bundle: true,
    format: 'esm',
    minify: true,
    sourcemap: true,
    target: ['es2022'],
    logLevel: 'warning',
    metafile: true,
};

/**
 * Every bundle is built on its own, with code splitting OFF.
 *
 * The obvious setup — one entry, `splitting: true`, the page modules as
 * dynamic imports — was tried first and is worse for exactly the reason
 * this refactor exists. Splitting hoists whatever the entry shares with a
 * dynamically imported module into a *shared chunk that the entry then
 * statically imports*: six extra requests sitting one level below app.js,
 * on the critical path, which is the chained waterfall in a new costume.
 *
 * Self-contained bundles duplicate a few kilobytes of stateless helpers —
 * the taxonomy functions, the product tile, the cart helpers — across the
 * page bundles that use them. That is the trade: bytes on the pages that
 * need them, in exchange for a tree that is one level deep. The one piece
 * of genuinely *stateful* shared code, data/store.js, keeps its state on
 * window precisely so the duplicate copies stay in agreement (see the note
 * in that file).
 */
async function bundleJs() {
    if (existsSync(OUT_DIR)) await rm(OUT_DIR, { recursive: true });
    await mkdir(OUT_DIR, { recursive: true });

    const results = await Promise.all([
        build({ ...shared, entryPoints: [p('src', 'client', 'app.js')], outdir: OUT_DIR }),
        build({
            ...shared,
            entryPoints: PAGE_ENTRIES.map(name => p('src', 'client', 'pages', `${name}.js`)),
            outdir: path.join(OUT_DIR, 'pages'),
        }),
        build({
            ...shared,
            entryPoints: Object.entries(LAZY_ENTRIES).map(([out, path]) => ({ out, in: path })),
            outdir: path.join(OUT_DIR, 'lazy'),
        }),
    ]);

    return Object.assign({}, ...results.map(r => r.metafile.outputs));
}

/* ------------------------------------------------------------- fonts ---- */

const FONT_MARKERS = ['/* @vayu:fonts */', '/* /@vayu:fonts */'];

/**
 * Splice the generated @font-face rules into the top of styles.css.
 *
 * They live *inside* the main stylesheet rather than in a second file
 * because a separate /assets/fonts/fonts.css would be one more request
 * hanging off the document, and an `@import` from styles.css would be
 * strictly worse — the browser cannot even discover it until styles.css has
 * arrived and parsed, which is the fonts.googleapis.com chain again with a
 * different hostname.
 */
async function injectFonts(cssPath) {
    const generated = await readFile(p('public', 'assets', 'fonts', 'fonts.css'), 'utf8');
    const [open, close] = FONT_MARKERS;
    const block = `${open}\n${generated.trim()}\n${close}`;

    const css = await readFile(cssPath, 'utf8');
    const between = new RegExp(`${open.replace(/[*/]/g, '\\$&')}[\\s\\S]*?${close.replace(/[*/]/g, '\\$&')}`);

    const next = between.test(css) ? css.replace(between, block) : `${block}\n\n${css}`;
    if (next !== css) {
        await writeFile(cssPath, next, 'utf8');
        console.log('  rewrote', path.relative(root, cssPath));
    }
    return next;
}

/* -------------------------------------------------------------- HTML ---- */

const MARKERS = {
    header: ['<!-- @vayu:header -->', '<!-- /@vayu:header -->'],
    footer: ['<!-- @vayu:footer -->', '<!-- /@vayu:footer -->'],
};

/** The slot each page used to ship for JavaScript to fill in. */
const LEGACY_SLOTS = {
    header: /[ \t]*<div id="site-header"><\/div>\n/,
    footer: /[ \t]*<div id="site-footer"><\/div>\n/,
};

/**
 * Replace the region between a pair of markers, or convert the legacy
 * JS-filled slot into such a region the first time round.
 */
function inlinePartial(html, kind, markup) {
    const [open, close] = MARKERS[kind];
    const block = `${open}\n${markup.trim()}\n${close}\n`;

    const between = new RegExp(`[ \\t]*${open}[\\s\\S]*?${close}\\n`);
    if (between.test(html)) return html.replace(between, block);

    const slot = LEGACY_SLOTS[kind];
    if (slot.test(html)) return html.replace(slot, block);

    return html;
}

/**
 * The fonts used to arrive through two hops off two other origins:
 * fonts.googleapis.com for the CSS, then fonts.gstatic.com for each face.
 * They are self-hosted now (public/assets/fonts, @font-face at the top of
 * css/styles.css), so all that is left in the head is a preload of the two
 * faces the first screen actually uses.
 */
const FONT_PRELOADS = [
    '  <link rel="preload" href="/assets/fonts/jost-400.woff2" as="font" type="font/woff2" crossorigin>',
    '  <link rel="preload" href="/assets/fonts/cormorant-garamond-400.woff2" as="font" type="font/woff2" crossorigin>',
].join('\n');

function rewriteFonts(html) {
    // the two preconnects and the stylesheet link, in whatever order and
    // line-wrapping each page happens to use
    const googleTags = /[ \t]*<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\n[ \t]*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\n[ \t]*<link[^>]*fonts\.googleapis\.com\/css2[^>]*>\n/;
    if (googleTags.test(html)) return html.replace(googleTags, FONT_PRELOADS + '\n');
    return html;
}

/** The single entry script, in place of the old include.js loader. */
function rewriteEntryScript(html) {
    return html.replace(
        /<script type="module" src="\/js\/include\.js"><\/script>\n?/g,
        '',
    ).replace(
        /[ \t]*<!-- @vayu:app -->\n/,
        '',
    );
}

/**
 * `<body data-page="...">` is how app.js decides which page chunk to load.
 * Derived from the filename, so adding a page needs no registry.
 */
function pageName(file) {
    const base = path.basename(file, '.html');
    return base === 'index' ? 'home' : base;
}

/**
 * Pages whose content is the catalogue start the request from the head, so
 * it runs in parallel with app.js instead of behind it. data/remote.js
 * picks the promise up off window.
 */
const CATALOGUE_PAGES = new Set([
    'collection-detail', 'product', 'jenjum', 'design-for-living',
    'journal', 'journal-post',
]);

const preloadSnippet = (endpoint, global) =>
    `  <script>window.${global}=fetch('${endpoint}').then(r=>r.ok?r.json():null).catch(()=>null)</script>`;

async function rewriteHtml(files, header, footer, cssVersion) {
    for (const file of files) {
        const original = await readFile(file, 'utf8');
        let html = original;

        html = inlinePartial(html, 'header', header);
        html = inlinePartial(html, 'footer', footer);
        html = rewriteFonts(html);
        html = rewriteEntryScript(html);

        // The ?v= on the stylesheet was bumped by hand, page by page, and
        // had already drifted. It is the stylesheet's own content hash now.
        html = html.replace(
            /href="\/css\/styles\.css(\?v=[^"]*)?"/g,
            `href="/css/styles.css?v=${cssVersion}"`,
        );

        const page = pageName(file);

        // <body> gets the page name, so app.js can pick its chunk.
        html = html.replace(/<body(\s[^>]*)?>/, (match, attrs = '') => {
            const cleaned = (attrs || '').replace(/\s*data-page="[^"]*"/, '');
            return `<body${cleaned} data-page="${page}">`;
        });

        // the in-head kickoff for the API this page depends on
        const snippet = CATALOGUE_PAGES.has(page)
            ? preloadSnippet('/api/catalogue', '__vayuCatalogue')
            : preloadSnippet('/api/nav', '__vayuNav');
        const existing = /[ \t]*<script>window\.__vayu(Catalogue|Nav)=[\s\S]*?<\/script>\n/;
        html = existing.test(html)
            ? html.replace(existing, snippet + '\n')
            : html.replace(/(\n[ \t]*<link rel="stylesheet" href="\/css\/styles\.css[^>]*>\n)/, `$1${snippet}\n`);

        // the entry, last thing before </body>
        const entry = '  <script type="module" src="/assets/js/app.js"></script>';
        if (!html.includes('src="/assets/js/app.js"')) {
            html = html.replace(/\n([ \t]*)<\/body>/, `\n${entry}\n$1</body>`);
        }

        if (html !== original) {
            await writeFile(file, html, 'utf8');
            console.log('  rewrote', path.relative(root, file));
        }
    }
}

async function htmlFiles() {
    const pages = await readdir(p('public', 'pages'));
    return [
        p('public', 'index.html'),
        ...pages.filter(f => f.endsWith('.html')).map(f => p('public', 'pages', f)),
    ];
}

async function rewriteAll() {
    const [header, footer, files] = await Promise.all([
        readFile(p('src', 'partials', 'header.html'), 'utf8'),
        readFile(p('src', 'partials', 'footer.html'), 'utf8'),
        htmlFiles(),
    ]);
    const css = await injectFonts(p('public', 'css', 'styles.css'));
    const cssVersion = createHash('sha256').update(css).digest('hex').slice(0, 8);
    await rewriteHtml(files, header, footer, cssVersion);
}

/* -------------------------------------------------------------- main ---- */

{
    const outputs = Object.entries(await bundleJs())
        .filter(([f]) => f.endsWith('.js'))
        .map(([f, o]) => [path.relative('public/assets/js', f).replaceAll('\\', '/'), o.bytes])
        .sort((a, b) => b[1] - a[1]);

    console.log('\n[vayu] bundle:');
    for (const [name, bytes] of outputs) {
        console.log(`  ${(bytes / 1024).toFixed(1).padStart(7)} KB  ${name}`);
    }
}
