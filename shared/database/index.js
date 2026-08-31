/**
 * Vayu — shared database client.
 *
 * One barrel that re-exports the D1 `Store` and its value helpers, so the
 * rest of the codebase imports from a single `#shared/database` entry
 * point regardless of which file a helper lives in. The `Store` itself is
 * the single shared connection: every app and every service receives the
 * same D1 binding (`env.DB`) and wraps it the same way via
 * cloudflare/bindings — there is no second database client.
 */

export { Store, sqlValue, bool, now, today,
  formatPrice, parsePrice, normPhone,
  hashPassword, verifyPassword, randomToken,
} from './store.js';

/** Vayu shared database — re-exports the Store and value helpers. */
export {
  Store,
  sqlValue,
  bool,
  now,
  today,
  formatPrice,
  parsePrice,
  normPhone,
  hashPassword,
  verifyPassword,
  randomToken,
} from './store.js';
