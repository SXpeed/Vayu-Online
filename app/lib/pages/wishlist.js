/**
 * Vayu — /pages/wishlist.html.
 *
 * The saved pieces are drawn with the same tile as everywhere else —
 * product-card.js, the card the collection grid, the venue rails and the
 * suggestions under a product all use. This page used to write its own
 * `.wish-card`: a square crop instead of the tile's gallery, a name and
 * price set in different sizes, two text buttons instead of the heart and
 * the cart glyph, and its own toast that looked nothing like the site's.
 * Two tile designs for the same object, and only one of them ever got the
 * improvements.
 *
 * A saved piece is found by its product id rather than by the [category,
 * index] pair it was saved with. The pair is a position: it moves whenever
 * a product earlier in the category is removed, and the wishlist is the one
 * list on the site that is expected to survive months of catalogue edits.
 */

import { syncWishlistFromServer } from '../shop.js';
import { site, hydrateCatalogue } from '#lib/stores/site.svelte.js';
import { renderProductCards, bindProductTiles } from '../product-card.js';
import { showToast } from '../core/toast.js';

const wishContent = document.getElementById('wishContent');

const EMPTY_HTML = `
    <section class="empty-state" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:50vh;text-align:center;padding:60px 16px;margin-bottom:50px;">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" style="color:var(--body);margin-bottom:24px;opacity:0.7;">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
        <h1 style="font-family:'Cormorant Garamond',serif;font-weight:300;font-size:32px;color:var(--ink);margin-bottom:8px;">Your wishlist is empty</h1>
        <p style="font-size:14px;color:var(--body);max-width:420px;margin:0 0 28px;letter-spacing:0.02em;">
            Save pieces across fashion, furniture, home and decor to revisit them here.</p>
        <a href="/pages/collection.html" class="hero-full-btn" style="display:inline-block;padding:14px 32px;background:var(--ink);color:#fff;text-decoration:none;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;font-family:'Jost',sans-serif;">Explore Collections</a>
    </section>`;

/**
 * Where a saved piece sits in the catalogue now, as the [category, index]
 * pair the tile is addressed by — or null if the catalogue no longer
 * carries it.
 *
 * By id first, and across every category, because both halves of the saved
 * pair can go stale: a product moved to another category keeps its id, and
 * the server itself returns `idx: null` for rows saved since the catalogue
 * moved into D1.
 */
function locate(item) {
    const products = site.products || {};

    if (item.id) {
        for (const [cat, list] of Object.entries(products)) {
            const i = list.findIndex(p => p.id === item.id);
            if (i > -1) return [cat, i];
        }
    }

    // The saved position, which is all a row from before the ids carries.
    const list = products[item.cat];
    const idx = Number(item.idx);
    return list && Number.isInteger(idx) && list[idx] ? [item.cat, idx] : null;
}

/**
 * Said rather than swallowed: the pieces are still saved, and a grid that
 * silently comes back shorter than the badge in the header reads as a bug
 * in the page.
 */
function missingNote(missing) {
    if (!missing) return '';
    const verb = missing === 1 ? 'piece is' : 'pieces are';
    return `<p style="margin:22px 0 0;font-size:13px;color:var(--body);letter-spacing:0.02em">${missing} saved ${verb} no longer in the catalogue.</p>`;
}

/**
 * Re-entry guard.
 *
 * Rendering this page *writes*: syncWishlistFromServer saves what the
 * server returned, and saving fires `vayu:wishlist-changed`, which this
 * module listens to. A signed-in customer therefore had the page render
 * itself in a loop — measured at ~470 requests a second to
 * /api/account/wishlist from a single open tab. saveWishlist now stays
 * quiet when nothing actually changed, which ends it at the source; this
 * flag makes sure a future caller cannot reopen it from here.
 */
let rendering = false;

async function renderWishlist() {
    if (rendering) return;
    rendering = true;
    try {
        // The catalogue as well as the list: the shared tile reads the live
        // product — its gallery, its price, whether it is on sale — rather
        // than the snapshot taken when the piece was saved. This page is
        // not in the layout's catalogue routes, so nothing else fetches it.
        const [wishlist] = await Promise.all([syncWishlistFromServer(), hydrateCatalogue()]);

        if (wishlist.length === 0) {
            wishContent.innerHTML = EMPTY_HTML;
            return;
        }

        const pairs = wishlist.map(locate).filter(Boolean);
        const missing = wishlist.length - pairs.length;

        if (pairs.length === 0) {
            wishContent.innerHTML = EMPTY_HTML;
            return;
        }

        wishContent.innerHTML = `<div class="prod-grid" id="wishGrid"></div>${missingNote(missing)}`;

        const grid = document.getElementById('wishGrid');
        renderProductCards(grid, pairs);
        // The heart on the tile is what removes a piece here, and toggling
        // it fires the same event this module re-renders on — so the card
        // leaves the grid without the page needing a Remove button of its
        // own.
        bindProductTiles(grid, showToast);
    } finally {
        rendering = false;
    }
}

// The listener goes on before the first render so a change fired mid-render
// (syncWishlistFromServer → saveWishlist) is never missed; the re-entry
// guard keeps the overlapping call from doing double work.
window.addEventListener('vayu:wishlist-changed', renderWishlist);

await renderWishlist();
