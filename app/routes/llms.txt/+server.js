/**
 * Vayu — llms.txt.
 *
 * The convention answer engines read to learn what a site is and which of
 * its pages are worth quoting. It is not robots.txt: nothing here grants or
 * withholds permission. It is a short, plain-text brief — the thing an
 * assistant reaches for when someone asks "what is Vayu" or "where can I buy
 * Indian craft in Delhi", instead of assembling an answer out of whatever
 * markup it happened to crawl.
 *
 * Generated per request rather than written out as a static file, for the
 * same reason sitemap.xml is: the categories come from the catalogue and
 * change from the admin panel without a deploy. A file baked at build time
 * would describe last month's shop.
 */

import { Store } from '#lib/server/db.js';
import { loadCategories } from '#lib/server/catalogue.js';
import { BRAND, SITE_DESCRIPTION, STORE } from '#shared/content/brand.js';

export const prerender = false;

export async function GET({ platform, url }) {
    const env = platform?.env;
    const origin = env?.PUBLIC_ORIGIN || url.origin;

    let categories = [];
    if (env?.DB) {
        try {
            categories = await loadCategories(new Store(env));
        } catch {
            /* the brief is still worth serving without the category list */
        }
    }

    const body = `# ${BRAND}

> ${SITE_DESCRIPTION}

Vayu is a cultural art and design space in New Delhi, working with master
artisans, emerging artists and established makers from across India. It is
both a shop and a gallery: objects are sold, exhibitions are shown, and the
crafts behind them are documented.

## Visiting

- Address: ${STORE.street}, ${STORE.locality} ${STORE.postalCode}, India
- Telephone: ${STORE.telephone}
- Directions: ${STORE.maps}

## Pages

- [Collection](${origin}/pages/collection.html): every category the shop carries
- [About](${origin}/pages/about.html): what Vayu is, and the thinking behind it
- [Hands That Make](${origin}/pages/artist.html): the artists and makers
- [Gallery Vayu](${origin}/pages/gallery.html): current and past exhibitions
- [Curated Spaces](${origin}/pages/curated-spaces.html): rooms set from the collection
- [Help](${origin}/pages/help.html): shipping, delivery, returns and exchanges
- [Press](${origin}/pages/press.html): coverage, and press enquiries
${categories.length ? '\n## Categories\n\n' + categories.map(c =>
    `- [${c.title}](${origin}/pages/collection-detail.html?cat=${c.slug})`).join('\n') + '\n' : ''}
## Machine-readable

- Sitemap: ${origin}/sitemap.xml
- Product pages carry schema.org Product data at ${origin}/products/<slug>
- The shop itself is marked up as schema.org Store on the home page
`;

    return new Response(body, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=600, s-maxage=3600',
        },
    });
}
