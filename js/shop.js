/**
 * Vayu — shared cart & wishlist helpers (localStorage-based)
 * Usage: import { getCart, addToCart, removeFromCart, getWishlist, toggleWishlist, isInWishlist } from '/js/shop.js';
 */

const CART_KEY = 'vayu_cart';
const WISH_KEY = 'vayu_wishlist';

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
}

/**
 * Add a product to the cart. If it already exists (same cat+idx), increase qty.
 * @param {Object} product  { cat, idx, name, price, img, qty }
 */
export function addToCart(product) {
    const cart = getCart();
    const existing = cart.find(p => p.cat === product.cat && p.idx === product.idx);
    if (existing) {
        existing.qty = (existing.qty || 1) + (product.qty || 1);
    } else {
        cart.push({ ...product, qty: product.qty || 1 });
    }
    saveCart(cart);
    return cart;
}

export function removeFromCart(cat, idx) {
    const cart = getCart().filter(p => !(p.cat === cat && p.idx === idx));
    saveCart(cart);
    return cart;
}

export function updateCartQty(cat, idx, qty) {
    const cart = getCart();
    const item = cart.find(p => p.cat === cat && p.idx === idx);
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