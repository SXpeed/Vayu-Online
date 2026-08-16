/**
 * Vayu — the storefront's account client.
 *
 * Split across two backends on purpose:
 *
 *   /api/auth/*     Better Auth — signing in, registering, signing out and
 *                   the Google flow. It owns the session cookie.
 *   /api/account/*  Vayu's own endpoints — the address book, order history
 *                   and profile, which are keyed on the customers table and
 *                   have nothing to do with authentication.
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
 */
export async function currentAccount() {
    try {
        const res = await fetch(`${AUTH}/get-session`, { cache: 'no-store' });
        const session = res.ok ? await res.json() : null;

        if (session?.user) {
            // Shaped like the old /me response so the account page and the
            // checkout dialog did not have to change.
            return {
                signedIn: true,
                google: true,
                customer: {
                    id: session.user.legacyId || session.user.id,
                    name: session.user.name || '',
                    email: session.user.email,
                    phone: session.user.phone || '',
                    picture: session.user.image || null,
                },
            };
        }
    } catch {
        /* treated as a guest below */
    }

    // The API being down must not look like an error to a shopper who was
    // only browsing.
    return { signedIn: false, google: true };
}

/**
 * Where the "Continue with Google" button points. A full-page navigation,
 * not a fetch: OAuth sends the shopper to Google and back, and `next` is
 * where they land afterwards.
 */
export const googleSignInUrl = (next = location.pathname + location.search) =>
    `${AUTH}/sign-in/social?provider=google&callbackURL=${encodeURIComponent(next)}`;

/** Better Auth returns its own error shape; `call` normalises it. */
export const signIn = (email, password) =>
    authCall('/sign-in/email', { email, password });

export const register = (details) =>
    authCall('/sign-up/email', {
        email: details.email,
        password: details.password,
        name: details.name || '',
    });

export const signOut = () => authCall('/sign-out', {});

export const updateProfile = (details) => call('/profile', { method: 'PUT', body: details });

export const changePassword = (current, next) => call('/password', { method: 'POST', body: { current, next } });

export const addAddress = (address) => call('/addresses', { method: 'POST', body: address });

export const updateAddress = (id, address) => call(`/addresses/${id}`, { method: 'PUT', body: address });

export const removeAddress = (id) => call(`/addresses/${id}`, { method: 'DELETE' });

export const myOrders = () => call('/orders');
