/**
 * Vayu — shared cart & wishlist helpers (localStorage-based)
 * Usage: import { getCart, addToCart, removeFromCart, getWishlist, toggleWishlist, isInWishlist } from '/js/shop.js';
 */

const CART_KEY = 'vayu_cart';
const WISH_KEY = 'vayu_wishlist';

/* Fire-and-forget beacon to the admin analytics (funnel + abandoned carts). */
function beacon(payload) {
    try {
        payload.sid = localStorage.getItem('vayu_sid') || '';
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        navigator.sendBeacon?.('/api/track', blob);
    } catch { /* analytics must never break shopping */ }
}

/** Two cart lines are the same product if id+variant match (or legacy cat+idx). */
const sameLine = (a, b) => (a.id && b.id ? a.id === b.id : a.cat === b.cat && a.idx === b.idx)
    && (a.variant || null) === (b.variant || null);

/* ---------- CART ---------- */

export function getCart() {
    try {
        return JSON.parse(localStorage.getItem(CART_KEY)) || [];
    } catch {
        return [];
    }
}

export function saveCart(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    // Notify other tabs / pages
    window.dispatchEvent(new CustomEvent('vayu:cart-changed', { detail: items }));
    // Snapshot for abandoned-cart tracking (an empty cart clears it)
    beacon({ type: 'cart', items: items.map(i => ({ name: i.name, qty: i.qty, price: i.price, img: i.img })) });
}

/** Stable key for one cart line: product identity + chosen variant. */
export const lineKey = (p) => `${p.id || `${p.cat}|${p.idx}`}::${p.variant || ''}`;

/**
 * Add a product to the cart. If the same product+variant is already there,
 * increase qty. @param {Object} product { id?, cat, idx, name, price, img, variant?, qty }
 */
export function addToCart(product) {
    const cart = getCart();
    const existing = cart.find(p => sameLine(p, product));
    if (existing) {
        existing.qty = (existing.qty || 1) + (product.qty || 1);
    } else {
        cart.push({ ...product, qty: product.qty || 1 });
    }
    saveCart(cart);
    beacon({ type: 'atc' });
    return cart;
}

export function removeFromCart(cat, idx, variant) {
    const probe = { cat, idx, variant: variant || null };
    const cart = getCart().filter(p => !sameLine(p, probe));
    saveCart(cart);
    return cart;
}

export function updateCartQty(cat, idx, qty, variant) {
    const cart = getCart();
    const item = cart.find(p => sameLine(p, { cat, idx, variant: variant || null }));
    if (item) {
        item.qty = Math.max(1, qty);
        saveCart(cart);
    }
    return cart;
}

export function getCartCount() {
    return getCart().reduce((n, p) => n + (p.qty || 1), 0);
}

/* ---------- WISHLIST ---------- */

export function getWishlist() {
    try {
        return JSON.parse(localStorage.getItem(WISH_KEY)) || [];
    } catch {
        return [];
    }
}

export function saveWishlist(items) {
    localStorage.setItem(WISH_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('vayu:wishlist-changed', { detail: items }));
}

export function isInWishlist(cat, idx) {
    return getWishlist().some(p => p.cat === cat && p.idx === idx);
}

export function toggleWishlist(product) {
    const list = getWishlist();
    const existing = list.findIndex(p => p.cat === product.cat && p.idx === product.idx);
    let added = false;
    if (existing > -1) {
        list.splice(existing, 1);
        added = false;
    } else {
        list.push(product);
        added = true;
    }
    saveWishlist(list);
    return added;
}

export function removeFromWishlist(cat, idx) {
    const list = getWishlist().filter(p => !(p.cat === cat && p.idx === idx));
    saveWishlist(list);
    return list;
}

export function getWishlistCount() {
    return getWishlist().length;
}