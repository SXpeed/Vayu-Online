/**
 * Vayu — seed the editable site content from what the pages hardcode.
 *
 * The admin panel's Site content screen edits `config` rows in the 'content'
 * scope. Only `productDefaults` was ever written there (by migration 0006),
 * so the Home hero carousel screen showed "No slides — the home page will
 * show its built-in hero", and the hero on the live site could not be changed
 * without a deploy.
 *
 * The two slides below mirror the markup in app/routes/+page.svelte exactly.
 * That fidelity matters: renderHero() in app/lib/core/site-content.js REPLACES
 * `#homeHero` the moment heroSlides exists, so a seed that differs from the
 * built-in markup silently changes the home page rather than merely making it
 * editable.
 *
 *   node scripts/seed-site-content.mjs             seed the local database
 *   node scripts/seed-site-content.mjs --remote    seed production
 *   node scripts/seed-site-content.mjs --force     overwrite existing rows
 *
 * Refuses by default when the key already exists — once the hero has been
 * edited in the panel, this file is no longer the source of truth.
 */

import { existsSync, writeFileSync, rmSync } from 'node:fs';
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
 * The home hero, exactly as app/routes/+page.svelte ships it.
 *
 * Slide 1 carries a heading and a button, so it renders with the darkening
 * overlay. Slide 2 has neither: it is a poster whose own typography is part
 * of the artwork, so the whole image becomes the link and no overlay is
 * drawn over it. That distinction is expressed purely by leaving `title` and
 * `ctaText` empty — see slideHTML().
 */
const HERO_SLIDES = [
    {
        img: '/assets/images/hero.jpg',
        title: 'ECHOES OF VAYU',
        ctaText: 'DISCOVER THE CAMPAIGN',
        ctaHref: '/pages/collection.html',
        alt: 'Vayu Autumn / Winter Campaign 2026',
    },
    {
        img: '/assets/images/personal_heirlooms.jpg',
        title: '',
        ctaText: '',
        ctaHref: '/pages/gallery.html',
        alt: 'Personal Heirlooms — Sarees from the Collection of Malvika Singh, '
            + 'on view till 23 August 2026, Gallery Vayu',
    },
];

/** Run one SQL file and return wrangler's parsed rows. */
function d1(sql) {
    const path = join(tmpdir(), `vayu-content-${randomBytes(6).toString('hex')}.sql`);
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

// A slide pointing at a missing file renders as a broken hero on the home
// page, which is worse than the hardcoded version this replaces. Checked
// locally, where the assets live; --remote serves the same built files.
const missing = HERO_SLIDES
    .map(s => s.img)
    .filter(img => !existsSync(join(root, 'public', img.replace(/^\//, ''))));

if (missing.length) {
    console.error('Refusing: these hero images do not exist under public/:\n  ' + missing.join('\n  '));
    process.exit(1);
}

const q = (v) => `'${String(v ?? '').replaceAll("'", "''")}'`;

const existing = d1("SELECT key FROM config WHERE scope = 'content' AND key = 'heroSlides';");
if (existing.length && !force) {
    console.error(
        `The ${remote ? 'remote' : 'local'} database already has content.heroSlides. `
        + 'Nothing was changed.\n\n'
        + 'It may have been edited in the admin panel, and this would overwrite it.\n'
        + 'Re-run with --force if you are sure.',
    );
    process.exit(1);
}

const now = new Date().toISOString();
d1(
    'INSERT INTO config (scope, key, value, updated_at)\n'
    + `VALUES ('content', 'heroSlides', ${q(JSON.stringify(HERO_SLIDES))}, ${q(now)})\n`
    + 'ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;',
);

const rows = d1("SELECT key, length(value) AS len FROM config WHERE scope = 'content' ORDER BY key;");
console.error(`Seeded the ${remote ? 'remote' : 'local'} site content. 'content' scope now holds:`);
for (const r of rows) console.error(`  ${r.key.padEnd(16)} ${r.len} bytes`);
console.error(`\nHero slides written: ${HERO_SLIDES.length}`);
for (const s of HERO_SLIDES) {
    console.error(`  ${s.title || '(poster)'} → ${s.img}`);
}
console.error('\nThe announcement bar is deliberately not seeded: the site has never shown one,');
console.error('and an empty string is what the panel already reads. Set it from Site content.');
