/**
 * Vayu — the legacy product URL, kept alive only to forward.
 *
 * /pages/product.html?cat=objects&idx=3 and ?id=prod_12 were the only
 * product addresses this shop ever had. They are in Google's index, in
 * people's bookmarks, in every saved cart line and on every historical
 * order, so they are forwarded rather than deleted: a 301 hands the
 * accumulated ranking to /products/<slug> instead of throwing it away.
 *
 * This lives in the route rather than in hooks.server.js, and that is not a
 * style choice. This page used to be PRERENDERED, which makes it a static
 * file in the assets directory — and Workers Assets serves a matching file
 * *before* the Worker runs. A redirect written in the hook never executed,
 * because nothing ever reached the hook. `prerender = false` is what takes
 * the page out of the assets directory and puts it back in front of the
 * Worker, which is the entire fix; adding the path to `run_worker_first`
 * did not do it.
 *
 * The page still renders normally when the query names no product it can
 * resolve, so a bare /pages/product.html is not a broken link.
 */

import { redirect } from '@sveltejs/kit';
import { Store } from '#lib/server/db.js';

export const prerender = false;

export async function load({ url, platform }) {
    const env = platform?.env;
    if (!env?.DB) return {};

    const store = new Store(env);
    const id = url.searchParams.get('id');
    const cat = url.searchParams.get('cat');

    let slug = null;
    try {
        if (id) {
            slug = await store.value(
                `SELECT slug FROM products WHERE id = ? AND slug != ''`,
                id,
            );
        } else if (cat) {
            // idx is the product's position within its category, ordered
            // exactly as productByCatIdx orders it — the two must agree or
            // the redirect lands on a different product than the old URL did.
            slug = await store.value(
                `SELECT p.slug FROM products p
                   JOIN product_categories pc ON pc.product_id = p.id
                  WHERE pc.category_slug = ? AND p.status = 'active' AND p.slug != ''
                  ORDER BY p.sort_order, p.rowid
                  LIMIT 1 OFFSET ?`,
                cat, Number(url.searchParams.get('idx')) || 0,
            );
        }
    } catch {
        // Forwarding is an optimisation, never a hard dependency: if the
        // lookup fails the old page still renders itself.
        return {};
    }

    if (slug) redirect(301, `/products/${slug}`);
    return {};
}
