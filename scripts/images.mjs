/**
 * Vayu — the picture pipeline: convert, measure, and write the manifest.
 *
 * THE SITE SHIPS AVIF AND ONLY AVIF. public/assets/images was 39MB of PNG
 * and JPEG with an AVIF twin beside each one, the twin offered through a
 * <picture> and the original kept as the fallback. The sources are gone and
 * the directory is 2.4MB — a poster like summer_cut was 2.5MB on its own and
 * is 93KB now.
 *
 * What that costs: there is no fallback format any more. A browser too old
 * for AVIF sees nothing. That means Safari before 16.4 (March 2023); Chrome
 * has had it since 85 and Firefox since 93. It was a deliberate trade, and
 * it is the one thing to reconsider before adding a picture that has to
 * reach absolutely everybody.
 *
 * Two things soften it, both outside this file:
 *   _redirects           rewrites /assets/images/*.{png,jpg} onto the AVIF,
 *                        so every old name — in markup, in D1, in links
 *                        other people saved — still resolves.
 *   assets/og/hero.jpg   a real JPEG for social cards, generated below,
 *                        because unfurlers are years behind browsers.
 *
 * The other half of the job is layout shift. An <img> with no width or
 * height is a box of unknown size, so the browser lays the page out without
 * it and shoves everything down when the bytes arrive. This pass writes a
 * manifest of every picture's dimensions and the markup reads its numbers
 * from there, instead of somebody measuring by hand and mistyping one.
 *
 *   node scripts/images.mjs           # convert what has changed
 *   node scripts/images.mjs --force   # re-encode everything
 *
 * It runs as part of the build and is a no-op on the second run. Adding a
 * picture still works the way it always did: drop a PNG in, build, and it is
 * converted, measured and picked up — then delete the PNG, or don't.
 */

import { readdirSync, statSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import sharp from 'sharp';

const DIR = 'public/assets/images';
const MANIFEST = 'shared/content/image-sizes.js';
const SOURCES = new Set(['.png', '.jpg', '.jpeg']);
const FORCE = process.argv.includes('--force');

// 55 is where the eye stops noticing on photographs and flat poster art
// alike; effort 4 keeps a full build to about half a minute. Both were
// picked by looking at the output, not from a table.
const QUALITY = 55;
const EFFORT = 4;

const files = readdirSync(DIR).filter(f => SOURCES.has(extname(f).toLowerCase()));
const sizes = {};
let converted = 0;
let skipped = 0;
let savedBytes = 0;

/* ---------- 1. convert whatever sources are here ----------
   Usually none: the PNGs and JPEGs were deleted once every twin existed,
   and the .avif files are the originals now. This loop is what keeps the
   workflow open anyway — drop a new photograph in as a PNG, run the build,
   and it is converted, measured and picked up; the PNG can then be deleted
   or kept, and either way the next build behaves the same. */

for (const file of files) {
    const src = join(DIR, file);
    const avif = join(DIR, basename(file, extname(file)) + '.avif');
    const srcStat = statSync(src);

    const fresh = existsSync(avif) && statSync(avif).mtimeMs >= srcStat.mtimeMs;
    if (fresh && !FORCE) { skipped += 1; continue; }

    const out = await sharp(src).avif({ quality: QUALITY, effort: EFFORT }).toBuffer();

    // Only if it actually helps. A small flat PNG can encode larger as
    // AVIF, and shipping a bigger file under a newer format is worse than
    // not bothering.
    if (out.length >= srcStat.size) { skipped += 1; continue; }

    writeFileSync(avif, out);
    savedBytes += srcStat.size - out.length;
    converted += 1;
}

/* ---------- 1b. the social card, which cannot be AVIF ----------
   The one picture on this site that no browser fetches. og:image and
   twitter:image are read by Facebook, WhatsApp, iMessage, Slack and Google,
   and those unfurlers run years behind browsers on format support — several
   render nothing at all for an AVIF, which turns a shared link into a blank
   card at the moment somebody is recommending the shop.

   So one JPEG is kept, generated from the AVIF. It is written OUTSIDE
   assets/images, and that location is the whole point: the _redirects rules
   rewrite /assets/images/*.jpg onto the AVIF beside it, so a social card
   sitting in that directory would be caught by its own safety net and
   served as the thing it is there to avoid.

   1200x630 is what every unfurler crops to. */

const OG_SOURCE = join(DIR, 'hero.avif');
const OG_DIR = 'public/assets/og';
const OG_OUT = join(OG_DIR, 'hero.jpg');

if (existsSync(OG_SOURCE)) {
    mkdirSync(OG_DIR, { recursive: true });
    const fresh = existsSync(OG_OUT)
        && statSync(OG_OUT).mtimeMs >= statSync(OG_SOURCE).mtimeMs;
    if (!fresh || FORCE) {
        await sharp(OG_SOURCE)
            .resize(1200, 630, { fit: 'cover', position: 'attention' })
            .jpeg({ quality: 82, mozjpeg: true })
            .toFile(OG_OUT);
    }
}

/* ---------- 2. measure what will actually be served ----------
   The .avif files, not the sources. This is the change that let the 39MB of
   PNGs and JPEGs go: the manifest used to be keyed on the source path and
   marked `avif: true` beside it, which meant every entry depended on a file
   that existed only to be measured. Measuring the AVIF itself means the
   manifest describes the bytes the browser receives, and nothing in it
   needs the source to still be on disk.

   An AVIF has the same pixel dimensions as the file it came from, so the
   numbers are unchanged — this is the same measurement taken from the other
   end. */

for (const file of readdirSync(DIR).filter(f => extname(f).toLowerCase() === '.avif')) {
    const meta = await sharp(join(DIR, file)).metadata();
    sizes[`/assets/images/${file}`] = { w: meta.width, h: meta.height };
}

/* ---------- 3. and anything with no twin at all ----------
   A source that encodes larger as AVIF is left alone above and has no twin,
   so it is still served as itself and still needs its dimensions stated.
   Measured here rather than in the loop above so that the common case — a
   source that has been converted and deleted — costs nothing. */

for (const file of files) {
    if (existsSync(join(DIR, basename(file, extname(file)) + '.avif'))) continue;
    const meta = await sharp(join(DIR, file)).metadata();
    sizes[`/assets/images/${file}`] = { w: meta.width, h: meta.height };
}

const body = Object.entries(sizes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, s]) => `    '${path}': { w: ${s.w}, h: ${s.h}${s.avif ? ', avif: true' : ''} },`)
    .join('\n');

const manifest = `/**
 * Vayu — every picture the site SHIPS, keyed by the file that is actually
 * served, with its intrinsic size.
 *
 * GENERATED by scripts/images.mjs. Do not edit by hand: the next build
 * overwrites it. Add a picture to public/assets/images and it appears here.
 *
 * KEYED ON THE .avif, which is the thing to understand before changing
 * anything that reads this. The site used to ship a PNG or JPEG and offer an
 * AVIF twin beside it, so the manifest was keyed on the source and carried
 * an \`avif: true\` flag. That made 39MB of sources load-bearing: they were
 * the <img> fallback, and the manifest could not be built without them.
 *
 * The sources are gone. The AVIF is the picture now, and every entry here
 * describes the bytes a browser receives. The cost is that there is no
 * fallback format: a browser too old for AVIF (Safari before 16.4) sees
 * nothing. That was a deliberate trade for 94% of the image weight.
 *
 * Code still refers to pictures by their ORIGINAL names — '…/hero.jpg' —
 * because those strings are spread across markup, content modules and rows
 * in D1 that no build step can rewrite. \`shippedAvif\` below does the
 * translation, so a caller passes the name it has always used and gets the
 * file that exists.
 *
 * \`w\`/\`h\` are what the <img> width and height attributes carry — not a
 * display size, the file's own. They reserve the right box before the bytes
 * arrive, which is what stops the page jumping as it loads. An AVIF has the
 * same pixel dimensions as the file it was made from, so these numbers did
 * not change when the sources went.
 */

export const IMAGE_SIZES = {
${body}
};

/** Strip any query and swap the extension for .avif. */
const asAvif = (src) => String(src || '').split('?')[0].replace(/\\.(png|jpe?g)$/i, '.avif');

/**
 * The file to actually serve for a picture referred to by any of its names,
 * or '' when this is not a shipped picture at all.
 *
 * Falls back to the path as given when there is no AVIF but the file itself
 * is in the manifest — that is the rare source which encoded larger as AVIF
 * and was left as it was.
 */
export function shippedAvif(src) {
    const avif = asAvif(src);
    if (IMAGE_SIZES[avif]) return avif;
    const clean = String(src || '').split('?')[0];
    return IMAGE_SIZES[clean] ? clean : '';
}

/** The dimensions of a shipped picture, or null for anything else. */
export function shippedSize(src) {
    const resolved = shippedAvif(src);
    return resolved ? IMAGE_SIZES[resolved] : null;
}
`;

const previous = existsSync(MANIFEST) ? readFileSync(MANIFEST, 'utf8') : '';
if (previous !== manifest) writeFileSync(MANIFEST, manifest);

console.log(
    `images: ${converted} converted, ${skipped} up to date, ` +
    `${(savedBytes / 1024 / 1024).toFixed(1)}MB saved, ${Object.keys(sizes).length} measured`,
);
