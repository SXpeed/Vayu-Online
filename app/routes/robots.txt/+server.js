/**
 * Vayu — robots.txt.
 *
 * Served by the Worker rather than dropped in as a static file so the
 * Sitemap line can name the host that is actually answering. A hardcoded
 * a hardcoded https://example.com/sitemap.xml would be wrong on the workers.dev
 * preview, and pointing a crawler at the production sitemap from a preview
 * domain is how preview URLs end up indexed.
 *
 * The disallows are the paths that must never reach an index: the admin
 * panel, the API, and the cart/checkout funnel. Those last ones are not
 * secret — they are per-visitor pages with nothing to rank, and letting a
 * crawler wander them wastes budget that should go to products.
 */

export const prerender = false;

export function GET({ platform, url }) {
    const origin = platform?.env?.PUBLIC_ORIGIN || url.origin;

    const body = [
        'User-agent: *',
        'Allow: /',
        '',
        '# Nothing to index, and not for crawlers.',
        'Disallow: /admin',
        'Disallow: /admin/',
        'Disallow: /api/',
        'Disallow: /pages/cart.html',
        'Disallow: /pages/checkout.html',
        'Disallow: /pages/wishlist.html',
        'Disallow: /pages/user-profile.html',
        '',
        '# The legacy product URL. Every one of these 301s onto /products/<slug>;',
        '# the canonical tag says the same thing. Kept crawlable rather than',
        '# disallowed, because a crawler must be able to FOLLOW the redirect to',
        '# learn where the page moved — blocking it strands the old URLs in the',
        '# index pointing nowhere.',
        'Allow: /pages/product.html',
        '',
        `Sitemap: ${origin}/sitemap.xml`,
        '',
    ].join('\n');

    return new Response(body, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
        },
    });
}
