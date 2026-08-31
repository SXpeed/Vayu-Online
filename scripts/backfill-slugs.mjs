/**
 * Vayu — give every product a URL slug.
 *
 *   node scripts/backfill-slugs.mjs            local
 *   node scripts/backfill-slugs.mjs --remote   production
 *
 * Migration 0010 adds products.slug with a '' default, because SQLite cannot
 * compute one in an ALTER TABLE and a UNIQUE column with a repeated default
 * would not apply at all. Every product that existed before that migration
 * therefore carries an empty slug, and an empty slug has no /products/<slug>
 * address — so this is what actually puts the catalogue on the new URLs.
 *
 * Only rows with slug = '' are touched. A product that already has one keeps
 * it: the slug IS the canonical URL, and re-minting it on a later run would
 * move a ranked page and 404 every link pointing at the old address.
 *
 * Idempotent, so it is safe to run after every import.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugify } from '../app/lib/server/slug.js';

const remote = process.argv.includes('--remote');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

if (!existsSync(wrangler)) {
    console.error('wrangler is not installed — run `npm install` first.');
    process.exit(1);
}

/** Run SQL through wrangler and return the parsed rows. */
function d1(sql) {
    const file = join(tmpdir(), `vayu-slugs-${Date.now().toString(36)}.sql`);
    writeFileSync(file, sql, { mode: 0o600 });
    try {
        const out = spawnSync(
            process.execPath,
            [wrangler, 'd1', 'execute', 'vayuindia-db', remote ? '--remote' : '--local', '--file', file, '--json'],
            { encoding: 'utf8', cwd: root },
        );
        if (out.status !== 0) {
            console.error(out.stdout || out.stderr);
            process.exit(1);
        }
        const text = out.stdout.slice(out.stdout.indexOf('['));
        return JSON.parse(text)[0]?.results ?? [];
    } finally {
        rmSync(file, { force: true });
    }
}

const target = remote ? 'remote' : 'local';

// Existing slugs are read too, not just the empty ones: uniqueness has to
// hold across the whole table, and two products called "Lotus Diya" in the
// same batch must not both resolve to lotus-diya.
const rows = d1('SELECT id, name, slug FROM products ORDER BY sort_order, rowid;');
const taken = new Set(rows.filter(r => r.slug).map(r => r.slug));
const todo = rows.filter(r => !r.slug);

if (!todo.length) {
    console.log(`${target}: all ${rows.length} product(s) already have a slug — nothing to do.`);
    process.exit(0);
}

const updates = [];
for (const row of todo) {
    const base = slugify(row.name) || 'product';
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    taken.add(slug);
    // id and slug are both derived from data we just read back out of D1;
    // the quote-doubling keeps a name like "Ram's Chair" from ending the
    // string early once it has been slugified into the value.
    updates.push(`UPDATE products SET slug = '${slug.replaceAll("'", "''")}' WHERE id = '${String(row.id).replaceAll("'", "''")}';`);
    console.log(`  ${String(row.name).slice(0, 44).padEnd(46)} -> ${slug}`);
}

d1(updates.join('\n'));
console.log(`\n${target}: ${updates.length} slug(s) written, ${rows.length - todo.length} left alone.`);
