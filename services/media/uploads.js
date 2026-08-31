/**
 * Vayu — admin-uploaded images, transformed on the way out.
 *
 * The panel puts bytes in R2 and stores the key as a product cover, a
 * gallery shot, a category banner, a colour swatch or a hero slide. This
 * serves them back, and — where the request asks for one and the Images
 * binding is there to do it — serves a resized, re-encoded variant instead
 * of the original.
 *
 * WHY THIS EXISTS AT ALL. The site already had an image pipeline: every
 * picture in public/assets/images gets an AVIF twin and a measured width and
 * height at build time (scripts/images.mjs). Uploads got none of it. They
 * could not: the build cannot convert a file that will not exist until an
 * admin uploads it six months from now. So a product page was serving modern
 * formats for its furniture and a raw 1600px WebP for the actual product
 * photograph — the one picture on the page anybody came to look at. The
 * build-time half handles what ships; this is the runtime half, and between
 * them every picture on the site is covered by the same policy.
 *
 * WHY R2 STAYS THE SOURCE OF TRUTH, rather than moving the uploads into
 * Cloudflare Images' own storage. Every URL the panel has ever handed out is
 * already in D1 — on products, categories, hero slides, artists. Migrating
 * the bytes would mean rewriting every one of those rows and breaking every
 * link anybody saved in the meantime. Transforming out of R2 changes no
 * stored value at all: /uploads/images/chair_1724.png keeps meaning exactly
 * what it meant, and the query string is the only new thing.
 *
 * DEGRADING. Every failure here falls back to the original bytes rather than
 * to an error. No Images binding (a `wrangler dev` without one, an account
 * where transformations are not enabled), a format the transformer refuses,
 * a transform that throws — the picture still loads, just heavier. An image
 * pipeline that can turn a working page into a broken one is not worth the
 * kilobytes it saves.
 */

import {
  PASS_THROUGH_TYPES,
  VARIANT_FORMATS,
  VARIANT_FITS,
  DEFAULT_FIT,
  snapWidth,
  clampQuality,
} from '#shared/content/variants.js';

/**
 * Bumping this abandons every cached variant.
 *
 * It is in the cache key rather than being a purge because there is no list
 * of what to purge: the entries are keyed by whatever widths browsers have
 * asked for. Note that `wrangler dev` persists the Cache API to
 * .wrangler/state/v3/cache and it survives a restart, so a local experiment
 * with the transform settings needs this bumped or that directory cleared —
 * otherwise you are looking at yesterday's encode and editing the wrong
 * thing.
 */
const CACHE_VERSION = 'v2';
// v1 → v2: the sandbox CSP and nosniff below were added after v1 entries had
// already been written. Those entries are stored WITH their headers and are
// marked immutable for a year, so the fix would not have reached a single
// upload anyone had already looked at — the code would be correct and the
// live responses would stay vulnerable until 2027. Abandoning the namespace
// is what actually ships the fix. Any security change to the headers below
// needs the same bump.

/** A year. Upload keys carry a timestamp and are never rewritten in place,
 *  so a given URL always answers with the same bytes. */
const IMMUTABLE = 'public, max-age=31536000, immutable';

/**
 * What stops an uploaded file being a script on this origin.
 *
 * THE HOLE THIS CLOSES. The panel accepts `.svg` (see IMAGE_TYPES in
 * services/users/admin.js) and an SVG is a document, not a picture: it may
 * carry <script>, and a browser NAVIGATED to one served as image/svg+xml
 * runs that script in the origin that served it. These files are served from
 * vayuindia.com/uploads/*, the same origin as the shop — so an uploaded SVG
 * was stored XSS on the storefront, able to read a shopper's session and
 * rewrite a checkout page.
 *
 * It needed an admin account to plant, which is why it is not critical, but
 * `staff` is the lowest of three admin roles (see roleError) and staff can
 * upload. That makes this a privilege escalation: the least-trusted account
 * in the panel could reach every customer on the site.
 *
 * `default-src 'none'` forbids the document every resource it might fetch,
 * and `sandbox` with no tokens puts it in an opaque origin with scripting
 * off — so navigating to one now renders a picture and nothing else. Neither
 * affects the case that matters: an <img src="/uploads/…"> is loaded as an
 * image, where a browser will not run the SVG's script anyway, and the CSP
 * of the embedding page is what governs.
 *
 * `nosniff` is the other half. Without it a browser may disregard the stored
 * Content-Type and re-sniff the bytes — which is how a file uploaded as one
 * type gets executed as another.
 */
const SANDBOX_CSP = "default-src 'none'; sandbox";

/**
 * The transform this request is asking for, resolved before anything is read
 * out of R2.
 *
 * Deliberately in that order. Resolving the format from `Accept` up front
 * means the cache key is a fixed string and a hit costs one cache lookup and
 * no R2 round trip. The cost is that the key can name a format the object
 * turns out not to be convertible to — an animated GIF keyed as `f=avif` —
 * and the entry then holds the original under an avif-shaped key. That is
 * harmless: the key is internal, and the response carries its own
 * Content-Type. Doing it the other way round would mean an R2 HEAD before
 * every cache lookup, which is the cost on the hot path rather than a cosmetic
 * oddity in a cold one.
 */
export function requestedVariant(url, request) {
  const params = url.searchParams;

  const width = snapWidth(params.get('w'));
  const quality = params.has('q') ? clampQuality(params.get('q')) : null;

  const fitParam = params.get('fit');
  const fit = VARIANT_FITS.has(fitParam) ? fitParam : null;

  // An explicit ?f= wins; otherwise take the best thing the browser admits
  // to understanding. `Accept` is the only honest signal available, and the
  // browsers that support AVIF all say so there.
  const explicit = params.get('f');
  let format = null;
  if (explicit && Object.hasOwn(VARIANT_FORMATS, explicit)) {
    format = explicit;
  } else if (!explicit) {
    const accept = request.headers.get('accept') || '';
    if (accept.includes('image/avif')) format = 'avif';
    else if (accept.includes('image/webp')) format = 'webp';
  }

  return { width, format, quality, fit, negotiated: !explicit && Boolean(format) };
}

/** The variant as a short stable string, for the cache key and the etag. */
const variantTag = ({ width, format, quality, fit }) =>
  `w${width || 0}f${format || 'orig'}q${quality || 0}${fit ? `-${fit}` : ''}`;

/**
 * The cache key.
 *
 * A synthetic URL rather than the request's own, because the request's URL
 * does not name the format when it was negotiated from `Accept` — two
 * browsers asking for the identical URL want different bytes, and keying on
 * that URL would hand the AVIF to the one that cannot read it. Everything
 * that changes the response is in the path here, and nothing else is.
 */
const cacheKeyFor = (url, key, variant) =>
  new Request(`${url.origin}/__image/${CACHE_VERSION}/${variantTag(variant)}/${key}`, {
    method: 'GET',
  });

/**
 * The R2 key from a `[...key]` path segment, or null if it is not one we
 * will serve.
 */
export function uploadKey(raw) {
  let key;
  // Arrives already decoded per segment, but a key may hold characters that
  // were percent-encoded in the URL. Decode defensively, and refuse anything
  // that tries to climb out of the bucket prefix.
  try { key = decodeURIComponent(String(raw || '')); }
  catch { return null; }

  if (!key || key.includes('..')) return null;
  return key;
}

/**
 * Run the transform. Returns a Response, or null when the caller should send
 * the original instead — which is every case this cannot improve on.
 */
async function transformed(images, object, sourceType, variant) {
  if (!images) return null;
  if (PASS_THROUGH_TYPES.has(sourceType)) return null;

  const outFormat = variant.format ? VARIANT_FORMATS[variant.format] : null;

  // Nothing asked for: no resize, and either no format preference or one the
  // object already satisfies. Re-encoding a WebP as a WebP spends money to
  // produce the file we are holding.
  if (!variant.width && (!outFormat || outFormat === sourceType)) return null;

  const transform = {};
  if (variant.width) {
    transform.width = variant.width;
    // scale-down by default, and it is the right default for a shop: a
    // product photograph asked for at a rung wider than it was shot is left
    // at its own size rather than upscaled into softness. `cover` and the
    // rest need both dimensions, which only an explicit ?fit= supplies.
    transform.fit = variant.fit || DEFAULT_FIT;
  } else if (variant.fit) {
    transform.fit = variant.fit;
  }

  const output = { format: outFormat || sourceType };
  if (variant.quality) output.quality = variant.quality;

  try {
    const result = await images
      .input(object.body)
      .transform(transform)
      .output(output);
    return result.response();
  } catch {
    // 5400 (format we cannot read), 5403 (transform refused), 9413 (rate
    // limited) all land here and all mean the same thing to the visitor:
    // send them the picture we already have.
    return null;
  }
}

/**
 * Serve one upload.
 *
 * `waitUntil` is optional: without it the cache write is skipped rather than
 * left as a floating promise, because a promise the runtime does not know
 * about can be cancelled the moment the response is returned — which would
 * write a truncated entry sometimes and a whole one other times, and be
 * thoroughly confusing to debug.
 */
export async function serveUpload({ request, url, key, env, waitUntil }) {
  const bucket = env?.UPLOADS;
  if (!bucket) {
    return new Response('Bindings unavailable — run through wrangler, not `vite dev`.', {
      status: 503,
    });
  }

  const variant = requestedVariant(url, request);
  const cache = caches.default;
  const cacheKey = cacheKeyFor(url, key, variant);

  const hit = await cache.match(cacheKey);
  if (hit) {
    const cachedEtag = hit.headers.get('etag');
    if (cachedEtag && etagMatches(request, cachedEtag)) {
      await hit.body?.cancel();
      return notModified(hit.headers);
    }
    return hit;
  }

  const object = await bucket.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  const sourceHeaders = new Headers();
  object.writeHttpMetadata(sourceHeaders);
  const sourceType = sourceHeaders.get('content-type') || 'application/octet-stream';

  // Strong etag over the R2 version plus the variant: the same object at two
  // widths is two different bodies and must not share a validator.
  //
  // Settled here, before the transform, so a browser that already holds this
  // variant is answered without spending an encode on bytes it will discard.
  const etag = `"${object.etag}-${variantTag(variant)}"`;
  if (etagMatches(request, etag)) {
    await object.body.cancel();
    return notModified(baseHeaders(etag, variant));
  }

  // The body is a stream and can only be read once, so the transform either
  // consumes it or it goes out whole — never both.
  const variantResponse = await transformed(env.IMAGES, object, sourceType, variant);

  const headers = baseHeaders(etag, variant);
  headers.set('Content-Type', variantResponse
    ? (variantResponse.headers.get('content-type') || sourceType)
    : sourceType);

  const body = variantResponse ? variantResponse.body : object.body;
  const response = new Response(body, { headers });

  if (waitUntil) waitUntil(cache.put(cacheKey, response.clone()));

  return response;
}

/** The headers every answer carries, 200 and 304 alike. */
function baseHeaders(etag, variant) {
  const headers = new Headers();
  headers.set('Cache-Control', IMMUTABLE);
  headers.set('ETag', etag);
  // Unconditional, not just for SVG. Deciding per type would mean the
  // protection depends on the extension being right, and an upload's
  // extension is attacker-chosen — the whole point of nosniff is that the
  // declared type cannot be trusted on its own.
  headers.set('Content-Security-Policy', SANDBOX_CSP);
  headers.set('X-Content-Type-Options', 'nosniff');
  // Only when the format came from the request's Accept rather than its URL.
  // Stating it unconditionally would split the cache for every picture on a
  // header that, in that case, cannot change the answer.
  if (variant.negotiated) headers.set('Vary', 'Accept');
  // The transform is the one interesting thing about this response, and it
  // is otherwise invisible once the format is negotiated rather than asked
  // for by name.
  headers.set('X-Vayu-Variant', variantTag(variant));
  return headers;
}

const notModified = (headers) => {
  const out = new Headers(headers);
  out.delete('content-type');
  return new Response(null, { status: 304, headers: out });
};

/**
 * Does the browser already hold this exact variant?
 *
 * A cache may weaken a strong etag on the way through, so the comparison is
 * on the opaque part rather than the whole header. `*` matches anything we
 * have, which is what the spec asks for.
 */
function etagMatches(request, etag) {
  const inm = request.headers.get('if-none-match');
  if (!inm) return false;
  if (inm.trim() === '*') return true;

  const normalise = (v) => v.trim().replace(/^W\//, '');
  return inm.split(',').some((candidate) => normalise(candidate) === normalise(etag));
}
