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

import { productData } from './catalogue.js';
import { addToCart, toggleWishlist, isInWishlist } from './shop.js';

const HEART_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>';

const CART_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>';

/** Resolve a product from the catalogue by category slug and index. */
export const productAt = (cat, idx) => productData[cat]?.[idx];

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

    const wished = isInWishlist(cat, idx);
    const shots = (p.gallery?.length ? p.gallery : [p.img]).slice(0, 4);
    // the first shot is what the tile shows at rest, so it is never lazy
    const shotsHTML = shots
        .map((src, i) => `<span class="ph-slide"><img src="${src}" alt="${i ? '' : p.name}"${i ? ' loading="lazy"' : ''}></span>`)
        .join('');

    // Products managed in the admin panel carry a permanent id — link by it
    // so the URL survives catalogue re-ordering; cat/idx ride along as a
    // fallback for the static catalogue.
    const href = p.id
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
