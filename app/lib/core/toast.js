/**
 * Vayu — the small confirmation that slides up after an add-to-cart or a
 * wishlist toggle.
 *
 * There used to be three copies of this: one in js/script.js, one in the
 * product page's inline module and one in the wishlist page's — because
 * each ran in its own script scope and none of them could import. One
 * module now, and `window.showToast` is still published for the handful of
 * callers that reach for it by name.
 */

export function showToast(message) {
    let toast = document.getElementById('vayuToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'vayuToast';
        toast.className = 'vayu-toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toast._hide);
    toast._hide = setTimeout(() => toast.classList.remove('is-visible'), 2200);
}

// Guarded: this module is reachable from prerendering, which runs in Node.
if (typeof window !== 'undefined') window.showToast = showToast;
