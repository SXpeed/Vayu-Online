/**
 * Vayu — reset an admin password.
 *
 * The panel can change a password only from inside the panel, which is no
 * help to the one person who cannot get in. This does it from the outside,
 * using exactly the scrypt parameters app/lib/server/db.js uses, so the row
 * it writes is indistinguishable from one the panel wrote.
 *
 *   node scripts/reset-admin-password.mjs --email=admin@vayu.com
 *   node scripts/reset-admin-password.mjs --email=you@example.com --remote
 *
 * The password is read from stdin rather than taken as an argument, so it
 * does not end up in shell history or in the process list.
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
const email = (args.find(a => a.startsWith('--email=')) || '').slice('--email='.length).trim().toLowerCase();

// Anything outside this set would be interpolated into the SQL below, and
// --command takes no bind parameters. Refusing is simpler than escaping.
if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
    console.error('Usage: node scripts/reset-admin-password.mjs --email=<address> [--remote]');
    process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stderr });
const password = (await rl.question(`New password for ${email}: `)).trim();
rl.close();

if (password.length < 8) {
    console.error('Refusing: the panel requires at least 8 characters.');
    process.exit(1);
}

// wrangler's own JS entry, run by this same node. Going through `npx` would
// mean spawning npx.cmd on Windows, which node refuses to do without a
// shell — and a shell puts the quoting problem straight back. Resolved by
// path, not by specifier: wrangler's `exports` map does not publish its bin.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

/**
 * Run one statement and return wrangler's parsed result rows.
 *
 * Via a file rather than --command: a statement this long passed as a single
 * argument relies on the shell not splitting it on its spaces, which is
 * exactly what cmd.exe does. A file has no quoting rules to get wrong.
 */
function d1(sql) {
    const sqlPath = join(tmpdir(), `vayu-reset-${randomBytes(6).toString('hex')}.sql`);
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

// Checked before writing, not inferred afterwards: an UPDATE that matches
// nothing still succeeds, and wrangler's --file output reports no row count
// to tell the difference by.
if (!d1(`SELECT id FROM admins WHERE email = '${email}';`).length) {
    console.error(`No admin found with the address ${email}. Nothing was changed.`);
    process.exit(1);
}

// Same construction as hashPassword() — a hex salt string used directly as
// the salt, and a 64-byte key. Change one and every existing login breaks.
const salt = randomBytes(16).toString('hex');
const hash = scryptSync(password, salt, 64).toString('hex');

d1(`UPDATE admins SET salt = '${salt}', hash = '${hash}', must_change_password = 0 WHERE email = '${email}';`);

console.error(`Password reset for ${email} (${remote ? 'remote' : 'local'}). Sign in with it now.`);
