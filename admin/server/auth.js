/**
 * Vayu admin — sessions, sign-in and the role gate.
 *
 * Sessions are random tokens held in db.json against an admin id, handed
 * out as an HttpOnly cookie, so they survive a restart and can be revoked
 * server-side (removing a team member drops their sessions immediately).
 */

const crypto = require('node:crypto');
const store = require('./db');
const { sendJson, parseCookies } = require('./http');
const { createThrottle } = require('./throttle');

const SESSION_COOKIE = 'vayu_admin_sid';
const SESSION_TTL = 1000 * 60 * 60 * 24 * 7; // 7 days

/* ---------- sessions ---------- */

function pruneSessions() {
  const now = Date.now();
  for (const [tok, s] of Object.entries(store.db.sessions)) {
    if (s.expires < now) delete store.db.sessions[tok];
  }
}

function currentAdmin(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const sess = store.db.sessions[token];
  if (!sess || sess.expires < Date.now()) return null;
  return store.db.admins.find(a => a.id === sess.adminId) || null;
}

function createSession(res, adminId) {
  pruneSessions();
  const token = crypto.randomBytes(32).toString('hex');
  store.db.sessions[token] = { adminId, expires: Date.now() + SESSION_TTL };
  store.save();
  res.setHeader('Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL / 1000}`);
}

function destroySession(req, res) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) delete store.db.sessions[token];
  store.save();
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

/* ---------- routes ---------- */

const throttle = createThrottle();

function login({ req, res, body }) {
  if (throttle.blocked(req)) {
    return sendJson(res, 429, { error: `Too many attempts. Try again in ${throttle.retryAfterMinutes} minutes.` });
  }
  const email = String(body.email || '').toLowerCase().trim();
  const admin = store.db.admins.find(a => a.email === email);
  if (!admin || !store.verifyPassword(body.password || '', admin.salt, admin.hash)) {
    throttle.noteFailure(req);
    return sendJson(res, 401, { error: 'Invalid email or password' });
  }
  throttle.clear(req);
  createSession(res, admin.id);
  store.logActivity(admin.name, 'auth.login', 'Signed in');
  store.save();
  sendJson(res, 200, { ok: true, name: admin.name, mustChangePassword: !!admin.mustChangePassword });
}

function logout({ req, res }) {
  destroySession(req, res);
  sendJson(res, 200, { ok: true });
}

function me({ res, admin }) {
  sendJson(res, 200, {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role || 'owner',
    mustChangePassword: !!admin.mustChangePassword,
  });
}

function changePassword({ res, admin, body }) {
  if (!store.verifyPassword(body.current || '', admin.salt, admin.hash)) {
    return sendJson(res, 400, { error: 'Current password is incorrect' });
  }
  if (String(body.next || '').length < 8) {
    return sendJson(res, 400, { error: 'New password must be at least 8 characters' });
  }
  Object.assign(admin, store.hashPassword(body.next), { mustChangePassword: false });
  store.logActivity(admin.name, 'auth.password', 'Changed password');
  store.save();
  sendJson(res, 200, { ok: true });
}

/* ---------- role gate ---------- */

// owner   — everything, including team, settings and backups
// manager — everything except those three
// staff   — day-to-day only: orders, customers, outbox, analytics
const RANK = { staff: 0, manager: 1, owner: 2 };

/**
 * Returns null when `admin` may use a route needing `required`, or the
 * error to send back when they may not.
 */
function roleError(admin, required) {
  if (!required) return null;
  if (RANK[admin.role || 'owner'] >= RANK[required]) return null;
  return required === 'owner'
    ? { status: 403, error: 'Only the owner can do this' }
    : { status: 403, error: 'Your role does not allow this' };
}

module.exports = { currentAdmin, roleError, login, logout, me, changePassword };
