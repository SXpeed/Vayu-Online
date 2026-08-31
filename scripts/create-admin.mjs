/**
 * Vayu — create the FIRST admin, from outside the panel.
 *
 * scripts/reset-admin-password.mjs deliberately refuses when the address it
 * is given has no row ("No admin found ... Nothing was changed"), because
 * silently minting an owner on a typo'd address is worse than failing. That
 * leaves a genuine gap on a database built from migrations alone: `admins`
 * is empty, so there is nobody to sign in as, and the panel is the only
 * place an admin can normally be added. This is the way in.
 *
 *   node scripts/create-admin.mjs --email=you@example.com
 *   node scripts/create-admin.mjs --email=you@example.com --name="Roshni" --remote
 *   node scripts/create-admin.mjs --email=you@example.com --remote --google
 *
 * --google creates an owner with no password at all: they sign in through
 * Cloudflare Access (Google, restricted by the Access policy) and the
 * password form can never admit them.
 *
 * Everything here mirrors scripts/reset-admin-password.mjs: the same scrypt
 * parameters as hashPassword() in shared/database/store.js, the password read
 * from stdin so it stays out of shell history and the process list, and
 * wrangler driven through a temp .sql file rather than --command so cmd.exe
 * never gets a chance to split a long statement on its spaces.
 *
 * The id is minted from the same `meta.seq` counter store.nextId() uses, so
 * the row is indistinguishable from one the panel wrote.
 */

import { scryptSync, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const remote = args.includes('--remote');
// A Google-only owner: no password is set, so the panel's password form can
// never sign them in (verifyPassword refuses an empty hash). They get in
// through Cloudflare Access, which authenticates with Google and enforces
// the domain policy — see adminSessionFromAccess() in services/auth/sessions.js.
const googleOnly = args.includes('--google');
const email = (args.find(a => a.startsWith('--email=')) || '').slice('--email='.length).trim().toLowerCase();
const nameArg = (args.find(a => a.startsWith('--name=')) || '').slice('--name='.length).trim();

// Same guard as the reset script: --command and --file take no bind
// parameters, so anything that reaches the SQL below is interpolated.
// Refusing an odd address is simpler than escaping one.
if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
    console.error('Usage: node scripts/create-admin.mjs --email=<address> [--name=<name>] [--remote] [--google]');
    process.exit(1);
}

// Printable characters only, then single quotes doubled at the point of use.
const name = (nameArg || email.split('@')[0]).replace(/[^\x20-\x7E]/g, '').slice(0, 80);

let password = '';
if (!googleOnly) {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    password = (await rl.question(`Password for the new owner ${email}: `)).trim();
    rl.close();

    if (password.length < 8) {
        console.error('Refusing: the panel requires at least 8 characters.');
        process.exit(1);
    }
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

/** Run one statement and return wrangler's parsed result rows. */
function d1(sql) {
    const sqlPath = join(tmpdir(), `vayu-create-admin-${randomBytes(6).toString('hex')}.sql`);
    writeFileSync(sqlPath, sql, { mode: 0o600 });
    try {
        const out = execFileSync(
            process.execPath,
            [wrangler, 'd1', 'execute', 'vayuindia-db', remote ? '--remote' : '--local', '--file', sqlPath],
            { encoding: 'utf8' },
        );
        const json = out.slice(out.indexOf('['));
        return JSON.parse(json)[0]?.results ?? [];
    } catch (err) {
        console.error('wrangler failed:\n' + (err.stdout || err.message));
        process.exit(1);
    } finally {
        rmSync(sqlPath, { force: true });
    }
}

// Adding a second owner is fine; silently overwriting an existing one is not.
if (d1(`SELECT id FROM admins WHERE email = '${email}';`).length) {
    console.error(`${email} is already an admin. Use scripts/reset-admin-password.mjs to change the password.`);
    process.exit(1);
}

// The same counter store.nextId() bumps. Empty means migration 0011 has not
// been applied here — say so, rather than writing an "adm_undefined".
const seq = d1('UPDATE meta SET seq = seq + 1 WHERE id = 1 RETURNING seq;')[0]?.seq;
if (seq === undefined) {
    console.error('The meta counter row is missing. Apply migrations first:');
    console.error(`\n    npx wrangler d1 migrations apply vayuindia-db ${remote ? '--remote' : '--local'}\n`);
    process.exit(1);
}

// Identical construction to hashPassword(): a hex salt used directly as the
// salt, and a 64-byte key. Change either and the login will not verify.
//
// Both empty for a --google owner. That is not a blank password anyone can
// guess: verifyPassword() returns false outright when either column is
// empty, so the password form cannot admit this account at all, whatever is
// typed into it. The only way in is a verified Access identity.
const salt = googleOnly ? '' : randomBytes(16).toString('hex');
const hash = googleOnly ? '' : scryptSync(password, salt, 64).toString('hex');

// must_change_password = 0: the password was chosen here, not issued by
// someone else, so there is nothing to force a change of on first sign-in.
d1(`INSERT INTO admins (id, email, name, salt, hash, role, must_change_password, created_at)
    VALUES ('adm_${seq}', '${email}', '${name.replace(/'/g, "''")}', '${salt}', '${hash}', 'owner', 0, '${new Date().toISOString()}');`);

console.error(`Created owner adm_${seq} <${email}> (${remote ? 'remote' : 'local'}).`);
if (googleOnly) {
    console.error(`
This owner has NO password and cannot use the sign-in form. They get in only
once Cloudflare Access is configured — ACCESS_TEAM_DOMAIN and ACCESS_AUD in
wrangler.jsonc — with a policy that admits <${email}> over Google.

Until then nobody can sign in as this account. If you need a way in now,
create a second owner without --google.`);
} else {
    console.error('Sign in at /admin with it now.');
}
