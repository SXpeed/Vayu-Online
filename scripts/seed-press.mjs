/**
 * Vayu — seed the press table from the static coverage list.
 *
 * app/lib/data/press-data.js still ships the PRESS array; /pages/press.html
 * falls back to it whenever the table is empty, so the page has never looked
 * broken. But an empty table also means the admin panel's Press screen opens
 * on "no coverage listed yet", and the first thing anyone would do there is
 * retype four pieces that are already written down. This puts them in.
 *
 *   node scripts/seed-press.mjs              seed the local database
 *   node scripts/seed-press.mjs --remote     seed production
 *   node scripts/seed-press.mjs --force      overwrite existing rows
 *
 * Refuses by default when the table already holds rows: once a piece has been
 * edited in the panel the file is no longer the source of truth, and quietly
 * restoring it over someone's edits is worse than doing nothing.
 *
 * The array is read out of the source file rather than imported. That was
 * once necessary — the file imported the Svelte runes store, which needs a
 * browser — and is now merely belt and braces: the journal half went, and
 * press-data.js has no imports left at all.
 */

import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const remote = args.includes('--remote');
const force = args.includes('--force');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

/**
 * Run one statement and return the rows it matched.
 *
 * --command, NOT --file, and the distinction is not cosmetic. Given --file,
 * wrangler answers a SELECT with a summary of the run rather than the rows:
 *
 *     [{ results: [{ "Total queries executed": 1, "Rows read": 0, ... }] }]
 *
 * Read through the old helper, that made `SELECT COUNT(*) AS n` produce an
 * object with no `n`, so `existing` fell to 0 and the guard below — the one
 * that refuses to overwrite coverage somebody edited in the panel — could
 * never fire. It also made the confirmation at the end print one line of
 * wrangler statistics instead of the pieces actually seeded.
 *
 * Writes stay on --file (d1Exec): a multi-row INSERT is long, and a file has
 * no argv length limit to worry about.
 */
function d1Rows(sql) {
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
    if (rows.some(r => r && Object.hasOwn(r, 'Total queries executed'))) {
        console.error('wrangler returned a run summary instead of rows — refusing to guess at the table state.');
        process.exit(1);
    }
    return rows;
}

/** Run one SQL file. For writes, where the statement may be long. */
function d1Exec(sql) {
    const path = join(tmpdir(), `vayu-press-${randomBytes(6).toString('hex')}.sql`);
    writeFileSync(path, sql, { mode: 0o600 });
    try {
        const out = execFileSync(
            process.execPath,
            [wrangler, 'd1', 'execute', 'vayuindia-db', remote ? '--remote' : '--local', '--file', path],
            { encoding: 'utf8' },
        );
        return JSON.parse(out.slice(out.indexOf('[')))[0]?.results ?? [];
    } catch (err) {
        console.error('wrangler failed:\n' + (err.stdout || err.message));
        process.exit(1);
    } finally {
        rmSync(path, { force: true });
    }
}

/**
 * Pull the PRESS literal out of the source and evaluate just that.
 *
 * Braces are counted rather than matched with a regex: the entries contain
 * apostrophes, em dashes and nested quotes, none of which a lazy `\[.*?\]`
 * survives.
 */
function readPress() {
    const src = readFileSync(join(root, 'app', 'lib', 'data', 'press-data.js'), 'utf8');
    const start = src.indexOf('export const PRESS = [');
    if (start === -1) throw new Error('PRESS not found in press-data.js');

    const open = src.indexOf('[', start);
    let depth = 0;
    let end = -1;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '[') depth++;
        else if (src[i] === ']' && --depth === 0) { end = i + 1; break; }
    }
    if (end === -1) throw new Error('unterminated PRESS array');

    // eslint-disable-next-line no-new-func
    return new Function(`return ${src.slice(open, end)};`)();
}

const q = (v) => `'${String(v ?? '').replaceAll("'", "''")}'`;

/** The same id the API's create handler would derive, so the two agree. */
const idFor = (p) => `${p.source || ''} ${p.headline || ''}`
    .toLowerCase().trim()
    .replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/(^-|-$)/g, '').slice(0, 80);

const press = readPress();
if (!press.length) {
    console.error('No coverage found to seed.');
    process.exit(1);
}

const existing = Number(d1Rows('SELECT COUNT(*) AS n FROM press;')[0]?.n ?? 0);
if (existing && !force) {
    console.error(
        `The ${remote ? 'remote' : 'local'} press table already holds ${existing} `
        + 'row(s). Nothing was changed.\n\n'
        + 'Those rows may have been edited in the admin panel, and this would\n'
        + 'overwrite them. Re-run with --force if you are sure.',
    );
    process.exit(1);
}

// At most one entry is featured: the page gives it its own large block.
let featuredSeen = false;

const values = press.map((p, i) => {
    const featured = p.featured && !featuredSeen ? 1 : 0;
    if (featured) featuredSeen = true;

    // Unverified entries are stored as bare as they render. Copying a
    // headline or quote into a row nobody checked would put it one flag away
    // from being published, which is exactly what `verified` exists to stop.
    const verified = p.verified ? 1 : 0;
    return '  (' + [
        q(idFor(p)),
        featured,
        verified,
        q(p.source),
        q(verified ? p.headline ?? '' : ''),
        q(verified ? p.byline ?? '' : ''),
        q(verified ? p.date ?? '' : ''),
        q(verified ? p.quote ?? '' : ''),
        q(verified ? p.quoteAttribution ?? '' : ''),
        q(p.snippet ?? ''),
        q(p.image ?? ''),
        q(p.alt ?? `${p.source} coverage of Vayu`),
        q(p.url ?? ''),
        i,                       // sort_order: keep the order the file lists them in
    ].join(', ') + ')';
});

const COLUMNS = '(id, featured, verified, source, headline, byline, date, quote, '
    + 'quote_attribution, snippet, image, alt, url, sort_order)';

// One statement, so a failure part-way cannot leave half a list behind.
const sql = force
    ? `DELETE FROM press;\nINSERT INTO press\n  ${COLUMNS}\nVALUES\n${values.join(',\n')};`
    : `INSERT INTO press\n  ${COLUMNS}\nVALUES\n${values.join(',\n')};`;

d1Exec(sql);

const after = d1Rows('SELECT id, featured, verified, source, sort_order FROM press ORDER BY sort_order;');
console.error(`Seeded ${after.length} pieces into the ${remote ? 'remote' : 'local'} press table:`);
for (const r of after) {
    console.error(
        `  ${String(r.sort_order).padStart(2)}  ${r.featured ? '★' : ' '}  `
        + `${r.verified ? 'verified  ' : 'unverified'}  ${r.source}`,
    );
}
if (!featuredSeen) {
    console.error('\nNote: nothing carried `featured: true`, so the page will lead with the first.');
}
