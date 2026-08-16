# Vayu on Cloudflare

The site runs as a single Worker with three bindings: **D1** for the data,
**R2** for uploaded images and backups, and **Workers Assets** for the
static site.

```
public/          the site itself — the only directory served publicly
src/             the Worker: routing, D1 access, every API route
migrations/      the D1 schema
scripts/         the db.json → D1 importer
admin/data/      the old JSON store, kept as the import source
admin/server/    the old Node server, superseded by src/ (see "Legacy")
```

## First deploy

You need a Cloudflare account and `npx wrangler login` once.

```bash
npm install

# 1. Create the database, then paste the printed id into wrangler.jsonc
#    (d1_databases[0].database_id, replacing REPLACE_WITH_DATABASE_ID).
npx wrangler d1 create vayu-db

# 2. Create the bucket for uploads and backups.
npx wrangler r2 bucket create vayuindia

# 3. Build the schema.
npm run db:migrate:remote

# 4. Move the existing data in. Safe to re-run; passwords come across
#    untouched, so every admin and customer sign-in keeps working.
npm run db:import:remote

# 5. Ship it.
npm run deploy
```

## Working locally

```bash
npm run db:migrate     # schema into the local D1
npm run db:import      # data into the local D1
npm run dev            # http://localhost:8788
```

`wrangler dev` runs the real Worker runtime against a local SQLite copy of
D1 and a local R2, so what you see is what deploys.

## The front end

The storefront is static HTML served off the edge, but the HTML is built,
not hand-maintained. `npm run build` does two things and both `npm run dev`
and `npm run deploy` run it first:

1. **Bundles `src/client` into `public/assets/js`** with esbuild.
   `app.js` is the one script every page loads. Everything else — the page
   modules in `src/client/pages`, plus search, Lenis, analytics and the
   offline catalogue — is a separate self-contained bundle fetched on
   demand from `/assets/js/pages/` and `/assets/js/lazy/`.
2. **Rewrites the pages in `public/`**: splices `src/partials/header.html`
   and `footer.html` into every document between `<!-- @vayu:header -->`
   markers, stamps `<body data-page="…">`, points the stylesheet at a fresh
   content hash, and splices the generated `@font-face` rules into
   `public/css/styles.css`.

The generated JS is gitignored; the rewritten HTML is committed, so a clone
serves correctly without a build. Edit `src/partials/*` — never the copies
inside a page — and re-run the build.

### Why it is shaped this way

The site used to load one 2 KB script that loaded nine more, one of which
fetched the header and footer over HTTP and another of which blocked on
`/api/catalogue` before anything could paint. Lighthouse measured a
critical path about five levels deep. The tree it builds now is:

```
HTML
├── /css/styles.css
├── two preloaded .woff2 faces
├── /assets/js/app.js
└── /api/nav            (or /api/catalogue on the shop pages)
```

Two rules keep it that way, and both are easy to undo by accident:

* **`app.js` must stay self-contained.** The bundles are built with code
  splitting *off*. Turning it on makes esbuild hoist whatever `app.js`
  shares with a page module into shared chunks that `app.js` then statically
  imports — six more requests one level down, which is the old waterfall
  again. The cost of keeping it off is a few duplicated kilobytes of
  stateless helpers per page bundle.
* **Nothing in `app.js`'s static graph may reach the store's data or the
  Lenis vendor build.** `src/client/data/store.js` keeps its state on
  `window` so the duplicated copies in each bundle agree; `core/scroll.js`
  exists so `app.js` can scroll the page without pulling Lenis in.

### Fonts

Cormorant Garamond, Jost and Pinyon Script are self-hosted in
`public/assets/fonts` (SIL Open Font License). `npm run fonts` re-downloads
them from Google and regenerates `fonts.css`, which the build splices into
`styles.css`. Only the latin and latin-ext subsets are kept — latin-ext is
not optional, it carries the rupee sign every price is written with. Two
faces are preloaded; the rest are discovered from the stylesheet.

## How requests are routed

`wrangler.jsonc` gives the Worker only four route patterns; everything else
is served straight from the edge without waking it:

| Route | Handled by |
|---|---|
| `/api/*` | `src/worker.js` → storefront, accounts, admin API |
| `/assets/js/*` | Workers Assets — built output, do not edit |
| `/admin`, `/admin/*` | the session gate, then the panel's files |
| `/uploads/*` | R2 |
| everything else | Workers Assets, straight from `public/` |

`html_handling` is off, because every link on this site is written out in
full (`/pages/cart.html`). The default would redirect those to
extensionless URLs and cost a 307 on every navigation.

### Caching the public endpoints

`/api/nav` and `/api/catalogue` are the same for every visitor, so
`src/cache.js` stores them at the edge through the Cache API. A
`Cache-Control` header alone would not do it: a response a Worker
*generates* is not put in Cloudflare's cache the way a static asset is, so
the header only ever reached the browser and every cold visitor cost a
round trip to D1.

`/api/nav` is the small one — categories and the editable site copy, about
3.5 KB against the catalogue's 18 KB — and is what a page with no products
on it asks for.

Invalidation is on write: any non-GET admin route that succeeds purges both
entries (`purgeCatalogueCache` in `src/worker.js`). That purge is
colo-local, which is why the responses also carry a bounded `s-maxage` —
whoever made the edit sees it at once, and every other colo catches up
within half an hour. Nothing personalised goes through this path: the
helper refuses any request carrying a cookie, and `/api/account/*` and
`/api/admin/*` are not in its allowlist.

## The database

`migrations/0001_init.sql` is the schema. The JSON store's nested arrays
each became a table:

| Was, in db.json | Is, in D1 |
|---|---|
| `product.gallery`, `.variants`, `.categories`, `.tags` | `product_gallery`, `product_variants`, `product_categories`, `product_tags` |
| `order.items`, `.timeline` | `order_items`, `order_timeline` |
| `customer.addresses`, `.tags` | `addresses`, `customer_tags` |
| `coupon.restrictTo`, `.uses` | `coupon_restrictions`, `coupon_uses` |
| `analytics.days[day].paths / .products / .sids` | `analytics_paths`, `analytics_products`, `analytics_visitors` |
| `sessions` + `customerSessions` | one `sessions` table, told apart by `kind` |
| `settings`, `content` | `config`, keyed by `(scope, key)` |

Three things stayed documents, deliberately: a journal story's paragraphs,
a live cart snapshot, and the settings/content values. They are read whole,
written whole, and never filtered on from the inside.

Two properties worth keeping in mind if you extend it:

- **`products.sort_order` is the legacy `idx`.** Every `?cat=&idx=` link,
  cart line and old order refers to a product by its position in the
  category listing. The importer seeds it from the JSON array order, so
  existing links keep pointing at the same product.
- **Counters are UPDATEs, never read-modify-write.** A page view is one
  UPSERT of one row. Do not reintroduce "read the row, change it in JS,
  write it back" — that is what made the old store lose concurrent writes.

### Changing the schema

Add a new numbered file in `migrations/` (never edit an applied one):

```bash
npx wrangler d1 migrations create vayu-db add-something
npm run db:migrate            # local
npm run db:migrate:remote     # production
```

### Backups

D1 keeps 30 days of point-in-time recovery (Time Travel) on paid plans,
which is the real safety net:

```bash
npx wrangler d1 time-travel info vayu-db
npx wrangler d1 time-travel restore vayu-db --timestamp <iso>
npx wrangler d1 export vayu-db --remote --output vayu-backup.sql
```

The panel's **Back up now** also writes a full JSON dump to R2 under
`backups/`, newest 20 kept — that is the copy you can download and read.

## Sign in with Google

The code is deployed and dormant: with no credentials set, `/api/account/me`
reports `google: false` and the buttons never render. Three steps turn it on.

**1. Make an OAuth client** at
<https://console.cloud.google.com/apis/credentials> → *Create credentials* →
*OAuth client ID* → *Web application*. You will be asked to configure the
consent screen first: External, app name "Vayu", your support email, and the
`openid`, `email`, `profile` scopes (all non-sensitive, so no verification
review is needed).

Add these **Authorised redirect URIs** — they must match to the character:

```
https://vayu-site.vayuxdesign.workers.dev/api/account/google/callback
http://localhost:8788/api/account/google/callback
```

Add your custom domain's callback too, the day you point one at the Worker.

**2. Give the Worker the credentials.** The id is public, the secret is not:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID       # paste the client id
npx wrangler secret put GOOGLE_CLIENT_SECRET   # paste the client secret
```

For local development put the same pair in `.dev.vars` (gitignored):

```
GOOGLE_CLIENT_ID=…apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=…
```

**3. Redeploy** (`npm run deploy`). The button appears by itself.

### What Google gives us

For `openid email profile` the id_token carries `sub`, `email`,
`email_verified`, `name`, `given_name`, `family_name`, `picture` and
`locale`. All of it is stored on the customer row and shown on the account
page. Google has **no phone number or postal address** to give — no scope
provides them — so checkout still asks for those, which is what the "we
just need these" step is for.

### How accounts join up

`google_sub`, not the email, is the identity: a Google account can change
its address and the link survives. Signing in with Google on an email we
already hold — a guest who once checked out, or a password account — links
the two and keeps the order history. A Google-only account has no password,
so the account page hides the password form and `/api/account/password`
says so plainly.

`GOOGLE_AUTH_ENDPOINT` and `GOOGLE_TOKEN_ENDPOINT` exist only so the flow
can be driven against a stub in testing. Never set them in production.

## Secrets

Razorpay keys currently live in the settings table, entered through the
panel, which is how the Node version worked. If you would rather they were
not in the database:

```bash
npx wrangler secret put RAZORPAY_KEY_SECRET
```

and read `env.RAZORPAY_KEY_SECRET` in `src/checkout.js` instead of
`settings.payment.razorpayKeySecret`.

## Rate limiting

`src/sessions.js` throttles failed sign-ins per IP, but a Worker runs in
many isolates at once, so that counter is per-isolate and only slows an
attacker down. For a hard cap, add a WAF rate-limiting rule on
`/api/admin/login` and `/api/account/login` in the dashboard.

## Legacy

`server.cjs`, `server/` and `admin/server/` are the original Node server
and its JSON store. Nothing on Cloudflare uses them. They still run —
`npm run legacy`, serving `public/` on port 3000 against
`admin/data/db.json` — which is useful only for comparing behaviour during
the migration. Once you are happy with the deployment, all three can be
deleted along with `admin/data/`.

(They are CommonJS while `src/` is ESM, which is why `server.js` became
`server.cjs` and why `server/` and `admin/server/` each carry a one-line
`package.json` marking them `"type": "commonjs"`.)

**They do not share data with the deployed site.** After the first
`db:import:remote`, D1 is the database of record; edits made through the
legacy server go into db.json and are not seen by Cloudflare.
