/**
 * Vayu — shared cart & wishlist helpers.
 *
 * Cart is localStorage-only (it is never read by the server until checkout).
 * Wishlist is **server-backed with a localStorage cache**: the heart toggle
 * updates the cache instantly so the UI never waits on the network, and a
 * fire-and-forget POST/DELETE persists the change to the `wishlists` table
 * keyed by customer_id (logged in) or guest_key (guest). The wishlist page
 * and header badge reconcile from the server on every visit, so a returning
 * shopper sees what they saved on another device.
 *
 * Usage: import { getCart, addToCart, getWishlist, toggleWishlist, isInWishlist, syncWishlistFromServer } from '/js/shop.js';
 */

const CART_KEY = 'vayu_cart';
const WISH_KEY = 'vayu_wishlist';
const COUPON_KEY = 'vayu_coupon';

/* Fire-and-forget beacon to the admin analytics (funnel + abandoned carts). */
function beacon(payload) {
    try {
        payload.sid = localStorage.getItem('vayu_sid') || '';
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        navigator.sendBeacon?.('/api/track', blob);
    } catch { /* analytics must never break shopping */ }
}

/* ---------- cookies & guest key ---------- */

/** The per-browser guest key — the same id the analytics beacon mints. */
export function guestKey() {
    try { return localStorage.getItem('vayu_sid') || ''; } catch { return ''; }
}

/** Set a cookie, surviving a tab close so the server can read it. */
function setCookie(name, value, days = 365) {
    try {
        const maxAge = days > 0 ? `max-age=${days * 86400}` : `max-age=0`;
        document.cookie = `${name}=${encodeURIComponent(value)}; path=/; ${maxAge}; SameSite=Lax`;
    } catch { /* cookies may be blocked */ }
}

/** Read a cookie by name, or '' if it is not set. */
function getCookie(name) {
    try {
        const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
        return match ? decodeURIComponent(match[1]) : '';
    } catch { return ''; }
}

/* ---------- COUPON / PROMOTIONS ---------- */

/**
 * The coupon a shopper entered, persisted in both a cookie and localStorage
 * so it survives a tab close and is visible to the server during checkout.
 */
export function getCoupon() {
    const fromCookie = getCookie(COUPON_KEY);
    if (fromCookie) return fromCookie;
    try { return localStorage.getItem(COUPON_KEY) || ''; } catch { return ''; }
}

export function setCoupon(code) {
    const c = String(code || '').trim();
    if (c) {
        setCookie(COUPON_KEY, c);
        try { localStorage.setItem(COUPON_KEY, c); } catch {}
    } else {
        clearCoupon();
    }
}

export function clearCoupon() {
    setCookie(COUPON_KEY, '', 0);
    try { localStorage.removeItem(COUPON_KEY); } catch {}
}

/* ---------- WISHLIST server API ---------- */

/**
 * Fire-and-forget call to the server wishlist API. Never throws and never
 * blocks: the localStorage cache is the UI's source of truth between syncs,
 * so a dropped request just means the server catches up on the next sync.
 */
async function apiWishlist(method, body) {
    try {
        await fetch('/api/account/wishlist', {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, guestKey: guestKey() }),
            credentials: 'same-origin',
        });
    } catch { /* server wishlist must never break shopping */ }
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

/* ---------- WISHLIST (server-backed, localStorage-cached) ---------- */

export function getWishlist() {
    try {
        return JSON.parse(localStorage.getItem(WISH_KEY)) || [];
    } catch {
        return [];
    }
}

/**
 * Store the list, and announce it only when it actually changed.
 *
 * The announcement used to be unconditional, which turns any listener that
 * re-reads the wishlist into an endless loop with the writer. The wishlist
 * page was exactly that: it rendered by calling syncWishlistFromServer,
 * which saves what the server returned, which fired this event, which
 * re-rendered the page. Signed in, one open tab made about 470 requests a
 * second to /api/account/wishlist; signed out the sync fails early and never
 * reaches this line, which is why it went unnoticed.
 *
 * Comparing the stored JSON is enough: a sync that changes nothing writes
 * back an identical string, and the badge in the header has no reason to be
 * told about a list it is already showing.
 */
export function saveWishlist(items) {
    const next = JSON.stringify(items);
    const changed = localStorage.getItem(WISH_KEY) !== next;
    localStorage.setItem(WISH_KEY, next);
    if (changed) window.dispatchEvent(new CustomEvent('vayu:wishlist-changed', { detail: items }));
}

/**
 * Whether a product is saved. Accepts the legacy (cat, idx) pair or the
 * stable product id — whichever the caller has. The id match is preferred
 * because cat/idx shifts when a product earlier in the category is deleted.
 */
export function isInWishlist(cat, idx, id) {
    return getWishlist().some(p =>
        (id && p.id ? p.id === id : p.cat === cat && p.idx === idx));
}

/**
 * Toggle a product in/out of the wishlist. Synchronous on the cache (so the
 * heart fills instantly) and fires an async server call alongside it. The
 * server stores by product_id when available, falling back to cat/idx for
 * rows saved before the migration.
 */
export function toggleWishlist(product) {
    const list = getWishlist();
    const existing = list.findIndex(p =>
        (product.id && p.id ? p.id === product.id : p.cat === product.cat && p.idx === product.idx));
    let added = false;
    if (existing > -1) {
        list.splice(existing, 1);
        added = false;
        apiWishlist('DELETE', {
            productId: product.id || null, cat: product.cat, idx: product.idx,
            variantId: product.variant || null,
        });
    } else {
        list.push(product);
        added = true;
        apiWishlist('POST', {
            productId: product.id || null, cat: product.cat, idx: product.idx,
            name: product.name || '', price: String(product.price || ''), img: product.img || '',
            variantId: product.variant || null,
        });
    }
    saveWishlist(list);
    return added;
}

export function removeFromWishlist(cat, idx, id) {
    const list = getWishlist().filter(p =>
        !(id && p.id ? p.id === id : p.cat === cat && p.idx === idx));
    saveWishlist(list);
    apiWishlist('DELETE', { productId: id || null, cat, idx });
    return list;
}

export function getWishlistCount() {
    return getWishlist().length;
}

/**
 * Fetch the wishlist from the server and update the localStorage cache.
 * Called on page load (wishlist page, header badge) so a returning shopper
 * sees what they saved on another device, and a guest sees what they saved
 * before signing in. Returns the server list, or the cache on failure.
 */
export async function syncWishlistFromServer() {
    try {
        const res = await fetch('/api/account/wishlist', {
            credentials: 'same-origin',
            cache: 'no-store',
        });
        if (!res.ok) return getWishlist();
        const data = await res.json();
        const items = (data.items || []).map(item => ({
            id: item.productId,
            cat: item.cat,
            idx: item.idx,
            name: item.name,
            price: item.price,
            img: item.img,
            variant: item.variantId,
            inStock: item.inStock,
            available: item.available,
        }));
        saveWishlist(items);
        return items;
    } catch {
        return getWishlist();
    }
}