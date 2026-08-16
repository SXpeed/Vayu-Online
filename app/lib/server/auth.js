/**
 * Vayu — Better Auth on D1.
 *
 * Replaces the hand-rolled session and password code that lived in
 * server/sessions.js and server/accounts.js. Two things about this migration
 * are worth understanding before changing anything here.
 *
 * ---------------------------------------------------------------------
 * 1. Existing passwords keep working
 *
 * The site has real customers and real admins whose passwords were hashed by
 * the old code as scrypt(password, salt, 64) hex, with the salt kept in its
 * own column. Better Auth stores a single string in `account.password` and
 * has its own hashing. If we simply switched, every existing person would be
 * locked out.
 *
 * So `verify` below understands both formats. A legacy hash is stored as
 * "legacy$<salt>$<hash>" when the rows are backfilled (see
 * migrations/0003_better_auth.sql), and verifying one runs exactly the old
 * scrypt comparison. On the next successful sign-in the hook at the bottom
 * rewrites that row with a current hash, so the legacy format drains away by
 * itself and nobody is ever asked to reset anything.
 *
 * ---------------------------------------------------------------------
 * 2. It is instantiated per request, not once
 *
 * D1 arrives on `env`, which only exists inside a request on Workers. A
 * module-scope betterAuth() would capture nothing. `getAuth(env)` builds it
 * per request and memoises against the binding, so a warm isolate serving the
 * same environment reuses the instance.
 */

import { betterAuth } from 'better-auth';
import { Kysely } from 'kysely';
import { D1Dialect } from 'kysely-d1';
import { scryptSync, timingSafeEqual } from 'node:crypto';

const LEGACY_PREFIX = 'legacy$';

/**
 * The old scheme, kept byte-for-byte: scrypt with default parameters and a
 * 64-byte derived key, compared in constant time. Changing any of this
 * invalidates every password that has not been rehashed yet.
 */
function verifyLegacy(password, stored) {
    const [, salt, hash] = stored.split('$');
    if (!salt || !hash) return false;

    const test = scryptSync(String(password), salt, 64).toString('hex');
    const a = Buffer.from(test, 'hex');
    const b = Buffer.from(hash, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
}

/** Roles the panel already understands, in rank order. */
export const ROLES = ['staff', 'manager', 'owner'];

let cached = null;
let cachedFor = null;

export function getAuth(env) {
    if (cached && cachedFor === env.DB) return cached;

    const db = new Kysely({ dialect: new D1Dialect({ database: env.DB }) });

    const auth = betterAuth({
        database: { db, type: 'sqlite' },
        secret: env.BETTER_AUTH_SECRET,
        baseURL: env.PUBLIC_ORIGIN || undefined,

        emailAndPassword: {
            enabled: true,
            minPasswordLength: 8,
            password: {
                /**
                 * New and rehashed passwords use Better Auth's own scheme;
                 * only reading has to understand the old one.
                 */
                async hash(password) {
                    const { hashPassword } = await import('better-auth/crypto');
                    return hashPassword(password);
                },
                async verify({ hash, password }) {
                    if (hash?.startsWith(LEGACY_PREFIX)) return verifyLegacy(password, hash);
                    const { verifyPassword } = await import('better-auth/crypto');
                    return verifyPassword({ hash, password });
                },
            },
        },

        socialProviders: env.GOOGLE_CLIENT_ID
            ? {
                google: {
                    clientId: env.GOOGLE_CLIENT_ID,
                    clientSecret: env.GOOGLE_CLIENT_SECRET,
                },
            }
            : undefined,

        session: {
            // 30 days for a shopper, matching CUSTOMER_TTL in the old
            // sessions.js. Admin sessions are shortened in the hook below.
            expiresIn: 60 * 60 * 24 * 30,
            updateAge: 60 * 60 * 24,
        },

        advanced: {
            cookiePrefix: 'vayu',
            useSecureCookies: true,
            defaultCookieAttributes: { sameSite: 'lax', httpOnly: true, path: '/' },
        },

        user: {
            additionalFields: {
                // The storefront's own columns, carried across so the account
                // page and checkout keep reading one row.
                phone: { type: 'string', required: false },
                role: { type: 'string', required: false, input: false },
                legacyId: { type: 'string', required: false, input: false },
            },
        },

        /**
         * No admin plugin. It exists for user management (ban, impersonate,
         * list) that this panel does not use, and its adminRoles option
         * requires roles declared through better-auth's access-control
         * system. The site already ranks staff < manager < owner in
         * server/sessions.js roleError(), which reads the `role` field
         * declared above — one rank check, not two that can disagree.
         */

        databaseHooks: {
            session: {
                create: {
                    /**
                     * The old code gave admins a 7-day session and shoppers 30
                     * days, on the grounds that an admin session is worth far
                     * more if it leaks. Better Auth has one global lifetime, so
                     * the shorter one is applied here per session.
                     */
                    async before(session, ctx) {
                        const role = ctx?.context?.session?.user?.role;
                        if (!role || !ROLES.includes(role)) return;

                        const sevenDays = 1000 * 60 * 60 * 24 * 7;
                        return { data: { ...session, expiresAt: new Date(Date.now() + sevenDays) } };
                    },
                },
            },
        },
    });

    cached = auth;
    cachedFor = env.DB;
    return auth;
}

/**
 * Upgrade a legacy hash after a successful sign-in.
 *
 * Better Auth's verify hook is deliberately read-only — it has no database
 * handle — so the rewrite happens here, called from the sign-in route once
 * the credentials have already been accepted. Failure is swallowed: the
 * person is signed in either way, and the row will simply be upgraded on
 * their next visit instead.
 */
export async function upgradeLegacyPassword(env, userId, plaintext) {
    try {
        const row = await env.DB
            .prepare("SELECT id, password FROM account WHERE userId = ? AND providerId = 'credential'")
            .bind(userId)
            .first();

        if (!row?.password?.startsWith(LEGACY_PREFIX)) return false;

        const { hashPassword } = await import('better-auth/crypto');
        const fresh = await hashPassword(plaintext);

        await env.DB
            .prepare('UPDATE account SET password = ?, updatedAt = ? WHERE id = ?')
            .bind(fresh, new Date().toISOString(), row.id)
            .run();

        return true;
    } catch (err) {
        console.error('[vayu] password upgrade failed for', userId, err);
        return false;
    }
}

export const isLegacyHash = (hash) => Boolean(hash?.startsWith(LEGACY_PREFIX));
