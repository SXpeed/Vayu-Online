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
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const remote = args.includes('--remote');
const email = (args.find(a => a.startsWith('--email=')) || '').slice('--email='.length).trim().toLowerCase();
const nameArg = (args.find(a => a.startsWith('--name=')) || '').slice('--name='.length).trim();

// Same guard as the reset script: --command and --file take no bind
// parameters, so anything that reaches the SQL below is interpolated.
// Refusing an odd address is simpler than escaping one.
if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
    console.error('Usage: node scripts/create-admin.mjs --email=<address> [--name=<name>] [--remote]');
    process.exit(1);
}

// Printable characters only, then single quotes doubled at the point of use.
const name = (nameArg || email.split('@')[0]).replace(/[^\x20-\x7E]/g, '').slice(0, 80);

const rl = createInterface({ input: process.stdin, output: process.stderr });
const password = (await rl.question(`Password for the new owner ${email}: `)).trim();
rl.close();

if (password.length < 8) {
    console.error('Refusing: the panel requires at least 8 characters.');
    process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

/**
 * Run one statement and return wrangler's parsed result rows.
 *
 * --command, NOT --file, and that is load-bearing. Given --file, wrangler
 * does not return the rows a SELECT matched; it returns a run summary:
 *
 *     [{ results: [{ "Total queries executed": 1, "Rows read": 0, ... }] }]
 *
 * One object, always, however many rows matched. Every caller below reads
 * that array, so with --file the duplicate check saw length 1 for an address
 * that did not exist and this script refused to create ANY admin, on any
 * database, with "<email> is already an admin". A fresh deployment could not
 * be given its first owner at all, and the message pointed at the one script
 * that cannot help: reset-admin-password refuses an address with no row.
 * (--json does not change this. The shape is the same.)
 *
 * The comment that used to be here said --file existed so cmd.exe could not
 * split a long statement on its spaces. That was guarding against nothing:
 * execFileSync spawns node directly with an argv array and no shell, so no
 * command line is ever parsed. Verified with a statement full of spaces.
 */
function d1(sql) {
    let out;
    try {
        out = execFileSync(
            process.execPath,
            [wrangler, 'd1', 'execute', 'vayuindia-db', remote ? '--remote' : '--local', '--command', sql],
            { encoding: 'utf8' },
        );
    } catch (err) {
        console.error('wrangler failed:\n' + (err.stdout || err.message));
        process.exit(1);
    }

    let rows;
    try {
        rows = JSON.parse(out.slice(out.indexOf('[')))[0]?.results ?? [];
    } catch {
        console.error('Could not read wrangler output:\n' + out);
        process.exit(1);
    }

    // Fail loudly rather than misread a summary as a row, should a future
    // wrangler return one here too. Reading it silently is the bug above.
    if (rows.some(r => r && Object.hasOwn(r, 'Total queries executed'))) {
        console.error('wrangler returned a run summary instead of rows — cannot verify state safely.');
        process.exit(1);
    }
    return rows;
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
const salt = randomBytes(16).toString('hex');
const hash = scryptSync(password, salt, 64).toString('hex');

// must_change_password = 0: the password was chosen here, not issued by
// someone else, so there is nothing to force a change of on first sign-in.
d1(`INSERT INTO admins (id, email, name, salt, hash, role, must_change_password, created_at)
    VALUES ('adm_${seq}', '${email}', '${name.replace(/'/g, "''")}', '${salt}', '${hash}', 'owner', 0, '${new Date().toISOString()}');`);

console.error(`Created owner adm_${seq} <${email}> (${remote ? 'remote' : 'local'}). Sign in at /admin with it now.`);
