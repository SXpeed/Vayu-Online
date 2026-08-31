/**
 * Vayu — Cloudflare bindings, per app.
 *
 * One file per app declaring the bindings it actually uses, so the wrangler
 * config and the code agree on what each Worker is allowed to see.
 *
 *   DB          D1 database — the single shared database connection.
 *   UPLOADS     R2 bucket — product images and uploads.
 *   ASSETS      Workers Assets — only the storefront and admin apps.
 *
 * Service bindings (the three apps calling each other) are declared in
 * wrangler.toml under [services], not here.
 */

/**
 * Pull the bindings off a Workers `env`. Every service reads `env.DB`
 * through `Store` (see shared/database/store.js); this is the one place the
 * raw binding names are enumerated so a rename is a single change.
 */
export function bindings(env) {
  return {
    db: env.DB,
    uploads: env.UPLOADS,
    assets: env.ASSETS,
    ctx: env.ctx,
  };
}

/**
 * The env keys each app needs, for asserting a dev session has bindings.
 * `wrangler dev` provides DB/UPLOADS; `vite dev` does not, which is why
 * the API guards on `env?.DB`.
 */
export const REQUIRED = {
  storefront: ['DB', 'UPLOADS', 'ASSETS'],
  admin: ['DB', 'UPLOADS', 'ASSETS'],
  api: ['DB', 'UPLOADS'],
};
