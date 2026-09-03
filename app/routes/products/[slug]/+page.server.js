/**
 * Vayu — /products/<slug>, the product page a search engine can actually read.
 *
 * This is the one route on the site that is NOT prerendered, and that is the
 * whole point of it. Everything else is content that changes when someone
 * edits it, so it is baked at build time; a product's price and stock change
 * without a deploy, and a crawler that is handed a stale price will report
 * the mismatch against the Product structured data below.
 *
 * The route it replaces served every product in the catalogue from a single
 * prerendered document — /pages/product.html?cat=objects&idx=3 — whose title
 * was the literal string "Product — Vayu" and whose body was filled in by
 * client-side JS after load. A crawler saw one page, one title, no product
 * name, no price, no description. That is not a ranking problem, it is an
 * indexing one: there was nothing there to index.
 *
 * Three outcomes, deliberately distinct:
 *   200  a live product
 *   410  a real product that is draft or archived — Gone, so a crawler drops
 *        it. A 404 here would have it re-queue the URL indefinitely.
 *   404  a slug that never existed
 */

import { error } from '@sveltejs/kit';
import { Store } from '#lib/server/db.js';
import {
    productBySlug, loadProducts, loadCategories, loadShippingPresets, shippingTextFor, totalStock,
} from '#lib/server/catalogue.js';
import { formatPrice } from '#lib/server/db.js';
import { PRICE_ON_REQUEST } from '#shared/constants/index.js';

export const prerender = false;

export async function load({ params, platform, url }) {
    const env = platform?.env;
    if (!env?.DB) error(503, 'Bindings unavailable — run through wrangler, not `vite dev`.');

    const store = new Store(env);
    const product = await productBySlug(store, params.slug);

    if (!product) error(404, 'Product not found');
    if (product.status !== 'active') error(410, 'This product is no longer available');

    const [categories, presets] = await Promise.all([
        loadCategories(store),
        loadShippingPresets(store),
    ]);

    // The product's primary category, resolved to its display title for the
    // breadcrumb. A product with no category still renders — the crumb just
    // stops at Collection.
    const primary = product.categories?.[0] || null;
    const category = primary
        ? (categories.find(c => c.slug === primary.cat) || null)
        : null;

    // Canonical is built from the request's own origin rather than a
    // hardcoded domain, so the workers.dev preview and the live domain each
    // declare themselves rather than the preview claiming to be production.
    const origin = env.PUBLIC_ORIGIN || url.origin;

    const gallery = product.gallery?.length ? product.gallery : (product.img ? [product.img] : []);

    // totalStock(), not product.stock. A product with variants keeps its
    // stock on the variant rows and leaves the column on `products` at 0, so
    // reading the column directly reported every optioned product as sold
    // out — and, worse, emitted schema.org/OutOfStock for it. Wrong
    // availability in structured data is not a cosmetic bug: it is what gets
    // a merchant's items suppressed in Google Shopping.
    /**
     * "You may also like" — four pieces, ranked by affinity.
     *
     * Same weighting the old /pages/product.html used: same sub-category
     * counts most, then same category, then each tag the two share. Built on
     * the server rather than in the browser, which is the point of this page
     * existing — four internal links a crawler can follow, present in the
     * HTML rather than assembled after load.
     */
    const myTags = new Set(product.tags || []);
    const mySubs = new Set((product.categories || []).map(c => c.sub).filter(Boolean));
    const myCats = new Set((product.categories || []).map(c => c.cat));

    const related = (await loadProducts(store, { status: 'active' }))
        .filter(p => p.id !== product.id && p.slug)
        .map((p) => {
            let score = 0;
            for (const c of p.categories || []) {
                if (myCats.has(c.cat)) score += 2;
                if (c.sub && mySubs.has(c.sub)) score += 3;
            }
            for (const t of p.tags || []) if (myTags.has(t)) score += 1;
            return { p, score };
        })
        // Something to show even on a shop with nothing in common yet: an
        // empty rail reads as a broken section, not as an honest absence.
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .map(({ p }) => ({
            slug: p.slug,
            name: p.name,
            priceLabel: p.inquiryOnly ? PRICE_ON_REQUEST : formatPrice(p.price),
            compareAtLabel: (p.compareAt && !p.inquiryOnly) ? formatPrice(p.compareAt) : null,
            img: p.img || (p.gallery || [])[0] || '',
            isNew: !!p.isNew,
        }));

    const stock = totalStock(product);
    const inStock = stock > 0;

    // The shop's real shipping terms, for the Offer's shippingDetails below.
    // Read from settings rather than written into the schema by hand: Google
    // checks structured data against the page and against checkout, and a
    // threshold that disagrees with what the shop actually charges is worse
    // than declaring none at all.
    const settings = await store.settings();

    return {
        product: {
            id: product.id,
            slug: product.slug,
            name: product.name,
            description: product.description || '',
            // A piece sold on request sends NO price at all — not the guide
            // figure the shop keeps on the row. Anything returned here is
            // readable in the page source, and a number sitting in the HTML
            // of a page that says "Price on request" is a number somebody
            // will eventually quote back at the shop.
            price: product.inquiryOnly ? null : product.price,
            priceLabel: product.inquiryOnly ? PRICE_ON_REQUEST : formatPrice(product.price),
            compareAt: product.inquiryOnly ? null : product.compareAt,
            inquiryOnly: !!product.inquiryOnly,
            sku: product.sku || '',
            // `stock` itself is deliberately not returned. The page shows
            // availability, not a count, and anything serialised here is
            // readable in the page source — so the boolean is all that
            // travels. totalStock() is still what decides it.
            inStock,
            isNew: !!product.isNew,
            img: product.img || '',
            gallery,
            care: product.care || '',
            dimensions: product.dimensions || [],
            materials: product.materials || [],
            shipping: shippingTextFor(product, presets),
            options: product.options || [],
            variants: product.variants || [],
            // Shown as chips at the foot of the panel. They already score the
            // "you may also like" rail (lib/pages/product.js) — this makes the
            // same words a visitor can act on rather than only a hidden signal.
            tags: product.tags || [],
        },
        category: category ? { slug: category.slug, title: category.title } : null,
        related,
        commerce: {
            currency: settings.currency || 'INR',
            shippingFlat: Number(settings.shippingFlat) || 0,
            freeShippingAbove: Number(settings.freeShippingAbove) || 0,
            // The window stated on /pages/help.html. It is a policy, not a
            // setting, so it has no row to read — stated here in one place
            // rather than repeated into the markup.
            returnDays: 7,
        },
        seo: {
            canonical: `${origin}/products/${product.slug}`,
            origin,
            // The override wins; otherwise the product's own name, suffixed so
            // the brand is present in the result without the editor retyping it.
            title: product.metaTitle || `${product.name} — Vayu`,
            // A description is what fills the search snippet. Falling back to
            // the product copy beats leaving it empty, which lets the engine
            // invent a snippet out of whatever text it finds first.
            description: (product.metaDescription
                || product.description
                || `${product.name}, handcrafted by Vayu.`)
                .replace(/\s+/g, ' ').trim().slice(0, 160),
            image: gallery[0] ? new URL(gallery[0], origin).href : '',
        },
    };
}
