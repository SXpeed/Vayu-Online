/**
 * Vayu — refuse to deploy code that is ahead of the database.
 *
 * The catalogue outage that prompted this script had a single cause: five
 * migrations were applied locally and none of them remotely, then the Worker
 * was deployed anyway. `npm run deploy` was `build && wrangler deploy` — it
 * had no idea the schema existed. So production ran code that queried
 * `product_specs` and `shipping_presets` against a database with neither,
 * every /api/catalogue read threw, and the shop fell back to stale static
 * products that could not be bought.
 *
 * Nothing about that was detectable from the deploy output; it succeeded.
 * This is the check that would have stopped it, wired in front of
 * `wrangler deploy` so the ordering is enforced rather than remembered:
 * schema first, code second.
 *
 *   node scripts/check-migrations.mjs              block if remote is behind
 *   node scripts/check-migrations.mjs --local      same, against the local DB
 *
 * Read-only: it lists, it never applies. Applying to production stays a
 * deliberate act.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DB = 'vayuindia-db';
const target = process.argv.includes('--local') ? '--local' : '--remote';

// Run wrangler's entry script on this Node rather than shelling out to `npx`,
// exactly as scripts/build.mjs runs vite. Spawning `npx.cmd` without a shell
// is an EINVAL on Windows, and turning the shell on to fix that would mean
// quoting arguments for cmd.exe instead.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wranglerBin = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

if (!existsSync(wranglerBin)) {
    console.error('migration check: wrangler is not installed — run `npm install` first.');
    process.exit(1);
}

const result = spawnSync(
    process.execPath,
    [wranglerBin, 'd1', 'migrations', 'list', DB, target],
    { encoding: 'utf8', cwd: root },
);

if (result.error) {
    console.error(`migration check: could not run wrangler — ${result.error.message}`);
    process.exit(1);
}

const output = `${result.stdout || ''}${result.stderr || ''}`;

// Wrangler says "No migrations to apply!" when the database is current, and
// otherwise prints a table of filenames. Matching the .sql names rather than
// the box-drawing characters keeps this robust to table formatting changes.
if (/No migrations to apply/i.test(output)) {
    console.log(`migration check: ${target.slice(2)} database is up to date`);
    process.exit(0);
}

const pending = [...output.matchAll(/(\d{4}_[A-Za-z0-9_-]+\.sql)/g)].map(m => m[1]);

if (!pending.length) {
    // Neither "up to date" nor a readable list — usually an auth or network
    // failure. Fail closed: an unverified schema is not a verified one.
    console.error('migration check: could not read migration status. Raw output:\n');
    console.error(output.trim());
    process.exit(1);
}

console.error(`\nDEPLOY BLOCKED — the ${target.slice(2)} database is ${pending.length} migration(s) behind:\n`);
for (const name of pending) console.error(`    ${name}`);
console.error(`
Deploying now would put the Worker ahead of its schema, and every query
touching a table these add would throw a 500 in production.

Apply them first, then deploy:

    npx wrangler d1 migrations apply ${DB} ${target}
`);
process.exit(1);
