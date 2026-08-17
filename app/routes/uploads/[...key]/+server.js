/**
 * Vayu — images the admin panel uploaded, served back out of R2.
 *
 * The panel posts a data: URL to /api/admin/upload, which puts the bytes in
 * the UPLOADS bucket under `images/<name>_<stamp>.<ext>` and hands back
 * `/uploads/images/...`. That URL is then stored as a product cover, a
 * gallery shot, a category banner, a colour swatch or a hero slide.
 *
 * Nothing served those URLs. The pre-SvelteKit Worker had a `serveUpload`
 * branch for them (see src/worker.js) and it was not carried across in the
 * migration, so every image anyone uploaded through the panel came back 404
 * — the upload succeeded, the row stored the path, and the picture was
 * simply never there. The failure is silent from the panel's side, which is
 * why it survived: you only see it on the storefront, as a missing image.
 *
 * wrangler.jsonc already lists /uploads/* under `run_worker_first`, so this
 * route is reached before Workers Assets tries and fails to match a file.
 */

import { error } from '@sveltejs/kit';

export async function GET({ params, platform }) {
    // `[...key]` arrives already decoded per segment, but a key may contain
    // characters that were percent-encoded in the URL, so decode defensively
    // and refuse anything that tries to climb out of the bucket prefix.
    let key;
    try {
        key = decodeURIComponent(params.key || '');
    } catch {
        error(400, 'Bad upload path');
    }
    if (!key || key.includes('..')) error(404, 'Not found');

    const bucket = platform?.env?.UPLOADS;
    if (!bucket) error(503, 'Bindings unavailable — run through wrangler, not `vite dev`.');

    const object = await bucket.get(key);
    if (!object) error(404, 'Not found');

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    // Upload keys carry a timestamp and are never rewritten in place, so a
    // given URL always answers with the same bytes.
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');

    return new Response(object.body, { headers });
}
