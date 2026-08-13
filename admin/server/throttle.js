/**
 * Vayu — brute-force throttle for the two sign-in forms.
 *
 * Counts failures per IP in memory (a restart forgives them, which is the
 * right trade for a single-process store). Both the admin panel and the
 * customer accounts use it, so a limit raised here applies to both.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

/** One independent counter. Two callers must not share a bucket. */
function createThrottle({ windowMs = WINDOW_MS, maxFailures = MAX_FAILURES } = {}) {
  const failures = new Map();

  const ipOf = (req) => req.socket.remoteAddress || '?';

  return {
    /** True when this IP has spent its attempts and must wait. */
    blocked(req) {
      const rec = failures.get(ipOf(req));
      return !!rec && rec.count >= maxFailures && Date.now() - rec.first < windowMs;
    },

    noteFailure(req) {
      const ip = ipOf(req);
      const rec = failures.get(ip) || { count: 0, first: Date.now() };
      if (Date.now() - rec.first > windowMs) { rec.count = 0; rec.first = Date.now(); }
      rec.count += 1;
      failures.set(ip, rec);
    },

    /** A clean sign-in clears the record, so one typo is not held against it. */
    clear(req) {
      failures.delete(ipOf(req));
    },

    get retryAfterMinutes() {
      return Math.round(windowMs / 60000);
    },
  };
}

module.exports = { createThrottle };
