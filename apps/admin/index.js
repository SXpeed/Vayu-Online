/**
 * Vayu — admin app (admin.vayuindia.com).
 *
 * The admin panel. Its files are the vanilla-JS SPA that was bundled into
 * the monolith's Worker (app/admin-ui/*); they stay bundled into THIS
 * Worker, served only behind the session gate — a Worker cannot read from
 * disk, and serving them as static assets would hand the view modules to
 * anyone who asked.
 *
 * The panel talks to the API app at api.vayuindia.com for every read and
 * write. In production the panel's `lib/api.js` calls an absolute
 * `https://api.vayuindia.com/api/admin/*` URL with credentials. In dev the
 * admin Worker proxies /api/* to the API service binding, so the panel's
 * existing relative fetch keeps working unchanged.
 */

import { error, redirect } from '@sveltejs/kit';
import { Store } from '#shared/database/store.js';
import { currentAdmin } from '#services/auth/sessions.js';
import optionsSource from '#lib/options.js?raw';
import contactSource from '#shared/content/contact.js?raw';

/** Eagerly bundled: a Worker cannot lazy-load a file at request time. */
const FILES = import.meta.glob('/app/admin-ui/**/*', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** Modules the panel shares with the storefront, re-exposed under /admin/shared/. */
const SHARED = {
  'shared/options.js': optionsSource,
  'shared/contact.js': contactSource,
};

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
    headers: { 'Content-Type': contentType(file), 'Cache-Control': 'private, no-store' },
  });
}

export async function GET({ request, platform, url }) {
  const env = platform?.env;
  if (!env?.DB) error(503, 'Bindings unavailable.');

  // Proxy /api/* to the API service binding so the panel's relative fetch
  // calls keep working without a front-end rewrite.
  if (url.pathname.startsWith('/api/') && env.API) {
    const target = new URL(url.pathname + url.search, url.origin);
    return env.API.fetch(target.toString(), new Request(target, request));
  }

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
  const PUBLIC = new Set(['admin.css']);
  if (!signedIn && !PUBLIC.has(file)) redirect(302, '/admin/login');

  if (!file || file.includes('..')) error(404, 'Not found');
  return send(file);
}
