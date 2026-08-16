/**
 * Vayu — /pages/wishlist.html.
 *
 * Lifted verbatim out of the page's inline <script type="module">. It used
 * to import straight from /js/, so every one of those imports was another
 * level of request chaining hanging off the HTML. It is now a bundled chunk
 * that app.js imports only when <body data-page="wishlist">.
 */

import { getWishlist, removeFromWishlist, addToCart } from '../shop.js';

const wishContent = document.getElementById('wishContent');

function showToast(msg) {
    let toast = document.getElementById('vayuToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'vayuToast';
        toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--ink);color:#fff;padding:12px 28px;border-radius:2px;font-family:Jost,sans-serif;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;z-index:10000;opacity:0;transition:opacity 0.3s ease;pointer-events:none;';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 2200);
}

function renderWishlist() {
    const wishlist = getWishlist();

    if (wishlist.length === 0) {
        wishContent.innerHTML = `
            <section class="empty-state" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:50vh;text-align:center;padding:60px 16px;margin-bottom:50px;">
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" style="color:var(--body);margin-bottom:24px;opacity:0.7;">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                <h1 style="font-family:'Cormorant Garamond',serif;font-weight:300;font-size:32px;color:var(--ink);margin-bottom:8px;">Your wishlist is empty</h1>
                <p style="font-size:14px;color:var(--body);max-width:420px;margin:0 0 28px;letter-spacing:0.02em;">
                    Save pieces across fashion, furniture, home and decor to revisit them here.</p>
                <a href="/pages/collection.html" class="hero-full-btn" style="display:inline-block;padding:14px 32px;background:var(--ink);color:#fff;text-decoration:none;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;font-family:'Jost',sans-serif;">Explore Collections</a>
            </section>`;
        return;
    }

    let cardsHtml = '';
    wishlist.forEach(item => {
        cardsHtml += `
            <div class="wish-card" data-cat="${item.cat}" data-idx="${item.idx}">
                <a href="/pages/product.html?cat=${item.cat}&idx=${item.idx}" class="wish-card-img">
                    <img src="${item.img}" alt="${item.name}" loading="lazy">
                </a>
                <div class="wish-card-name">${item.name}</div>
                <div class="wish-card-price">${item.price}</div>
                <div class="wish-card-actions">
                    <button class="wish-add-cart">Add to Cart</button>
                    <button class="wish-remove-btn">Remove</button>
                </div>
            </div>`;
    });

    wishContent.innerHTML = `<div class="wish-grid">${cardsHtml}</div>`;

    wishContent.querySelectorAll('.wish-card').forEach(el => {
        const cat = el.dataset.cat;
        const idx = Number.parseInt(el.dataset.idx, 10);

        el.querySelector('.wish-add-cart').addEventListener('click', (e) => {
            e.preventDefault();
            const item = getWishlist().find(p => p.cat === cat && p.idx === idx);
            if (item) {
                addToCart({ cat, idx, name: item.name, price: item.price, img: item.img, qty: 1 });
                showToast('Added to Cart');
            }
        });

        el.querySelector('.wish-remove-btn').addEventListener('click', (e) => {
            e.preventDefault();
            removeFromWishlist(cat, idx);
            renderWishlist();
        });
    });
}

renderWishlist();

window.addEventListener('vayu:wishlist-changed', renderWishlist);
