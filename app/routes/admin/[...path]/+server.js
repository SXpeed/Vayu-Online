/**
 * Vayu — the admin panel, behind the session gate.
 *
 * The panel's files are NOT static assets. They used to live in
 * public/admin/ui, which is SvelteKit's static directory, and that put them
 * in the adapter's asset manifest — where the generated Worker short-circuits
 * to `env.ASSETS.fetch(req)` before SvelteKit routing runs:
 *
 *     if (is_static_asset || prerendered.has(pathname) || …)
 *         return env.ASSETS.fetch(req);
 *
 * so /admin/ui/admin.js was handed to anyone who asked and this gate never
 * executed. `run_worker_first` cannot help with that: the short-circuit is
 * inside the Worker, past the point where it applies.
 *
 * They are bundled into the Worker instead, from app/admin-ui (~144 KB over
 * twelve files), so the only way to read one is through the check below.
 */

import { error, redirect } from '@sveltejs/kit';
import { Store } from '#lib/server/db.js';
import { currentAdmin } from '#lib/server/sessions.js';
import optionsSource from '#lib/options.js?raw';

/**
 * Eagerly bundled: a Worker cannot read from disk, and lazy chunks would be
 * separate files the runtime has to resolve at request time.
 */
const FILES = import.meta.glob('/app/admin-ui/**/*', {
    query: '?raw',
    import: 'default',
    eager: true,
});

/**
 * Modules the panel shares with the storefront.
 *
 * The panel's files are shipped as source, not bundled, so a bare `#lib/`
 * specifier in one of them would reach the browser unresolved. Anything both
 * sides need is therefore re-exposed here under /admin/shared/, which keeps
 * one copy of the logic (options.js decides what a combo key *is*; the panel
 * writing one format while the product page reads another is precisely the
 * bug that having two copies would cause) while still importing cleanly with
 * a relative path.
 */
const SHARED = { 'shared/options.js': optionsSource };

const TYPES = {
    html: 'text/html; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8',
    json: 'application/json; charset=utf-8',
    svg: 'image/svg+xml',
};

const contentType = (file) => TYPES[file.split('.').pop()] || 'application/octet-stream';

function send(file) {
    const body = SHARED[file] ?? FILES[`/app/admin-ui/${file}`];
    if (body === undefined) error(404, 'Not found');

    return new Response(body, {
        headers: {
            'Content-Type': contentType(file),
            // The panel is per-session and must never be held by a shared
            // cache; it is also small enough that revalidation costs nothing.
            'Cache-Control': 'private, no-store',
        },
    });
}

export async function GET({ request, platform, url }) {
    const env = platform?.env;
    if (!env?.DB) error(503, 'Bindings unavailable.');

    const store = new Store(env);
    const path = url.pathname;
    const signedIn = await currentAdmin(store, request);

    if (path === '/admin' || path === '/admin/') {
        if (signedIn) return send('index.html');
        redirect(302, '/admin/login');
    }

    if (path === '/admin/login') {
        if (signedIn) redirect(302, '/admin');
        return send('login.html');
    }

    const file = path.slice('/admin/'.length);

    // The sign-in page's own assets cannot sit behind the sign-in check.
    // admin.css is linked by login.html, so gating it redirected the
    // stylesheet request to /admin/login and handed the browser HTML where
    // it wanted CSS — leaving the login screen permanently unstyled. A
    // stylesheet reveals nothing: it is the view modules and their API
    // shapes that the gate below exists to protect.
    const PUBLIC = new Set(['admin.css']);

    if (!signedIn && !PUBLIC.has(file)) redirect(302, '/admin/login');

    // No traversal out of the bundle. The lookup is a plain object index, so
    // a "../" would simply miss — this makes the intent explicit rather than
    // relying on that.
    if (!file || file.includes('..')) error(404, 'Not found');

    return send(file);
}
