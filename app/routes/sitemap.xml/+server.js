/**
 * Vayu — sitemap.xml.
 *
 * Generated per request from D1 rather than written out at build time,
 * because the catalogue changes from the admin panel without a deploy. A
 * sitemap baked at build would list yesterday's products and omit whatever
 * was published this morning, which is worse than not having one: it tells
 * a crawler the missing URLs are not worth its time.
 *
 * Only `status = 'active'` products appear. A draft's URL answers 410, and
 * advertising a URL that is Gone spends crawl budget to learn nothing.
 */

import { Store } from '#lib/server/db.js';
import { sitemapProducts, loadCategories } from '#lib/server/catalogue.js';

export const prerender = false;

/** XML text escaping — a product name with & or < must not break the doc. */
const esc = (s) => String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

/** The hand-authored pages, which are prerendered and have no DB row. */
const STATIC_PATHS = [
    ['/', '1.0', 'daily'],
    ['/pages/collection.html', '0.9', 'daily'],
    ['/pages/about.html', '0.5', 'monthly'],
    ['/pages/gallery.html', '0.5', 'monthly'],
    ['/pages/design-for-living.html', '0.5', 'monthly'],
    ['/pages/curated-spaces.html', '0.5', 'monthly'],
    ['/pages/artist.html', '0.5', 'monthly'],
    ['/pages/press.html', '0.4', 'monthly'],
    ['/pages/help.html', '0.3', 'yearly'],
    ['/pages/legal.html', '0.2', 'yearly'],
];

export async function GET({ platform, url }) {
    const env = platform?.env;
    const origin = env?.PUBLIC_ORIGIN || url.origin;

    let products = [];
    let categories = [];
    let shows = [];
    let makers = [];
    if (env?.DB) {
        const store = new Store(env);
        [products, categories, shows, makers] = await Promise.all([
            sitemapProducts(store),
            loadCategories(store),
            // Every show has a page, and a finished one is the long-tail
            // page here: nothing links to it from the site once it closes
            // except its house's Previously list.
            store.all('SELECT id FROM events ORDER BY venue, sort_order'),
            // Only the listed ones: an artist the shop keeps as a card on
            // the index has no page, and that URL answers not-found.
            store.all('SELECT id FROM artists WHERE listed = 1 ORDER BY sort_order'),
        ]);
    }

    const entries = [
        ...STATIC_PATHS.map(([path, priority, freq]) =>
            `  <url>\n    <loc>${esc(origin + path)}</loc>\n    <changefreq>${freq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`),

        ...categories.map(c =>
            `  <url>\n    <loc>${esc(`${origin}/pages/collection-detail.html?cat=${c.slug}`)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`),

        ...makers.map(a =>
            `  <url>
    <loc>${esc(`${origin}/pages/artist-profile.html?id=${encodeURIComponent(a.id)}`)}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`),
        ...shows.map(e =>
            `  <url>
    <loc>${esc(`${origin}/pages/event.html?id=${encodeURIComponent(e.id)}`)}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`),

        ...products.map(p => {
            // lastmod tells a crawler whether a re-fetch is worth it. D1 stores
            // an ISO timestamp; W3C datetime is what the schema asks for, and
            // the date alone is both valid and stable.
            const lastmod = String(p.updated_at || '').slice(0, 10);
            return `  <url>\n    <loc>${esc(`${origin}/products/${p.slug}`)}</loc>${
                lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''
            }\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`;
        }),
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;

    return new Response(xml, {
        headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            // Short enough that a new product is discoverable the same day,
            // long enough that crawlers do not regenerate it on every hit.
            'Cache-Control': 'public, max-age=600, s-maxage=3600',
        },
    });
}
