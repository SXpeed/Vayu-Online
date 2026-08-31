# Architecture

The site is split across three public origins behind Cloudflare, plus one
private Worker. Every box in the diagram below maps to a fixed place in this
repository — new code goes where its box lives, nowhere else.

```
CLOUDFLARE
                             │
                    WAF / Rate Limit
                             │
        ┌────────────────────┼─────────────────────┐
        │                    │                     │
        ▼                    ▼                     ▼
 vayuindia.com         api.vayuindia.com    admin.vayuindia.com
 Storefront              Public API              Admin UI
        │                    │                     │
        │                    ▼                     ▼
        │              ┌───────────┐          Admin API
        │              │ Auth      │              │
        │              └───────────┘              │
        │                    │                     │
        └────────────────────┼─────────────────────┘
                             │
                       Internal Services
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
          Database        Payment          Cache
                           Worker
                             │
                          Razorpay
```

## Box → file mapping

### `CLOUDFLARE` / `WAF / Rate Limit` — the edge

The zone-level front door. Not code in this repo beyond the per-Worker
configs; the WAF and rate-limit rules live in the Cloudflare dashboard
(see "Rate limiting" in `README-cloudflare.md`). Each Worker's edge
configuration is its `wrangler*.jsonc` at the repo root:

| Origin | Worker config | Built entry |
|---|---|---|
| vayuindia.com (storefront) | `wrangler.jsonc` | `.svelte-kit/cloudflare/_worker.js` (adapter-cloudflare) |
| api.vayuindia.com | `wrangler.api.jsonc` | `.workers/api/worker.js` |
| admin.vayuindia.com | `wrangler.admin.jsonc` | `.workers/admin/worker.js` |
| *(no origin — private)* | `wrangler.payments.jsonc` | `.workers/payments/worker.js` |

### `vayuindia.com` — the Storefront

Prerendered SvelteKit static pages served off Workers Assets. The
storefront never touches the services directly — every dynamic call goes
to the API app over the network.

- `apps/storefront/` — SvelteKit hooks: www→apex fold, `/api/*` proxy to
  the API service binding, redirects-table 404 handling.
- `app/` — the SvelteKit app itself: `app/routes/pages/*` (storefront
  pages), `app/lib/` (storefront front-end), `app/lib/server/*` (re-export
  shims into `#shared/` and `#services/` so the monolith build still works).
- `public/` — static assets served off the edge (images, css, fonts).

### `api.vayuindia.com` — the Public API

The only app that talks to the internal services directly. CORS pre-flight
gate → dispatcher → cache stamp, in that order.

- `apps/api/` — the standalone fetch handler and its SvelteKit entry.
- `cloudflare/routes/` — route tables and the CORS gate:
  `public.js` (public routes), `admin.js` (admin routes),
  `tables.js` (the `METHOD /path` tables), `cors.js`.

### `Auth` — inside the API app

- `services/auth/` — sessions (`sessions.js`), Better Auth
  (`better-auth.js`), Google sign-in (`google.js`).

### `admin.vayuindia.com` — the Admin UI and the Admin API

The panel is bundled into the Worker (never static assets — the session
gate must run first). The Admin API routes themselves live in the API app
(`cloudflare/routes/admin.js`); the admin Worker forwards `/api/*` to the
API Worker over a service binding, so `/api/admin/*` has no
browser-reachable surface on the admin origin.

- `apps/admin/` — the standalone Worker and its SvelteKit entry.
- `app/admin-ui/` — the vanilla-JS panel source, bundled at build time by
  the `virtual:admin-ui` plugin in `scripts/build-workers.mjs`.

### `Internal Services`

Called only by the API app. One directory per domain:

- `services/products/` — catalogue, storefront reads, admin writes.
- `services/orders/` — checkout, admin order management, insights.
- `services/inventory/` — stock levels.
- `services/users/` — accounts, wishlist, admin users.
- `services/payments/` — the client half of the payment contract.
- `shared/` — what the services and apps share:
  `database/` (the `Store` over D1), `schemas/` (zod request/response
  shapes), `utils/` (`http.js`, `cache.js`, `slug.js`), `config/`,
  `constants/`, `types/`.
- `cloudflare/bindings/` — D1 binding setup and schema helpers.
- `migrations/` — the D1 schema (`npm run db:migrate`).

### `Database` — D1

`migrations/` (schema), `cloudflare/bindings/db.js`,
`shared/database/store.js`. Bound to the storefront, API and admin
Workers; never to the payments Worker.

### `Cache`

`shared/utils/cache.js` — the edge cache for `/api/catalogue` and
`/api/nav` via the Cache API, purged on admin writes. Used by the API app.

### `Payment Worker` → `Razorpay`

- `apps/payments/worker.js` — the isolated Worker: no public route, no
  database, reachable only over the API Worker's `PAYMENTS` service
  binding. It holds `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and
  `RAZORPAY_WEBHOOK_SECRET`, and nothing else does.
- `services/payments/razorpay.js` — the Razorpay client the Worker runs
  (order creation, signature verification, refunds, status).
- `services/payments/index.js` — the API-app half: calls the Worker over
  the binding, and receives the `/payments/webhook`.

## Request paths

- **Storefront customer** → `vayuindia.com` (static HTML) → relative
  `/api/*` fetch → in production rewritten/proxied to
  `api.vayuindia.com` (credentialed, CORS-named), in dev forwarded over
  the `API` service binding.
- **Admin** → `admin.vayuindia.com` (panel behind the session gate) →
  same-origin `/api/*` → admin Worker → `API` service binding (with
  `INTERNAL_SECRET`) → admin routes in the API app.
- **Razorpay** → webhook to the API app's `/payments/webhook` → signature
  verified by the payments Worker over the `PAYMENTS` binding → verdict
  back to the API app, which alone writes to D1.

## Build and deploy

```bash
npm run build             # storefront (SvelteKit → adapter-cloudflare)
node scripts/build-workers.mjs        # api, admin, payments (esbuild)
npm run deploy            # storefront monolith
npm run deploy:api        # api.vayuindia.com
npm run deploy:admin      # admin.vayuindia.com
npm run deploy:payments   # the private Razorpay Worker
```

## Where new code goes

- A new public or admin endpoint → `cloudflare/routes/tables.js` + a
  handler in the right `services/*/` directory. It becomes reachable on
  `api.vayuindia.com` automatically; the storefront and admin apps need
  no change.
- Storefront page or front-end logic → `app/routes/pages/` or `app/lib/`.
- Admin panel view → `app/admin-ui/views/` (bundled into the admin Worker
  at the next `build-workers` run).
- Something shared by two or more apps → `shared/`. App-specific code
  never imports another app's files; only `#shared/*`, `#services/*` and
  `#cloudflare/*` cross app boundaries.
