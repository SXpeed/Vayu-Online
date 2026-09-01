/**
 * Vayu — shared business constants.
 *
 * Pulled out of the service modules that declared them inline so there is
 * one source for role ranks, status lists and cookie names. The values are
 * identical to what each module used before the refactor.
 */

/* ---------- auth roles ---------- */

/** Roles the admin panel understands, in rank order. */
export const ROLES = ['staff', 'manager', 'owner'];

/** Numeric rank for role comparison: staff < manager < owner. */
export const RANK = { staff: 0, manager: 1, owner: 2 };

/* ---------- session cookies ---------- */

/** Admin session cookie — host-only, HttpOnly, Secure. */
export const ADMIN_COOKIE = 'vayu_admin_sid';

/** Customer session cookie — host-only, HttpOnly, Secure. */
export const CUSTOMER_COOKIE = 'vayu_customer_sid';

/** OAuth state cookie for the Google sign-in flow. */
export const OAUTH_STATE_COOKIE = 'vayu_oauth_state';

/** Session lifetimes in milliseconds. Admins get the shorter one. */
export const ADMIN_TTL_MS = 1000 * 60 * 60 * 24 * 7;       // 7 days
export const CUSTOMER_TTL_MS = 1000 * 60 * 60 * 24 * 30;   // 30 days

/* ---------- shipping ---------- */

/**
 * What shipping costs before the shop has said otherwise.
 *
 * These are the fallbacks store.settings() fills a missing settings row
 * with, and they are ALSO what the cart shows until /api/catalogue answers.
 * Both sides read them from here because they were previously written out
 * twice — 5000 and 150 in store.settings(), and the same two numbers typed
 * into pages/cart.js — which is why editing them in the admin panel changed
 * what a customer was charged without changing what the cart page told them.
 */
export const SHIPPING_DEFAULTS = {
    freeAbove: 5000,
    flat: 150,
};

/* ---------- order + product statuses ---------- */

export const ORDER_STATUSES = ['new', 'processing', 'shipped', 'delivered', 'cancelled'];

export const PRODUCT_STATUSES = ['active', 'draft', 'archived'];

/** Statuses that warrant a customer email when an order transitions to them. */
export const EMAIL_ORDER_STATUSES = ['processing', 'shipped', 'delivered', 'cancelled'];

/* ---------- analytics ---------- */

/** Keep the newest N rows of these append-only logs. */
export const SEARCH_LOG_CAP = 500;
export const ACTIVITY_LOG_CAP = 500;

/** Pending Razorpay order TTL in milliseconds (1 hour). */
export const PENDING_TTL_MS = 60 * 60 * 1000;
