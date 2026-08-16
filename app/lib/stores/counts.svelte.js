/**
 * Vayu — the cart and wishlist badge counts in the header.
 *
 * js/script.js read these straight out of localStorage and wrote the numbers
 * into the badge elements by hand, re-running on three different events. They
 * are runes now, so the header re-renders itself and the wiring is one
 * subscribe() call at mount.
 *
 * localStorage is not available while a page is being prerendered, so both
 * start at zero and are filled in on the client.
 */

const CART_KEY = 'vayu_cart';
const WISH_KEY = 'vayu_wishlist';

const read = (key) => {
    try {
        return JSON.parse(localStorage.getItem(key)) || [];
    } catch {
        return [];
    }
};

export const counts = $state({ cart: 0, wish: 0 });

export function refreshCounts() {
    counts.cart = read(CART_KEY).reduce((n, p) => n + (p.qty || 1), 0);
    counts.wish = read(WISH_KEY).length;
}

/**
 * Keep the badges in step with this tab, other tabs, and — importantly — a
 * prerendered page being activated: it reads localStorage while still hidden,
 * so anything added on the page the visitor is actually looking at would be
 * missing from the count without the prerenderingchange listener.
 */
export function watchCounts() {
    refreshCounts();

    const events = ['vayu:cart-changed', 'vayu:wishlist-changed', 'storage'];
    for (const name of events) window.addEventListener(name, refreshCounts);

    if (document.prerendering) {
        document.addEventListener('prerenderingchange', refreshCounts, { once: true });
    }

    return () => {
        for (const name of events) window.removeEventListener(name, refreshCounts);
    };
}

export const cartCount = () => counts.cart;
export const wishCount = () => counts.wish;
