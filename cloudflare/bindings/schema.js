/**
 * Vayu — the Cloudflare bindings each Worker needs.
 *
 * One D1 database is shared by all three apps (the storefront reads, the
 * admin reads/writes, the API reads/writes). The R2 bucket for uploads is
 * likewise shared. Auth and payment secrets are bound ONLY to the worker
 * that uses them — this is the isolation boundary.
 *
 * This file is documentation as much as code: it lists every binding the
 * architecture expects, where it is consumed, and whether it is a secret.
 */

/**
 * The bindings every app needs. Bound in each app's wrangler config.
 *
 * @typedef {Object} AppBindings
 * @property {D1Database} DB          — shared, all apps
 * @property {R2Bucket}   UPLOADS     — shared, storefront reads, admin writes
 * @property {Fetcher}    ASSETS      — storefront + admin (Workers Assets)
 */

/**
 * Bindings that exist only on the API worker.
 *
 * @typedef {Object} ApiBindings
 * @property {D1Database} DB
 * @property {R2Bucket}   UPLOADS
 * @property {string} BETTER_AUTH_SECRET       — secret
 * @property {string} PUBLIC_ORIGIN           — var
 * @property {string} ADMIN_ORIGIN            — var
 * @property {string} API_ORIGIN              — var
 * @property {string} [GOOGLE_CLIENT_ID]      — var
 * @property {string} [GOOGLE_CLIENT_SECRET]  — secret
 * @property {string} [RAZORPAY_KEY_ID]       — var (optional, DB fallback)
 * @property {string} [RAZORPAY_KEY_SECRET]   — secret (optional, DB fallback)
 * @property {string} [RAZORPAY_WEBHOOK_SECRET] — secret
 */

/**
 * Bindings that exist only on the admin worker.
 *
 * The admin worker has no payment secrets: it never talks to Razorpay
 * directly. Refunds are issued through the API, which holds the secret.
 *
 * @typedef {Object} AdminBindings
 * @property {D1Database} DB
 * @property {R2Bucket}   UPLOADS
 * @property {Fetcher}    ASSETS
 * @property {string} ADMIN_ORIGIN   — var
 * @property {string} API_ORIGIN     — var (where it sends API requests)
 */

/**
 * Bindings on the storefront worker.
 *
 * @typedef {Object} StorefrontBindings
 * @property {Fetcher} ASSETS
 * @property {string} PUBLIC_ORIGIN  — var
 * @property {string} API_ORIGIN     — var (where it proxies API requests)
 */

/** The secret bindings, for a quick audit. */
export const SECRETS = {
  api: [
    'BETTER_AUTH_SECRET',
    'GOOGLE_CLIENT_SECRET',
    'RAZORPAY_KEY_SECRET',
    'RAZORPAY_WEBHOOK_SECRET',
  ],
  admin: [],
  storefront: [],
};
