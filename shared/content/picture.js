/**
 * Vayu — one picture, wherever it came from.
 *
 * Two things end up in an <img> on this site and they are known at opposite
 * ends of the project's life:
 *
 *   shipped   public/assets/images, converted to AVIF and measured at build
 *             time by scripts/images.mjs, which writes image-sizes.js beside
 *             this file. Known before a single request arrives.
 *
 *   uploaded  /uploads/*, chosen by an admin months after the build. Nothing
 *             could be known about one in advance, so nothing was: an upload
 *             got no AVIF, no srcset and no width or height, which on a
 *             product page meant the furniture around the photograph was
 *             better served than the photograph.
 *
 * This module is where that difference stops mattering. Callers ask for a
 * picture by whatever name they have and do not need to know which kind they
 * have, nor what file will actually be sent.
 *
 * THE NAMES ARE NOT THE FILES. The site ships AVIF and only AVIF — the PNG
 * and JPEG sources were deleted once every twin existed, taking 94% of the
 * image weight with them. But the names those files had are written into
 * markup, into the content modules, and into rows in D1 that no build step
 * can reach. So '/assets/images/hero.jpg' stays the way a picture is
 * referred to, and `deliverySrc` is what turns it into the file that exists.
 * Nothing else in the codebase had to change, which is the entire reason it
 * is done this way round.
 *
 * `image-sizes.js` is generated and holds only what the build measured;
 * anything hand-written there is lost on the next run, which is why the
 * policy lives here and reads it rather than the other way round.
 */

import { shippedSize, shippedAvif } from './image-sizes.js';
import { isUpload, variantURL, srcsetFor as variantSrcset } from './variants.js';

export { IMAGE_SIZES } from './image-sizes.js';
export { isUpload, variantURL, SRCSET_WIDTHS } from './variants.js';

/**
 * The dimensions an upload wrote into its own key, or null.
 *
 * `chair_1724692000000_1600x1067.webp` — the 13-digit millisecond stamp has
 * to be there for the match. Without that anchor a file an admin happened to
 * name `poster_800x600.png` would be read as a measurement, and the wrong
 * width and height on an <img> are worse than none: the browser reserves the
 * wrong box, shifts the page anyway, and squashes the picture doing it.
 *
 * Uploads made before the measuring existed have no suffix and return null,
 * which is exactly the behaviour they have today.
 */
const KEYED_SIZE = /_\d{13}_(\d+)x(\d+)\.[a-z0-9]+$/i;

function uploadSize(src) {
    const match = KEYED_SIZE.exec(String(src || '').split('?')[0]);
    if (!match) return null;
    return { w: Number(match[1]), h: Number(match[2]) };
}

/**
 * The URL to actually put in `src`.
 *
 * A shipped picture resolves to its AVIF; an upload is left exactly as it
 * is, because the Worker in front of /uploads/* negotiates the format from
 * the browser's own Accept header and needs the plain key to do it. Anything
 * this does not recognise — an external URL, a data: URI — comes back
 * untouched, so it is always safe to call.
 */
export function deliverySrc(src) {
    if (!src || isUpload(src)) return src;
    return shippedAvif(src) || src;
}

/**
 * The intrinsic size of any picture on the site, or null when it cannot be
 * known — an old upload, or a path that is neither.
 */
export function imageSize(src) {
    return isUpload(src) ? uploadSize(src) : shippedSize(src);
}

/**
 * The AVIF for a picture, or '' when there is none.
 *
 * For a shipped file this is now the same answer as `deliverySrc` — the AVIF
 * *is* the picture, not an alternative to it. Kept because a caller building
 * a <picture> still reads more clearly asking for the AVIF by name, and
 * because an upload answers differently: it has no twin on disk and never
 * will, so the answer there is the URL that asks the Worker to encode one.
 */
export function avifFor(src) {
    return isUpload(src) ? variantURL(src, { format: 'avif' }) : shippedAvif(src);
}

/**
 * The width/height pair for an <img>, as attributes ready to interpolate.
 *
 * Empty for anything whose size cannot be established, because stating the
 * wrong one is worse than stating none.
 */
export function sizeAttrs(src) {
    const size = imageSize(src);
    return size ? ` width="${size.w}" height="${size.h}"` : '';
}

/**
 * The responsive candidates for an upload, in one format.
 *
 * Empty for a shipped file: those are a single fixed encode with no Worker
 * in front of them to make a second size on demand.
 */
export function srcsetFor(src, format) {
    return variantSrcset(src, { format, intrinsicWidth: imageSize(src)?.w });
}

/**
 * Two crops of the same subject, one for phones and one for everything else.
 *
 * This is art direction, not format negotiation, and the difference is worth
 * being clear about because they look identical in the markup. Formats are
 * chosen for you: the AVIF is the same photograph, and picking it is the
 * browser's business. A phone crop is a DIFFERENT photograph — the wide one
 * cropped to a square keeps its middle and loses both ends, which on a
 * poster is where the title is. Nothing can infer that; somebody has to
 * choose it, which is why it is a field in the admin panel.
 *
 * `<picture>` is the only thing that does this properly. Swapping the src
 * with a script means the wrong picture is already downloading before the
 * script runs, and the reader watches it change.
 *
 * With no phone crop this returns a bare <img>, which is the common case:
 * one photograph that works at both shapes.
 *
 * Both sources go through `deliverySrc`, so a shipped picture resolves to
 * its AVIF and an upload is left for the Worker to negotiate.
 */
export function phonePictureHTML(src, phoneSrc, {
    alt = '',
    cls = '',
    lazy = true,
    priority = false,
    breakpoint = '(max-width: 768px)',
    escape = (x) => x,
} = {}) {
    const loading = priority ? ' fetchpriority="high"' : (lazy ? ' loading="lazy"' : '');
    const img = `<img src="${escape(deliverySrc(src))}" alt="${escape(alt)}"${sizeAttrs(src)}${
        loading} decoding="async"${cls ? ` class="${cls}"` : ''}>`;

    if (!phoneSrc) return img;

    return `<picture><source media="${breakpoint}" srcset="${
        escape(deliverySrc(phoneSrc))}">${img}</picture>`;
}

/**
 * One picture, whole.
 *
 * The two cases produce genuinely different markup rather than two
 * formattings of one:
 *
 *   an upload      <picture> with an AVIF and a WebP source, each a full
 *                  srcset the Worker resizes on demand, and the stored file
 *                  as the <img> — one upload serving every screen size.
 *   a shipped file a bare <img> pointing at the AVIF. There is one encode
 *                  and one format, so a <picture> here would be a wrapper
 *                  around a single source: markup with nothing to choose.
 *
 * `sizes` is opt-in and gates the srcset, which is deliberate. A srcset with
 * no `sizes` is read as `100vw`, so a tile four-up in a grid would be handed
 * the candidate for a full-width image — bigger than the original and slower
 * than having said nothing. A caller that knows its layout passes it; one
 * that does not gets the full-size AVIF, which is never wrong.
 *
 * Three loading states rather than two, because they are three different
 * claims. The default says the picture can wait, which is true of most of
 * the site. `lazy: false` says it cannot, because it is in the first
 * screenful and a lazy image there is fetched late and shows as a blank box.
 * `priority` says it is the one picture the page is measured by — the home
 * hero, and nothing else. Marking several as priority marks none.
 */
export function pictureHTML(src, {
    alt = '',
    cls = '',
    lazy = true,
    priority = false,
    sizes = '',
    escape = (x) => x,
} = {}) {
    const loading = priority ? ' fetchpriority="high"' : (lazy ? ' loading="lazy"' : '');
    const img = (url) => `<img src="${escape(url)}" alt="${escape(alt)}"${sizeAttrs(src)}${
        loading} decoding="async"${cls ? ` class="${cls}"` : ''}>`;

    if (!isUpload(src)) return img(deliverySrc(src));

    const sizesAttr = sizes ? ` sizes="${escape(sizes)}"` : '';
    const source = (format) => {
        const set = sizes ? srcsetFor(src, format) : variantURL(src, { format });
        return set ? `<source srcset="${escape(set)}"${sizesAttr} type="image/${format}">` : '';
    };
    // AVIF first: the browser takes the first source it can decode, so the
    // order is the preference. WebP behind it for Safari before 16.4 — which
    // matters for an upload in a way it no longer can for a shipped file,
    // because an upload is re-encoded on demand and can still offer both.
    return `<picture>${source('avif')}${source('webp')}${img(src)}</picture>`;
}
