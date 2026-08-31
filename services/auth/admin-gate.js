/**
 * Vayu — what an /admin request is allowed to get.
 *
 * The panel is served from two places and always has been: the monolith
 * storefront (vayuindia.com/admin, app/routes/admin/[...path]) and the split
 * admin Worker (admin.vayuindia.com, apps/admin/worker.js). Both had their
 * own copy of this decision — the same four branches, the same PUBLIC set,
 * the same content-type table, written twice.
 *
 * Two copies of a gate is one gate and one liability. They had already
 * drifted in a small way (the Worker's copy sliced '/admin/' off a path it
 * had only checked with startsWith('/admin'), so '/adminfoo' became a lookup
 * for the file 'oo'), and the next drift is the one that leaves a door open
 * on one host and not the other. The policy lives here now; each side keeps
 * only its own plumbing, because that genuinely differs — SvelteKit throws
 * `redirect()` and `error()`, the Worker returns Responses.
 */

/**
 * The sign-in page's own stylesheet cannot sit behind the sign-in check, or
 * the login screen is permanently unstyled: the browser is redirected to
 * /admin/login when it asks for the CSS and handed HTML where it wanted a
 * stylesheet. A stylesheet gives nothing away — it is the view modules and
 * the API shapes inside them that the gate exists to protect.
 */
export const ADMIN_PUBLIC_FILES = new Set(['admin.css']);

const TYPES = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  map: 'application/json; charset=utf-8',
};

export const contentTypeFor = (file) =>
  TYPES[String(file).split('.').pop()] || 'application/octet-stream';

/**
 * The panel is per-admin and session-gated. A shared cache holding any of it
 * would serve one admin's view to the next request; it is also small enough
 * that revalidating costs nothing.
 */
export const PANEL_CACHE_CONTROL = 'private, no-store';

/**
 * What this path should get, given whether the caller has an admin session.
 *
 * Pure — no bindings, no I/O, no framework — so both entry points can share
 * it and so it can be reasoned about on its own. Returns exactly one of:
 *
 *   { kind: 'send',     file }   hand over this file from the bundle
 *   { kind: 'redirect', to }
 *   { kind: 'notFound' }
 */
export function adminRoute(pathname, signedIn) {
  if (pathname === '/admin' || pathname === '/admin/') {
    return signedIn
      ? { kind: 'send', file: 'index.html' }
      : { kind: 'redirect', to: '/admin/login' };
  }

  // Anything that merely starts with the five characters "/admin" is not an
  // admin path. Checked before the slice, which is the bug that motivated
  // pulling this out: '/adminfoo'.slice('/admin/'.length) is 'oo'.
  if (!pathname.startsWith('/admin/')) return { kind: 'notFound' };

  if (pathname === '/admin/login') {
    return signedIn
      ? { kind: 'redirect', to: '/admin' }
      : { kind: 'send', file: 'login.html' };
  }

  const file = pathname.slice('/admin/'.length);

  if (!signedIn && !ADMIN_PUBLIC_FILES.has(file)) {
    return { kind: 'redirect', to: '/admin/login' };
  }

  // No traversal out of the bundle. Both call sites index a plain object, so
  // a '../' would simply miss — this states the intent rather than leaving
  // it to that accident.
  if (!file || file.includes('..')) return { kind: 'notFound' };

  return { kind: 'send', file };
}
