/**
 * Vayu — shared database client.
 *
 * One handle, one connection. Every service receives the same `Store`
 * instance from the app's dispatcher (built once per request from the D1
 * binding on `env.DB`), so there is exactly one database connection per
 * request regardless of how many services a route touches.
 *
 * Re-exports the `Store` class and the value helpers from
 * shared/database/store.js — the original module — under the path the
 * services import from.
 */

export { Store, sqlValue, bool, now, today,
         formatPrice, parsePrice, normPhone,
         hashPassword, verifyPassword, randomToken,
} from '#shared/database/store.js';
