/**
 * Vayu — sessions and the two sign-ins, on D1.
 *
 * Admin and customer sessions share one table, told apart by `kind`, and
 * every lookup filters on kind as well as the token so a customer cookie
 * can never resolve to an admin. Both remain HttpOnly cookies holding a
 * random token, revocable server-side.
 *
 * The brute-force throttle is per-isolate rather than global now: a Worker
 * may run in many isolates at once, so this slows an attacker down without
 * being the only thing standing in their way. Cloudflare's own WAF rate
 * limiting is the right tool for a hard cap — see README-cloudflare.md.
 */

import { verifyPassword, hashPassword, randomToken, now } from '#shared/database/store.js';
import { json, ok, parseCookies, clientIp, badRequest, methodNotAllowed } from '#shared/utils/http.js';

export const ADMIN_COOKIE = 'vayu_admin_sid';
export const CUSTOMER_COOKIE = 'vayu_customer_sid';

const ADMIN_TTL = 1000 * 60 * 60 * 24 * 7;        // 7 days
const CUSTOMER_TTL = 1000 * 60 * 60 * 24 * 30;    // 30 days — a shopper is not an admin

/**
 * `Secure` is set for every origin the browser treats as secure — which in
 * production is all of them, since the site is only ever served over https.
 *
 * It cannot be unconditional, though. A browser silently *discards* a Secure
 * cookie sent over plain http, and `vite dev --host` serves the panel on a
 * LAN address. There the sign-in returned 200, the cookie was dropped on the
 * floor, and the redirect to /admin found no session and bounced straight
 * back to the login form — a login that fails with no error to show for it.
 * http://localhost hides the problem, because browsers make it a secure
 * context by exception.
 *
 * Absent or unparseable request info falls back to Secure: this fails
 * closed, so a bug here can only ever be more strict than intended.
 */
const isSecureOrigin = (request) => {
  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return true;
  }
};

const cookieHeader = (name, value, maxAgeSeconds, secure = true) =>
  `${name}=${value}; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;

/* ---------- issuing and reading ---------- */

async function createSession(store, kind, subjectId) {
  const token = randomToken();
  const ttl = kind === 'admin' ? ADMIN_TTL : CUSTOMER_TTL;
  await store.batch([
    store.stmt('DELETE FROM sessions WHERE expires < ?', Date.now()),
    store.stmt(
      'INSERT INTO sessions (token, kind, subject_id, expires, created_at) VALUES (?, ?, ?, ?, ?)',
      token, kind, subjectId, Date.now() + ttl, now(),
    ),
  ]);
  return { token, maxAge: ttl / 1000 };
}

/** The signed-in admin row, or null. */
export async function currentAdmin(store, request) {
  const token = parseCookies(request)[ADMIN_COOKIE];
  if (!token) return null;
  return store.one(
    `SELECT a.* FROM sessions s JOIN admins a ON a.id = s.subject_id
      WHERE s.token = ? AND s.kind = 'admin' AND s.expires > ?`,
    token, Date.now(),
  );
}

/**
 * The signed-in customer row, or null.
 *
 * A customer row is only an *account* if it can be signed into — by
 * password or by Google. A guest row (both null) is just an order history
 * and must never resolve from a session, which is what stops a stale
 * token outliving a revoked account.
 */
/**
 * Who is signed in, as a row from the legacy `customers` table.
 *
 * Better Auth owns sessions now, but the rest of the storefront does not:
 * orders.customer_id, addresses.customer_id and the analytics tables all
 * reference customers.id, and every handler downstream expects that row. So
 * this resolves a Better Auth session back to it through user.legacyId,
 * which migrations/0003_better_auth.sql filled in for exactly this purpose.
 *
 * The old cookie is still honoured underneath, so a shopper who was signed in
 * when this deployed stays signed in until their session lapses rather than
 * being silently logged out mid-checkout.
 */
export async function currentCustomer(store, request, env) {
  // 1. Better Auth
  if (env?.DB) {
    try {
      const { getAuth } = await import('./better-auth.js');
      const session = await getAuth(env).api.getSession({ headers: request.headers });
      const legacyId = session?.user?.legacyId;

      if (legacyId) {
        const row = await store.one('SELECT * FROM customers WHERE id = ?', legacyId);
        if (row) return row;
      }

      // Registered through Better Auth after the migration, so there is no
      // legacy row yet. Create one, because everything downstream — checkout,
      // orders, the address book — is keyed on it.
      if (session?.user?.id) {
        const id = 'cust_' + session.user.id.slice(0, 24);
        await store.run(
          `INSERT OR IGNORE INTO customers (id, email, name, phone, first_seen, last_seen, source, account_created_at)
           VALUES (?, ?, ?, '', ?, ?, 'account', ?)`,
          id, session.user.email, session.user.name || '',
          new Date().toISOString(), new Date().toISOString(), new Date().toISOString(),
        );
        await store.run('UPDATE user SET legacyId = ? WHERE id = ?', id, session.user.id);
        return store.one('SELECT * FROM customers WHERE id = ?', id);
      }
    } catch (err) {
      console.error('[vayu] Better Auth session lookup failed', err);
    }
  }

  // 2. A session issued before the cutover.
  const token = parseCookies(request)[CUSTOMER_COOKIE];
  if (!token) return null;
  return store.one(
    `SELECT c.* FROM sessions s JOIN customers c ON c.id = s.subject_id
      WHERE s.token = ? AND s.kind = 'customer' AND s.expires > ?
        AND (c.hash IS NOT NULL OR c.google_sub IS NOT NULL)`,
    token, Date.now(),
  );
}

async function destroySession(store, request, cookieName, kind) {
  const token = parseCookies(request)[cookieName];
  if (token) await store.run('DELETE FROM sessions WHERE token = ? AND kind = ?', token, kind);
  // The clearing cookie must carry the same attributes as the one it
  // replaces, or the browser treats it as a different cookie and the
  // original survives the sign-out.
  return { 'Set-Cookie': cookieHeader(cookieName, '', 0, isSecureOrigin(request)) };
}

/* ---------- brute-force throttle ---------- */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

/** One independent counter per caller. Lives for the life of the isolate. */
export function createThrottle({ windowMs = WINDOW_MS, maxFailures = MAX_FAILURES } = {}) {
  const failures = new Map();

  return {
    blocked(request) {
      const rec = failures.get(clientIp(request));
      return !!rec && rec.count >= maxFailures && Date.now() - rec.first < windowMs;
    },
    noteFailure(request) {
      const ip = clientIp(request);
      const rec = failures.get(ip) || { count: 0, first: Date.now() };
      if (Date.now() - rec.first > windowMs) { rec.count = 0; rec.first = Date.now(); }
      rec.count += 1;
      failures.set(ip, rec);
    },
    clear(request) { failures.delete(clientIp(request)); },
    get retryAfterMinutes() { return Math.round(windowMs / 60000); },
  };
}

const adminThrottle = createThrottle();

/* ---------- admin routes ---------- */

export async function adminLogin({ store, request, body }) {
  if (adminThrottle.blocked(request)) {
    return json(429, { error: `Too many attempts. Try again in ${adminThrottle.retryAfterMinutes} minutes.` });
  }
  const email = String(body.email || '').toLowerCase().trim();
  const admin = await store.one('SELECT * FROM admins WHERE email = ?', email);
  if (!admin || !verifyPassword(body.password || '', admin.salt, admin.hash)) {
    adminThrottle.noteFailure(request);
    return json(401, { error: 'Invalid email or password' });
  }

  adminThrottle.clear(request);
  const { token, maxAge } = await createSession(store, 'admin', admin.id);
  await store.logActivity(admin.name, 'auth.login', 'Signed in');
  return json(200, {
    ok: true, name: admin.name, mustChangePassword: !!admin.must_change_password,
  }, { 'Set-Cookie': cookieHeader(ADMIN_COOKIE, token, maxAge, isSecureOrigin(request)) });
}

/**
 * POST only. The session cookie is SameSite=Lax, which stops a cross-site
 * POST but deliberately still sends the cookie on a top-level GET navigation
 * — so while this answered to GET, any page an admin visited could sign them
 * out with an <img src="…/api/admin/logout">. That is a nuisance rather than
 * a breach, but it is a state change reachable by a link, which is the one
 * thing a GET is not allowed to be. The panel already calls this with POST
 * (app/admin-ui/admin.js), so nothing had to change to close it.
 */
export async function adminLogout({ store, request, method }) {
  if (method !== 'POST') return methodNotAllowed();
  const headers = await destroySession(store, request, ADMIN_COOKIE, 'admin');
  return json(200, { ok: true }, headers);
}

export function adminMe({ admin }) {
  return json(200, {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role || 'owner',
    mustChangePassword: !!admin.must_change_password,
  });
}

export async function adminChangePassword({ store, admin, body }) {
  if (!verifyPassword(body.current || '', admin.salt, admin.hash)) {
    return badRequest('Current password is incorrect');
  }
  if (String(body.next || '').length < 8) {
    return badRequest('New password must be at least 8 characters');
  }
  const { salt, hash } = hashPassword(body.next);
  await store.update('admins', 'id', admin.id, { salt, hash, must_change_password: 0 });
  await store.logActivity(admin.name, 'auth.password', 'Changed password');
  return ok();
}

/* ---------- the role gate ---------- */

// owner   — everything, including team, settings and backups
// manager — everything except those three
// staff   — day-to-day only: orders, customers, outbox, analytics
const RANK = { staff: 0, manager: 1, owner: 2 };

/**
 * Returns null when `admin` may use a route needing `required`, or the
 * error to send back when they may not.
 */
export function roleError(admin, required) {
  if (!required) return null;
  if (RANK[admin.role || 'owner'] >= RANK[required]) return null;
  return required === 'owner'
    ? { status: 403, error: 'Only the owner can do this' }
    : { status: 403, error: 'Your role does not allow this' };
}

/* ---------- customer session helpers used by accounts.js ---------- */

export const customerSession = (store, customerId) => createSession(store, 'customer', customerId);
/** `request` is optional; without it the cookie stays Secure (fails closed). */
export const customerCookie = (token, maxAge, request) =>
  cookieHeader(CUSTOMER_COOKIE, token, maxAge, request ? isSecureOrigin(request) : true);
export const clearCustomerCookie = (store, request) => destroySession(store, request, CUSTOMER_COOKIE, 'customer');
