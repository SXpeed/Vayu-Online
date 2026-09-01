/**
 * Vayu — /pages/cart.html.
 *
 * Lifted verbatim out of the page's inline <script type="module">. It used
 * to import straight from /js/, so every one of those imports was another
 * level of request chaining hanging off the HTML. It is now a bundled chunk
 * that app.js imports only when <body data-page="cart">.
 */

import { getCart, saveCart, removeFromCart, updateCartQty } from '../shop.js';
import { openCheckout } from '../checkout.js';
// category names from js/taxonomy.js — the local map that used to
// live here listed five categories, so an Accents or Souvenir line
// in the cart showed its raw slug
import { categoryTitle } from '../taxonomy.js';
import { site, hydrateNav } from '#lib/stores/site.svelte.js';
import { SHIPPING_DEFAULTS } from '#shared/constants/index.js';

/**
 * The shop's shipping rule, or the shipped defaults until it arrives.
 *
 * Read at render time rather than captured once: /api/catalogue answers
 * after the first paint, and renderCart() runs again when it does.
 *
 * This used to be `(subtotal - discount) >= 5000 ? 0 : 150` written into the
 * total. Those two numbers happened to equal the defaults in
 * store.settings(), so the page looked right — right up until the shop
 * changed either of them in the panel, at which point the cart quoted the
 * old figure and checkout charged the new one, because checkout has always
 * computed this from the settings row (shippingFor in
 * services/orders/checkout.js). The customer was told one price and billed
 * another.
 */
const shippingRule = () => ({
    freeAbove: Number(site.shipping?.freeAbove ?? SHIPPING_DEFAULTS.freeAbove),
    flat: Number(site.shipping?.flat ?? SHIPPING_DEFAULTS.flat),
});

const cartContent = document.getElementById('cartContent');
const cartItemCount = document.getElementById('cartItemCount');

function parsePrice(priceStr) {
    return Number.parseInt(String(priceStr).replace(/\D/g, ''), 10) || 0;
}


function renderCart() {
    const cart = getCart();

    // Update item count
    const totalItems = cart.reduce((sum, item) => sum + (item.qty || 1), 0);
    cartItemCount.textContent = totalItems > 0 ? `${totalItems} ${totalItems === 1 ? 'item' : 'items'}` : '';

    if (cart.length === 0) {
        cartContent.innerHTML = `
            <section class="cart-empty">
                <svg class="cart-empty-icon" width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"></path>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <path d="M16 10a4 4 0 01-8 0"></path>
                </svg>
                <h1 class="cart-empty-title">Your cart is empty</h1>
                <p class="cart-empty-text">
                    Explore our collections — handcrafted for considered living.
                </p>
                <a href="/pages/collection.html" class="cart-empty-btn">Explore Collections</a>
            </section>`;
        return;
    }

    let subtotal = 0;
    cart.forEach(item => {
        subtotal += parsePrice(item.price) * (item.qty || 1);
    });
    const discount = coupon ? Math.min(coupon.discount, subtotal) : 0;
    const rule = shippingRule();
    // Charged on what is actually paid, so a coupon that takes the order
    // under the threshold reinstates the fee — the same order of operations
    // the server uses.
    const shipping = (subtotal - discount) >= rule.freeAbove ? 0 : rule.flat;
    const total = subtotal - discount + shipping;

    let itemsHtml = '';
    cart.forEach(item => {
        const lineTotal = parsePrice(item.price) * (item.qty || 1);
        const catLabel = categoryTitle(item.cat);
        const href = `/pages/product.html?${item.id ? `id=${item.id}&` : ''}cat=${item.cat}&idx=${item.idx}`;
        itemsHtml += `
            <div class="cart-item" data-cat="${item.cat}" data-idx="${item.idx}" data-variant="${item.variant || ''}">
                <a href="${href}" class="cart-item-link">
                    <div class="cart-item-img"><img src="${item.img}" alt="${item.name}" loading="lazy"></div>
                </a>
                <div class="cart-item-info">
                    ${catLabel ? `<div class="cart-item-cat">${catLabel}</div>` : ''}
                    <a href="${href}" class="cart-item-link">
                        <h3>${item.name}${item.variant ? ` <span style="font-size:0.8em;color:#8d887e;">· ${item.variant}</span>` : ''}</h3>
                    </a>
                    <div class="cart-qty">
                        <button class="cart-qty-btn cart-qty-minus" aria-label="Decrease quantity">−</button>
                        <span class="cart-qty-val">${item.qty || 1}</span>
                        <button class="cart-qty-btn cart-qty-plus" aria-label="Increase quantity">+</button>
                    </div>
                </div>
                <div class="cart-item-end">
                    <button class="cart-remove" aria-label="Remove ${item.name} from cart" title="Remove">&times;</button>
                    <div class="cart-item-price">₹ ${lineTotal.toLocaleString('en-IN')}</div>
                </div>
            </div>`;
    });

    cartContent.innerHTML = `
        <div class="cart-layout">
            <div class="cart-items">${itemsHtml}</div>
            <aside class="cart-summary">
                <h2>Order Summary</h2>
                <div class="cart-summary-row">
                    <span>Subtotal</span>
                    <span>₹ ${subtotal.toLocaleString('en-IN')}</span>
                </div>
                ${discount ? `
                <div class="cart-summary-row" style="color:#1e6b1e;">
                    <span>Coupon ${coupon.code}</span>
                    <span>− ₹ ${discount.toLocaleString('en-IN')}</span>
                </div>` : ''}
                <div class="cart-summary-row">
                    <span>Shipping</span>
                    <span>${shipping === 0 ? 'Complimentary' : '₹ ' + shipping}</span>
                </div>
                <div class="cart-coupon" style="display:flex;gap:8px;margin:12px 0 4px;">
                    <input id="couponInput" placeholder="Coupon code" value="${coupon ? coupon.code : ''}"
                        style="flex:1;padding:9px 12px;border:1px solid #d9d3c7;border-radius:2px;font:inherit;font-size:13px;text-transform:uppercase;">
                    <button id="couponBtn" type="button"
                        style="padding:9px 16px;background:${coupon ? '#8d887e' : '#141210'};color:#fff;border:0;border-radius:2px;font:inherit;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;cursor:pointer;">${coupon ? 'Remove' : 'Apply'}</button>
                </div>
                <div id="couponNote" style="font-size:12px;color:#b03030;min-height:15px;"></div>
                <div class="cart-summary-total">
                    <div class="cart-summary-row">
                        <span>Total</span>
                        <span>₹ ${total.toLocaleString('en-IN')}</span>
                    </div>
                </div>
                <button class="cart-checkout-btn">
                    <span>Checkout</span>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                        <polyline points="12 5 19 12 12 19"></polyline>
                    </svg>
                </button>
                <p class="cart-summary-note">Free shipping above ₹ ${rule.freeAbove.toLocaleString('en-IN')} · 7-day returns</p>
                <a href="/pages/collection.html" class="cart-continue">Continue Shopping</a>
            </aside>
        </div>`;

    // Wire up qty + remove buttons (variant-aware: the same product
    // can sit in the cart twice with different options)
    cartContent.querySelectorAll('.cart-item').forEach(el => {
        const cat = el.dataset.cat;
        const idx = Number.parseInt(el.dataset.idx, 10);
        const variant = el.dataset.variant || null;
        const qtyVal = el.querySelector('.cart-qty-val');
        const findItem = () => getCart().find(p =>
            p.cat === cat && p.idx === idx && (p.variant || null) === variant);

        el.querySelector('.cart-qty-minus').addEventListener('click', () => {
            const item = findItem();
            if (item && item.qty > 1) {
                updateCartQty(cat, idx, item.qty - 1, variant);
                qtyVal.textContent = item.qty - 1;
                renderCart();
            }
        });

        el.querySelector('.cart-qty-plus').addEventListener('click', () => {
            const item = findItem();
            if (item) {
                updateCartQty(cat, idx, item.qty + 1, variant);
                qtyVal.textContent = item.qty + 1;
                renderCart();
            }
        });

        el.querySelector('.cart-remove').addEventListener('click', () => {
            el.classList.add('removing');
            setTimeout(() => {
                removeFromCart(cat, idx, variant);
                renderCart();
            }, 280);
        });
    });

    // Coupon apply / remove
    const couponBtn = document.getElementById('couponBtn');
    if (couponBtn) {
        couponBtn.addEventListener('click', async () => {
            if (coupon) { coupon = null; renderCart(); return; }
            const code = document.getElementById('couponInput').value.trim();
            const note = document.getElementById('couponNote');
            if (!code) return;
            try {
                const res = await fetch('/api/coupon/validate', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code, items: cartItemsPayload() }),
                });
                const j = await res.json();
                if (!res.ok) { note.textContent = j.error || 'Invalid coupon'; return; }
                coupon = { code: j.code, discount: j.discount };
                renderCart();
            } catch { note.textContent = 'Could not check that code.'; }
        });
    }
}

// Coupon survives re-renders within the visit. If it is restricted to
// a particular email/phone, the final say is the server's at checkout.
let coupon = null;

const cartItemsPayload = () => getCart().map(i => ({
    id: i.id, cat: i.cat, idx: i.idx, qty: i.qty || 1, name: i.name, variant: i.variant || null,
}));

renderCart();

// Paint immediately with the shipped defaults, then correct the shipping
// line once /api/nav answers with what the shop actually charges. Without
// this the page would keep the fallback for the life of the visit: the cart
// is not in CATALOGUE_ROUTES, so nothing else on it re-renders.
hydrateNav().then(renderCart).catch(() => { /* the fallback already showed */ });

// Listen for cart changes from other tabs
window.addEventListener('vayu:cart-changed', renderCart);

/* ------------------------------------------------------------------
   Checkout — the dialog lives in js/checkout.js, which offers the
   guest / sign-in / register choice and then posts to /api/checkout.
   This page only hands it the cart and clears it afterwards. */

function startCheckout({ track = true } = {}) {
    if (!getCart().length) return;

    if (track) {
        try {
            navigator.sendBeacon?.('/api/track', new Blob(
                [JSON.stringify({ type: 'checkoutStart', sid: localStorage.getItem('vayu_sid') || '' })],
                { type: 'application/json' }));
        } catch { /* ignore */ }
    }

    openCheckout({
        getItems: cartItemsPayload,
        getCoupon: () => (coupon ? coupon.code : null),
        onPlaced: () => { saveCart([]); coupon = null; },
    });
}

cartContent.addEventListener('click', (e) => {
    if (e.target.closest('.cart-checkout-btn')) startCheckout();
});

// Coming back from Google: signing in is a full-page round trip, so
// reopen the dialog where the shopper left it. Not counted as a
// second checkout start — it is the same one, resumed.
if (new URLSearchParams(location.search).has('checkout')) {
    history.replaceState(null, '', location.pathname);
    startCheckout({ track: false });
}
