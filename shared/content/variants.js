/**
 * Vayu — the vocabulary of an image variant.
 *
 * One picture, several deliveries: a 320px AVIF for a phone, a 1024px WebP
 * for a laptop, the original PNG for whatever understands neither. This
 * module holds the terms both ends of that agree on — the widths, the
 * formats, the query parameters — and nothing else, because both ends need
 * it and they run in different places:
 *
 *   the markup   builds `/uploads/x.png?w=640&f=avif` into a srcset
 *                (shared/content/picture.js, in the browser and the SSR pass)
 *   the Worker   reads that back and does the transform
 *                (services/media/uploads.js, at the edge)
 *
 * A srcset offering a width the Worker refuses is a broken picture, so the
 * list cannot live on one side alone.
 *
 * WHY AN ALLOW-LIST AND NOT ANY WIDTH. Every distinct width is a distinct
 * cache entry and a distinct transform, both billed. `?w=` open to the
 * integers is an invitation to walk 1..4000 and pay for four thousand
 * encodings of the same photograph; a fixed ladder caps the damage at nine
 * entries per picture, and no layout needs more than that.
 */

/**
 * The ladder. Roughly 1.3x apart, which is close enough that the browser
 * rarely upscales by much and far enough apart that the cache stays small.
 * Ends at 2048 because the panel downscales every upload to a 1600px long
 * edge before it is ever sent (app/admin-ui/lib/media.js) — a rung above
 * that exists only for the handful that arrive already large.
 */
export const VARIANT_WIDTHS = [160, 320, 480, 640, 768, 1024, 1366, 1600, 2048];

/** The widths a srcset offers by default: the ladder, minus the two rungs
 *  that only ever serve thumbnails. */
export const SRCSET_WIDTHS = [320, 480, 640, 768, 1024, 1366, 1600];

/** Short name in a URL, MIME type on the wire. */
export const VARIANT_FORMATS = {
  avif: 'image/avif',
  webp: 'image/webp',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

/**
 * Formats that are passed through untouched, whatever is asked for.
 *
 * SVG is vector: there is no "resize" of it that is not a downgrade, and
 * rasterising one to fit a srcset rung throws away the reason it was chosen.
 * GIF is here because it may be animated, and every still format on the
 * ladder above would silently drop every frame but the first.
 */
export const PASS_THROUGH_TYPES = new Set(['image/svg+xml', 'image/gif']);

export const DEFAULT_QUALITY = 82;
export const MIN_QUALITY = 40;
export const MAX_QUALITY = 95;

export const VARIANT_FITS = new Set(['scale-down', 'contain', 'cover', 'crop', 'pad']);
export const DEFAULT_FIT = 'scale-down';

/**
 * Snap a requested width up to the nearest rung.
 *
 * Up rather than down, so a layout asking for 500px is never handed 480 and
 * left to stretch it. Anything past the top rung is the top rung; anything
 * unparseable is no width at all, which means "leave the size alone".
 */
export function snapWidth(requested) {
  const n = Number(requested);
  if (!Number.isFinite(n) || n <= 0) return null;
  return VARIANT_WIDTHS.find((w) => w >= n) ?? VARIANT_WIDTHS[VARIANT_WIDTHS.length - 1];
}

/** A quality inside the allowed band, or the default for anything else. */
export function clampQuality(requested) {
  const n = Number(requested);
  if (!Number.isFinite(n)) return DEFAULT_QUALITY;
  return Math.min(MAX_QUALITY, Math.max(MIN_QUALITY, Math.round(n)));
}

/**
 * The path prefix uploads are served under. Anything below it is an R2 key;
 * anything else on the site is a file shipped in public/assets/images and
 * has an AVIF twin built for it at deploy time instead.
 */
export const UPLOAD_PREFIX = '/uploads/';

export const isUpload = (src) => String(src || '').startsWith(UPLOAD_PREFIX);

/**
 * A variant URL for an upload: the same key, with the transform in the query
 * string. Returns the path untouched for anything that is not an upload, so
 * callers can hand it any src without checking first.
 */
export function variantURL(src, { width, format, quality, fit } = {}) {
  const clean = String(src || '');
  if (!isUpload(clean)) return clean;

  const [path] = clean.split('?');
  const params = new URLSearchParams();
  if (width) params.set('w', String(width));
  if (format) params.set('f', format);
  if (quality) params.set('q', String(quality));
  if (fit) params.set('fit', fit);

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * A srcset line for an upload, in the given format.
 *
 * Capped at the picture's own width where that is known: offering a 1600w
 * candidate for a 900px photograph asks the browser to download a
 * re-encoding of something it will only upscale, which is the one case where
 * a wider candidate is strictly worse than a narrower one. The rung at or
 * just above the intrinsic width is kept so a high-DPR screen still has the
 * full-resolution option.
 */
export function srcsetFor(src, { format, intrinsicWidth, widths = SRCSET_WIDTHS } = {}) {
  if (!isUpload(src)) return '';

  let ladder = widths;
  if (Number.isFinite(intrinsicWidth) && intrinsicWidth > 0) {
    const cutoff = ladder.findIndex((w) => w >= intrinsicWidth);
    if (cutoff > -1) ladder = ladder.slice(0, cutoff + 1);
  }
  if (!ladder.length) return '';

  return ladder
    .map((w) => `${variantURL(src, { width: w, format })} ${w}w`)
    .join(', ');
}
