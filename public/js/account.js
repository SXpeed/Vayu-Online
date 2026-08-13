/**
 * Vayu — the storefront's client for /api/account/*.
 *
 * One place that knows the account endpoints, shared by the checkout
 * dialog (js/checkout.js) and the account page. The session is an
 * HttpOnly cookie, so there is no token to hold here: every call simply
 * carries the browser's own cookie and the server decides who is asking.
 */

const BASE = '/api/account';

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

/**
 * Who is signed in: { signedIn, google, customer? }. Never throws — a
 * shopper with the API down is treated as a guest rather than shown an
 * error. `google` says whether Google sign-in is configured, so the UI
 * only ever offers a button that will work.
 */
export async function currentAccount() {
    try {
        return await call('/me');
    } catch {
        return { signedIn: false, google: false };
    }
}

/**
 * Where the "Continue with Google" button points. A full-page navigation,
 * not a fetch: OAuth sends the shopper to Google and back, and `next` is
 * where they land afterwards.
 */
export const googleSignInUrl = (next = location.pathname + location.search) =>
    `${BASE}/google?next=${encodeURIComponent(next)}`;

export const signIn = (email, password) => call('/login', { method: 'POST', body: { email, password } });

export const register = (details) => call('/register', { method: 'POST', body: details });

export const signOut = () => call('/logout', { method: 'POST' });

export const updateProfile = (details) => call('/profile', { method: 'PUT', body: details });

export const changePassword = (current, next) => call('/password', { method: 'POST', body: { current, next } });

export const addAddress = (address) => call('/addresses', { method: 'POST', body: address });

export const updateAddress = (id, address) => call(`/addresses/${id}`, { method: 'PUT', body: address });

export const removeAddress = (id) => call(`/addresses/${id}`, { method: 'DELETE' });

export const myOrders = () => call('/orders');
