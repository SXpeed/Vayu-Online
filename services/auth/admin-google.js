/**
 * Vayu — signing in to the admin panel with Google.
 *
 * The panel had one door: an email and a password, on the open internet,
 * behind a throttle that is per-isolate and therefore not a cap at all (see
 * createThrottle in sessions.js). This replaces the guessable secret with an
 * identity Google has already proved, and adds the question a password never
 * asked — *should this person be an admin here?*
 *
 * THE THREE ANSWERS
 *
 *   1. The table is empty. The first person through becomes the owner, but
 *      only if their address is in BOOTSTRAP_DOMAIN. That window is the one
 *      genuinely dangerous moment in this design — for exactly as long as
 *      `admins` has no rows, signing in creates one — so it is fenced by the
 *      domain and it closes permanently the instant the first row exists.
 *   2. They already have a row and it is active. Ordinary sign-in.
 *   3. Anything else. A row is written as `pending` and they are turned
 *      away. An owner approves or removes them from Team. Note this is the
 *      case for ANY domain: after the first owner exists, being at
 *      viveksahnidesign.com earns nothing on its own.
 *
 * WHY THE PROVIDER CHECK IS THE LOAD-BEARING LINE
 *
 * Better Auth has email-and-password registration enabled and no email
 * verification, so anyone may register an account claiming ANY address —
 * including one already in `admins` — and never prove they own it. Trusting
 * "a signed-in Better Auth user whose email matches an admin" would hand the
 * panel to whoever registers the address first. So the account row must
 * carry providerId 'google': Google is the only party here that has actually
 * checked who owns the mailbox.
 *
 * That is also why linking matters. `accountLinking.trustedProviders`
 * includes google, so a Google sign-in attaches to a pre-existing password
 * account with the same address. Requiring the google row means the attacker
 * who squats the address still cannot sign in as an admin; it does not undo
 * the squat, which is why enabling email verification is still worth doing.
 */

import { now } from '#shared/database/store.js';

/**
 * Who may claim the empty table. A var rather than a constant so a different
 * shop is a config change, and lowercased on both sides so the comparison
 * cannot fail on a capital letter someone typed into the dashboard.
 */
export const bootstrapDomain = (env) =>
  String(env?.ADMIN_BOOTSTRAP_DOMAIN || '').trim().toLowerCase().replace(/^@/, '');

/** Whether `email` sits in `domain`, matched on the last label only. */
export function emailInDomain(email, domain) {
  if (!domain) return false;
  const at = String(email).lastIndexOf('@');
  return at !== -1 && String(email).slice(at + 1).toLowerCase() === domain;
}

/**
 * Resolve a Google sign-in to an admin.
 *
 * Returns one of:
 *   { ok: true,  admin, bootstrapped }   sign them in
 *   { ok: false, reason }                do not, and say why
 *
 * `reason` is for the sign-in page to phrase, not for the caller to act on:
 * 'no-session' | 'not-google' | 'no-email' | 'domain' | 'pending' | 'requested'
 */
export async function resolveGoogleAdmin(env, store, request) {
  let session;
  try {
    const { getAuth } = await import('./better-auth.js');
    session = await getAuth(env).api.getSession({ headers: request.headers });
  } catch (err) {
    console.error('[vayu] admin google: session lookup failed', err);
    return { ok: false, reason: 'no-session' };
  }

  const userId = session?.user?.id;
  const email = String(session?.user?.email || '').toLowerCase().trim();
  if (!userId) return { ok: false, reason: 'no-session' };
  if (!email) return { ok: false, reason: 'no-email' };

  // THE check. See the header: a Better Auth session on its own proves only
  // that somebody typed this address into a registration form.
  const viaGoogle = await store.one(
    `SELECT id FROM account WHERE userId = ? AND providerId = 'google'`,
    userId,
  );
  if (!viaGoogle) return { ok: false, reason: 'not-google' };

  const existing = await store.one('SELECT * FROM admins WHERE email = ?', email);
  if (existing) {
    if (existing.status !== 'active') return { ok: false, reason: 'pending' };
    return { ok: true, admin: existing, bootstrapped: false };
  }

  const name = String(session.user.name || email.split('@')[0]).slice(0, 80);
  const count = await store.value('SELECT COUNT(*) FROM admins');

  // 1. The empty table. First in, and only from the bootstrap domain.
  if (!count) {
    if (!emailInDomain(email, bootstrapDomain(env))) {
      return { ok: false, reason: 'domain' };
    }
    const admin = await insertAdmin(store, { email, name, role: 'owner', status: 'active' });
    await store.logActivity(name, 'team.add', `${email} claimed the empty panel as owner`);
    return { ok: true, admin, bootstrapped: true };
  }

  // 3. Everyone else waits. 'staff' is the floor, so approving is a
  //    deliberate promotion rather than the absence of a demotion.
  const pending = await insertAdmin(store, { email, name, role: 'staff', status: 'pending' });
  await store.logActivity(name, 'team.request', `${email} asked for access`);
  return { ok: false, reason: 'requested', admin: pending };
}

/**
 * Write an admin row with no password.
 *
 * salt and hash are '' rather than null because the columns are NOT NULL
 * (migration 0001), and empty is the value verifyPassword() refuses outright
 * — so this row cannot be signed into with any password whatsoever.
 */
async function insertAdmin(store, { email, name, role, status }) {
  const id = await store.nextId('adm');
  const created_at = now();
  await store.run(
    `INSERT INTO admins (id, email, name, salt, hash, role, must_change_password, created_at, status, auth_provider)
     VALUES (?, ?, ?, '', '', ?, 0, ?, ?, 'google')`,
    id, email, name, role, created_at, status,
  );
  return { id, email, name, role, status, auth_provider: 'google', created_at, salt: '', hash: '' };
}

/** What the sign-in page tells someone who was turned away. */
export function refusalMessage(reason, env) {
  switch (reason) {
    case 'domain':
      return `The panel has no owner yet, and only a @${bootstrapDomain(env)} address can claim it.`;
    case 'requested':
      return 'Access requested. An owner has to approve you before you can sign in.';
    case 'pending':
      return 'Your access is still waiting for an owner to approve it.';
    case 'not-google':
      return 'Sign in with Google to reach the panel.';
    default:
      return 'Sign-in failed. Try again.';
  }
}
