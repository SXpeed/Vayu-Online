/**
 * Vayu — the admin panel on the storefront origin, behind the same two gates
 * as the split Worker.
 *
 * THIS IS THE SECOND DOOR, and that is the thing to keep in mind when
 * changing it. The panel is reachable at admin.vayuindia.com (apps/admin/
 * worker.js) and here at vayuindia.com/admin, and a lock fitted to one of
 * them is not fitted to the panel — it is fitted to one of two ways in.
 * Cloudflare Access on the admin subdomain alone would have left this path
 * wide open, so the Access gate runs here too, and the routing decision that
 * follows it is the shared one both mounts read from.
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
 * twelve files), so the only way to read one is through the checks below.
 */

import { error, redirect } from '@sveltejs/kit';
import { Store } from '#lib/server/db.js';
import { currentAdmin } from '#lib/server/sessions.js';
import { accessGate } from '#services/auth/access.js';
import { adminRoute, contentTypeFor, PANEL_CACHE_CONTROL } from '#services/auth/admin-gate.js';
import optionsSource from '#lib/options.js?raw';
import curatedSource from '#shared/content/curated-spaces.js?raw';
import insideSource from '#shared/content/inside-vayu.js?raw';
import artistSource from '#shared/content/home-artist.js?raw';
import artistPageSource from '#shared/content/artist-page.js?raw';
import contactSource from '#shared/content/contact.js?raw';

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
const SHARED = {
    'shared/options.js': optionsSource,
    // The Curated Spaces page as it ships. The panel seeds its editor from
    // this document and the storefront falls back to it, so both sides show
    // the same words when nothing has been saved yet.
    'shared/curated-spaces.js': curatedSource,
    // The home page's Inside Vayu block as it ships, and the order the three
    // sources win in. The storefront paints by it and the panel's card reads
    // it to say what is on the page — one copy, so the panel cannot describe
    // a block the page no longer has.
    'shared/inside-vayu.js': insideSource,
    // The artist band under it, on the same terms.
    'shared/home-artist.js': artistSource,
    // The artist index page's own copy, so the Artists screen can show the
    // shop what is on that page rather than a set of empty fields.
    'shared/artist-page.js': artistPageSource,
    // The phone, the email and the four social links, plus the shipped
    // defaults behind them. Both sides need contactEffective(): the footer
    // paints by it and the panel's card fills its fields from it, so the
    // shop is shown the values the page is actually printing rather than
    // empty boxes it has to guess the meaning of.
    'shared/contact.js': contactSource,
};

function send(file) {
    const body = SHARED[file] ?? FILES[`/app/admin-ui/${file}`];
    if (body === undefined) error(404, 'Not found');

    return new Response(body, {
        headers: {
            'Content-Type': contentTypeFor(file),
            'Cache-Control': PANEL_CACHE_CONTROL,
        },
    });
}

export async function GET({ request, platform, url }) {
    const env = platform?.env;
    if (!env?.DB) error(503, 'Bindings unavailable.');

    // Zero Trust first, and it returns its own Response rather than throwing
    // a SvelteKit error: a 403 from Access is not a page of this site, and
    // dressing it as one would invite the reader to try signing in.
    const denied = await accessGate(env, request, (reason) => {
        console.log(`access denied: ${reason} ${request.method} ${url.pathname}`);
    });
    if (denied) return denied;

    const store = new Store(env);
    const signedIn = await currentAdmin(store, request);

    // One policy, shared with apps/admin/worker.js — see
    // services/auth/admin-gate.js for what each branch is protecting.
    const route = adminRoute(url.pathname, signedIn);
    if (route.kind === 'redirect') redirect(302, route.to);
    if (route.kind === 'notFound') error(404, 'Not found');
    return send(route.file);
}
