/**
 * Vayu — the build.
 *
 * A thin, cross-platform wrapper around `vite build` (the SvelteKit build):
 *
 *   1. Clear `.svelte-kit/cloudflare` with retries. @sveltejs/adapter-cloudflare
 *      rmSync's its own output dir at the start of every build and does not retry;
 *      on Windows that intermittently throws EPERM while a handle (indexer,
 *      Defender, a just-stopped workerd) is still open, killing the build after
 *      the slow part has already succeeded. Clearing it here, with retries,
 *      makes `npm run build` reliable on Windows as well as macOS/Linux.
 *   2. Run `vite build`, inheriting stdio so the output is unchanged.
 *   3. Assert the Worker bundle was emitted.
 *
 *   npm run build        bundle
 *   npm run dev          build, then wrangler dev
 *   npm run deploy       build, then wrangler deploy
 */
import { spawnSync } from 'node:child_process';
import { rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, '.svelte-kit', 'cloudflare');
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 1. clear the adapter output dir ---------- */

if (existsSync(outDir)) {
    for (let attempt = 1; attempt <= 10; attempt++) {
        try {
            rmSync(outDir, { recursive: true, force: true });
        } catch {
            /* a handle is still open — try again */
        }
        if (!existsSync(outDir)) break;
        await sleep(1000);
    }
    if (existsSync(outDir)) {
        console.error('could not clear .svelte-kit/cloudflare — is a dev server still running?');
        process.exit(1);
    }
}

/* ---------- 2. the pictures ----------
   Before Vite, because the size manifest it writes is imported by the
   markup: a build that ran these the other way round would compile
   yesterday's dimensions in. Both are no-ops when nothing has changed. */

const images = spawnSync(process.execPath, [path.join(root, 'scripts', 'images.mjs')], {
    stdio: 'inherit',
    cwd: root,
});
if (images.status !== 0) {
    console.error('image conversion failed — see above.');
    process.exit(images.status ?? 1);
}

/* ---------- 3. run the SvelteKit build ---------- */

if (!existsSync(viteBin)) {
    console.error('vite is not installed — run `npm install` first.');
    process.exit(1);
}

const result = spawnSync(process.execPath, [viteBin, 'build', ...process.argv.slice(2)], {
    stdio: 'inherit',
    cwd: root,
});

if (result.error) {
    console.error('failed to launch vite build:', result.error.message);
    process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);

/* ---------- 4. verify the Worker was emitted ---------- */

const worker = path.join(outDir, '_worker.js');
if (!existsSync(worker)) {
    console.error('BUILD INCOMPLETE: no _worker.js was emitted');
    process.exit(1);
}

function walk(dir) {
    let files = [];
    for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) files = files.concat(walk(full));
        else files.push(full);
    }
    return files;
}

const pages = walk(outDir).filter((f) => f.endsWith('.html')).length;
console.log(`\nbuild ok: ${pages} page(s), worker emitted`);
