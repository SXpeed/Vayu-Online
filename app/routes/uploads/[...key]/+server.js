/**
 * Vayu — /uploads/*, the storefront's mount of the upload store.
 *
 * A thin adapter and nothing else: it unpacks what SvelteKit hands a route
 * into what services/media/uploads.js takes, and that module does the work —
 * R2, format negotiation, the transform, the edge cache. The same handler
 * serves this path from any Worker that binds UPLOADS, which is why the
 * logic is not written out here.
 *
 * Nothing served these URLs at all for a while. The pre-SvelteKit Worker had
 * a `serveUpload` branch and it was not carried across in the migration, so
 * every image an admin uploaded came back 404 — the upload succeeded, the
 * row stored the path, and the picture was simply never there. The failure
 * is silent from the panel's side, which is why it survived: you only see it
 * on the storefront, as a missing image.
 *
 * wrangler.jsonc lists /uploads/* under `run_worker_first`, so this route is
 * reached before Workers Assets tries and fails to match a file.
 */

import { error } from '@sveltejs/kit';
import { serveUpload, uploadKey } from '#services/media/uploads.js';

export async function GET({ params, request, url, platform }) {
    const key = uploadKey(params.key);
    if (!key) error(404, 'Not found');

    return serveUpload({
        request,
        url,
        key,
        env: platform?.env ?? {},
        // Without an execution context the cache write is skipped rather
        // than left floating — see the note on serveUpload.
        waitUntil: platform?.ctx?.waitUntil?.bind(platform.ctx),
    });
}
