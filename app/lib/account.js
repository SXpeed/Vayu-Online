/**
 * Vayu — the storefront's account client.
 *
 * Split across two backends on purpose:
 *
 *   /api/auth/*     Better Auth — signing in, registering, signing out and
 *                   the Google flow. It owns the session cookie.
 *   /api/account/*  Vayu's own endpoints — the address book, order history
 *                   and profile, which are keyed on the customers table.
 *                   /me among them: it reads the Better Auth cookie but
 *                   answers with the customers row, which is the shape the
 *                   storefront actually wants.
 *
 * The server resolves a Better Auth session back to a customers row through
 * user.legacyId (see currentCustomer in server/sessions.js), so the second
 * group keeps working unchanged.
 *
 * The session is an HttpOnly cookie either way: there is no token to hold
 * here, every call carries the browser's own cookie.
 */

const BASE = '/api/account';
const AUTH = '/api/auth';

/**
 * Call an account endpoint. Throws with the server's message on failure,
 * so callers can put `err.message` straight in front of the shopper.
 */
async function call(path, { method = 'GET', body } = {}) {
    const res = await fetch(BASE + path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong');
    return data;
}

/** POST to a Better Auth endpoint, surfacing its message on failure. */
async function authCall(path, body) {
    const res = await fetch(AUTH + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error?.message || 'Something went wrong');
    return data;
}

/**
 * Who is signed in: { signedIn, google, customer? }. Never throws — a
 * shopper with the API down is treated as a guest rather than shown an
 * error. `google` says whether Google sign-in is configured, so the UI
 * only ever offers a button that will work.
 *
 * This asks /api/account/me and nothing else. It used to read Better Auth's
 * /get-session and hand-build a customer out of the session user, which was
 * wrong in two ways that both reached the shopper: `google` was hard-coded
 * true, so the button showed even with Google unconfigured; and the rebuilt
 * customer carried no `details`, `addresses` or `hasPassword`, so the
 * checkout dialog threw on `customer.details.missing` for every signed-in
 * shopper and the account page offered a password change to Google-only
 * accounts. /me resolves the same Better Auth cookie server-side and
 * returns the whole customer, so there is one shape and one source for it.
 */
export async function currentAccount() {
    try {
        const res = await fetch(`${BASE}/me`, { cache: 'no-store' });
        if (res.ok) {
            const data = await res.json();
            return {
                signedIn: !!data.signedIn,
                google: !!data.google,
                customer: data.customer,
            };
        }
    } catch {
        /* treated as a guest below */
    }

    // The API being down must not look like an error to a shopper who was
    // only browsing. Google is claimed unconfigured here rather than
    // configured: a button that cannot work is worse than a missing one.
    return { signedIn: false, google: false };
}

/**
 * Where the "Continue with Google" button points. A full-page navigation,
 * not a fetch: OAuth sends the shopper to Google and back, and `next` is
 * where they land afterwards.
 */
export const googleSignInUrl = (next = location.pathname + location.search) =>
    `${AUTH}/sign-in/social?provider=google&callbackURL=${encodeURIComponent(next)}`;

/**
 * Merge a guest's server-side wishlist onto their new customer account.
 * Called after a successful sign-in or register: the guest_key rows in the
 * `wishlists` table are promoted to the customer_id, de-duplicated against
 * what the customer already had. The localStorage cache is then refreshed
 * from the server so the header badge and wishlist page reflect the merge.
 *
 * Fire-and-forget: a failure here must never block sign-in.
 */
async function mergeGuestWishlist() {
    try {
        const gk = localStorage.getItem('vayu_sid') || '';
        if (!gk) return;
        await fetch(`${BASE}/wishlist/merge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guestKey: gk }),
            credentials: 'same-origin',
        });
        // Pull the merged wishlist back and update the cache + badge.
        const res = await fetch(`${BASE}/wishlist`, { credentials: 'same-origin', cache: 'no-store' });
        if (res.ok) {
            const data = await res.json();
            const items = (data.items || []).map(i => ({
                id: i.productId, cat: i.cat, idx: i.idx,
                name: i.name, price: i.price, img: i.img, variant: i.variantId,
            }));
            localStorage.setItem('vayu_wishlist', JSON.stringify(items));
            window.dispatchEvent(new CustomEvent('vayu:wishlist-changed', { detail: items }));
        }
    } catch { /* wishlist merge must never block sign-in */ }
}

/** Sign in via Better Auth, then merge the guest wishlist onto the account. */
export async function signIn(email, password) {
    const result = await authCall('/sign-in/email', { email, password });
    await mergeGuestWishlist();
    return result;
}

/**
 * No register() here on purpose. The storefront offers exactly three ways
 * to buy — Google sign-in, email login and guest checkout — and accounts
 * are created by the Google flow, so there is no registration form left
 * to call this from. (Better Auth's /sign-up/email endpoint still exists
 * server-side; only the storefront UI has stopped offering it.)
 */

export const signOut = () => authCall('/sign-out', {});

export const updateProfile = (details) => call('/profile', { method: 'PUT', body: details });

export const changePassword = (current, next) => call('/password', { method: 'POST', body: { current, next } });

export const addAddress = (address) => call('/addresses', { method: 'POST', body: address });

export const updateAddress = (id, address) => call(`/addresses/${id}`, { method: 'PUT', body: address });

export const removeAddress = (id) => call(`/addresses/${id}`, { method: 'DELETE' });

export const myOrders = () => call('/orders');
