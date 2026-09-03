/**
 * Vayu — the product tile.
 *
 * One card design, one handler. The same markup used to be written out
 * three times — the collection grid in js/script.js, "You May Also Like"
 * in pages/product.html and the artist capsule in pages/jenjum.html —
 * each with its own copy of the two SVG paths and its own click handler,
 * so a change to the tile had to be made in three places and had already
 * drifted (the jenjum copy fired no toast, and the product.html copy
 * marked the first image `loading="lazy"` where the others did not).
 *
 * The card carries `data-cat` and `data-idx`, so bindProductTiles can
 * resolve the product from the catalogue without the caller passing a
 * lookup in. That also means the binding survives any re-render.
 */

import { site } from '#lib/stores/site.svelte.js';
import { addToCart, toggleWishlist, isInWishlist } from './shop.js';
import { hasOptions } from './options.js';
import { pictureHTML } from '#shared/content/picture.js';

const HEART_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>';

const CART_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>';

/**
 * How wide a tile's photograph actually renders, so the browser can pick a
 * candidate off the srcset instead of assuming the full viewport.
 *
 * These are .prod-grid's three states, in the same order the stylesheet
 * declares them (app/styles/styles.css, section 07): two up on a phone,
 * `auto-fill minmax(230px)` in between — three columns at most tablet widths
 * — and a fixed four up from 1024px, where the content column caps at
 * 1360px and each tile lands near 340px however wide the window gets.
 *
 * It only matters for uploads, which are the pictures the Worker resizes on
 * demand; a shipped file has one AVIF twin and no ladder to choose from. But
 * a product photograph is nearly always an upload, so this is precisely the
 * case worth getting right — and getting it wrong is expensive in the one
 * direction: omit it and every phone downloads the 1366px candidate for a
 * 180px box.
 */
const TILE_SIZES = '(max-width: 600px) 50vw, (max-width: 1023px) 33vw, min(25vw, 340px)';

/** Attribute-safe text. A product name may carry a quote or an ampersand. */
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));

/** Resolve a product from the catalogue by category slug and index. */
export const productAt = (cat, idx) => site.products[cat]?.[idx];

/**
 * Markup for one tile. Returns '' for an unknown cat/idx so a bad
 * reference drops the card rather than rendering an empty frame.
 *
 * The gallery becomes a scroll-snap track inside the card, so a swipe
 * pages through the shots while a tap still opens the product. Each shot
 * sits in its own clipping slot (.ph-slide) so the hover zoom cannot
 * spill over the neighbouring image in the track.
 */
export function productCardHTML(cat, idx) {
    const p = productAt(cat, idx);
    if (!p) return '';

    // By id where the product has one, so the heart agrees with what
    // pressing it will do: bindProductTiles below toggles by id, and
    // asking by position alone made a tile show a filled heart that then
    // added a second entry instead of removing the one it was showing.
    const wished = isInWishlist(cat, idx, p.id);
    const shots = (p.gallery?.length ? p.gallery : [p.img]).slice(0, 4);
    // The first shot is what the tile shows at rest, so it is never lazy;
    // the other three are behind a swipe and can wait. Each goes through
    // pictureHTML, which offers the AVIF twin where one exists and states
    // the picture's own width and height either way — a tile with no size
    // on it is a hole the grid closes up when the bytes land.
    const shotsHTML = shots
        .map((src, i) => `<span class="ph-slide">${pictureHTML(src, {
            alt: i ? '' : p.name,
            lazy: i > 0,
            sizes: TILE_SIZES,
            escape: esc,
        })}</span>`)
        .join('');

    // The canonical address, when the product has one. Linking straight to
    // /products/<slug> rather than to the ?id= form that 301s onto it is not
    // cosmetic: an internal link through a redirect spends a round trip on
    // every click, and pointing the whole site's internal links at a URL
    // that immediately forwards is a weaker signal than linking the
    // canonical one directly.
    //
    // The old form stays as the fallback for the static catalogue, whose
    // products have no row in D1 and therefore no slug.
    const href = p.slug
        ? `/products/${p.slug}`
        : p.id
            ? `/pages/product.html?id=${p.id}&cat=${cat}&idx=${idx}`
            : `/pages/product.html?cat=${cat}&idx=${idx}`;
    const priceHTML = p.compareAt
        ? `<span class="price-sale">${p.price}</span> <s class="price-was" style="color:#9b968c;font-weight:400">${p.compareAt}</s>`
        : p.price;

    return `<a class="product" data-cat="${cat}" data-idx="${idx}" href="${href}">
    <button class="wish-btn${wished ? ' is-wished' : ''}" data-act="wish"
        aria-pressed="${wished ? 'true' : 'false'}"
        aria-label="${wished ? 'Remove from' : 'Add to'} Wishlist">${HEART_SVG}</button>
    <div class="ph">${shotsHTML}</div>
    <div class="product-info">
        <div>
            <h3>${p.name}</h3>
            <div class="price">${priceHTML}</div>
        </div>
        <button class="cart-btn" data-act="cart" aria-label="Add to Cart">${CART_SVG}</button>
    </div>
</a>`;
}

/** Render a list of [cat, idx] pairs into a container. */
export function renderProductCards(container, pairs) {
    if (!container) return;
    container.innerHTML = pairs.map(([cat, idx]) => productCardHTML(cat, idx)).join('');
}

/**
 * Wire the wishlist and add-to-cart buttons for every tile inside `root`.
 * Delegated, so it survives re-renders (sorting, subcategory switches)
 * without rebinding. `onToast` is optional — pass the page's toast.
 */
export function bindProductTiles(root, onToast) {
    if (!root || root.dataset.tilesBound) return;
    root.dataset.tilesBound = '';

    root.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn || !root.contains(btn)) return;

        // the buttons sit inside the card's <a> — act instead of navigating
        e.preventDefault();
        e.stopPropagation();

        const card = btn.closest('.product');
        const cat = card?.dataset.cat;
        const idx = Number.parseInt(card?.dataset.idx, 10);
        const p = productAt(cat, idx);
        if (!p) return;

        const payload = { id: p.id, cat, idx, name: p.name, price: p.price, img: p.img };

        if (btn.dataset.act === 'cart') {
            // A piece sold by colour and size cannot be added from a tile:
            // there is nothing here to choose with, and a line with no
            // variant is one the checkout refuses — it would price at the
            // base rate against stock nobody tracks. So the button opens the
            // product instead, which is where the choice lives. The card is
            // itself the link to that page, so its own href is the target.
            // A piece sold on request goes the same way, for the same
            // reason one step further along: it has no price, so there is
            // no line to add. The enquiry form is on its page, so that is
            // where the button sends them rather than refusing in a toast
            // and leaving them where they were.
            if (hasOptions(p) || p.inquiryOnly) {
                const href = card.getAttribute('href');
                onToast?.(p.inquiryOnly
                    ? `${p.name} is priced on request`
                    : `Choose an option for ${p.name}`);
                if (href) globalThis.location.assign(href);
                return;
            }
            addToCart(payload);
            onToast?.(`${p.name} added to cart`);
            return;
        }

        const added = toggleWishlist(payload);
        btn.classList.toggle('is-wished', added);
        btn.setAttribute('aria-pressed', String(added));
        btn.setAttribute('aria-label', `${added ? 'Remove from' : 'Add to'} Wishlist`);
        onToast?.(added ? `${p.name} added to wishlist` : `${p.name} removed from wishlist`);
    });
}
