# Vayu on Cloudflare

The site runs as a single Worker with three bindings: **D1** for the data,
**R2** for uploaded images and backups, and **Workers Assets** for the
static site.

```
app/             the SvelteKit app: routes/, lib/ (storefront + server), admin-ui/
public/          static assets served off the edge (images, css, fonts)
migrations/      the D1 schema
scripts/         build, migrate, smoke/verify tests, admin utilities
```

## Going live

Two things happen once, by hand, and then every push to `main` deploys itself.

### Once: the account

```bash
npm install
npx wrangler login
```

**1. Name the resources.** The configs must name the D1 database and R2
bucket that actually exist on the account. Check what you have:

```bash
npx wrangler d1 list
npx wrangler r2 bucket list
```

Create them if they are missing, or edit the configs to match what is there.
`database_name` and `bucket_name` appear in more than one config and every
copy has to agree:

```bash
npx wrangler d1 create vayuindia-db
npx wrangler r2 bucket create vayuindia-storage
```

| file | what to set |
| --- | --- |
| `wrangler.jsonc` | `database_id`, `database_name`, `bucket_name` |
| `wrangler.api.jsonc` | `database_id`, `database_name`, `bucket_name` |
| `wrangler.admin.jsonc` | `database_id`, `database_name` |

`database_id` ships as `REPLACE_WITH_YOUR_DATABASE_ID` on purpose — a real id
in the repo is an invitation to deploy someone else's data.

**2. Build the schema.** Nothing works against an empty database, and the
deploy refuses to run while the remote schema is behind — that guard is
`scripts/check-migrations.mjs` and it is deliberate.

```bash
npm run db:migrate:remote
```

**3. Set the secrets, per Worker.** They are not shared between Workers, and
`.dev.vars` is local only — `wrangler deploy` does not upload it. Copy
`.dev.vars.example` for the full list and which Worker needs which.

```bash
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put INTERNAL_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID          # optional
npx wrangler secret put GOOGLE_CLIENT_SECRET      # optional

npx wrangler secret put BETTER_AUTH_SECRET -c wrangler.api.jsonc
npx wrangler secret put INTERNAL_SECRET    -c wrangler.api.jsonc

npx wrangler secret put RAZORPAY_KEY_SECRET     -c wrangler.payments.jsonc
npx wrangler secret put RAZORPAY_WEBHOOK_SECRET -c wrangler.payments.jsonc
```

`INTERNAL_SECRET` must be byte-identical everywhere it is set. A mismatch is
not a loud failure — internal calls simply start being rejected.

**4. Make an admin.** The database starts with no accounts, so `/admin` is
unreachable until one exists.

```bash
node scripts/create-admin.mjs --url=https://<worker>.<subdomain>.workers.dev
```

**5. Attach the domain.** Uncomment the `routes` block in `wrangler.jsonc`
and use `custom_domain: true`, not a bare pattern — a pattern without it
needs a DNS record you have not made, and the deploy fails with a routing
error that does not say so.

### Once: GitHub

Add two repository secrets under **Settings → Secrets and variables →
Actions**:

| secret | where it comes from |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | dash.cloudflare.com/profile/api-tokens — "Edit Cloudflare Workers" template, plus D1:Edit and R2:Edit |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers → Account ID |

The OAuth token `wrangler login` writes locally is **not** usable in CI; the
workflow needs an API token created explicitly.

The application's own secrets are not set in CI. They live on the Workers
and survive every deploy — putting them in GitHub would mean a second copy
to keep in step.

### After that: every push

`.github/workflows/deploy.yml` runs on push to `main`, and from the Actions
tab via *Run workflow*. It checks migrations, builds, then deploys in
dependency order — **payments → api → admin → storefront** — because the
Workers reach each other through service bindings and a binding to a Worker
that does not exist yet fails the deploy. The storefront goes last, so a
failure earlier leaves the live site on its previous build.

To deploy by hand instead:

```bash
npm run deploy:payments
npm run deploy:api
npm run deploy:admin
npm run deploy
```

### Check it

```bash
curl -sSI https://vayuindia.com | head -1
curl -sS  https://vayuindia.com/api/catalogue | head -c 200
```

The second call is the one that matters. It is the request that reaches D1,
and it is the failure this project has actually shipped: the prerendered
shell keeps serving while every `/api/catalogue` read 500s, so the shop looks
fine, falls back to the static catalogue and sells nothing.

## Working locally

```bash
npm run db:migrate     # schema into the local D1
npm run dev            # http://127.0.0.1:8787 (or --port 8791)
```

`wrangler dev` runs the real Worker runtime against a local SQLite copy of
D1 and a local R2, so what you see is what deploys.

## The front end

The storefront is a SvelteKit app (under `app/`) prerendered to static HTML and
served off the edge; the admin panel is a small vanilla-JS UI bundled into the
Worker from `app/admin-ui/` and gated behind a session (see
`app/routes/admin/[...path]/+server.js`). `npm run build` runs `vite build` —
the SvelteKit build — which prerenders the pages and emits the Cloudflare Worker
bundle at `.svelte-kit/cloudflare/_worker.js`. Both `npm run dev` and
`npm run deploy` run it first.

Routes live in `app/routes/` (one `+page.svelte` per storefront page under
`pages/*.html/`, plus the `api/[...path]` and `admin/[...path]` endpoints);
shared storefront logic in `app/lib/`; server-only handlers in `app/lib/server/`;
request schemas in `app/lib/schemas/`. Edit those — the build output under
`.svelte-kit/` is regenerated on every build.

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
npx wrangler d1 migrations create vayuindia-db add-something
npm run db:migrate            # local
npm run db:migrate:remote     # production
```

### Backups

D1 keeps 30 days of point-in-time recovery (Time Travel) on paid plans,
which is the real safety net:

```bash
npx wrangler d1 time-travel info vayuindia-db
npx wrangler d1 time-travel restore vayuindia-db --timestamp <iso>
npx wrangler d1 export vayuindia-db --remote --output vayu-backup.sql
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
https://vayuindia.com/api/auth/callback/google
https://<your-worker>.<your-subdomain>.workers.dev/api/auth/callback/google
http://127.0.0.1:8787/api/auth/callback/google
```

That path is Better Auth's own. It is **not** `/api/account/google/callback`,
which is what this section used to say: that belongs to the older hand-rolled
flow in `services/auth/google.js`, still routed but not what the "Continue
with Google" button uses. Registering only the old path is the cause of:

```
Error 400: redirect_uri_mismatch
```

Better Auth builds the `redirect_uri` from `baseURL` + `basePath`, which here
is `PUBLIC_ORIGIN` + `/api/auth`. To read what it actually sends rather than
guess at it:

```bash
curl -sD - -o /dev/null "http://127.0.0.1:8787/api/auth/sign-in/social?provider=google&callbackURL=%2F" | grep -i location
```

The workers.dev host is printed by `npm run deploy`. The local URI must match
`PUBLIC_ORIGIN` in `.dev.vars` to the character, port included: Better Auth
sends the origin it is configured with, not the one the browser happens to be
on, so serving dev on 8791 with `PUBLIC_ORIGIN` on 8787 sends Google the 8787
callback and drops the shopper on a dead port after they approve.

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

`app/lib/server/sessions.js` throttles failed sign-ins per IP, but a Worker runs in
many isolates at once, so that counter is per-isolate and only slows an
attacker down. For a hard cap, add a WAF rate-limiting rule on
`/api/admin/login` and `/api/account/login` in the dashboard.

## Security headers

`_headers` at the project root sets them for everything Workers Assets
serves; the adapter appends its own caching block to it at build time. It
must live at the root — adapter-cloudflare throws if it finds one in
`public/`.

What is set: `X-Frame-Options: DENY` and `frame-ancestors 'none'`
(clickjacking), `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
`Strict-Transport-Security` (a year, subdomains, no `preload`),
`Permissions-Policy` and `Cross-Origin-Opener-Policy:
same-origin-allow-popups`. Every one was chosen because it cannot break a
page that already works.

**The one deliberately left off is a full Content-Security-Policy** naming
`script-src`/`style-src`/`img-src`/`connect-src`. It is the biggest remaining
hardening step and also the one that breaks a live shop if it is guessed at:
Razorpay's checkout, Google Fonts and any analytics tag each need naming, and
a missed source fails as a blank page at the moment somebody is paying. Do it
properly when there is time to:

1. Add `Content-Security-Policy-Report-Only` with the intended policy.
2. Watch real traffic for violations for a week.
3. Promote it to the enforcing header once the report is quiet.

Uploaded files are a separate case and are already handled in code:
`services/media/uploads.js` serves every `/uploads/*` response with
`default-src 'none'; sandbox` and `nosniff`, because the panel accepts SVG
and an SVG served from the shop's own origin is a script unless something
stops it.

## Zero Trust: Cloudflare Access in front of the panel

Optional, off by default, and worth turning on. Without it the admin panel is
a login form on the open internet: the only thing between a stranger and the
shop is one password and the soft throttle above. With it, an unauthenticated
visitor never reaches the login form at all — Access challenges them at the
edge, and the Worker refuses anything that did not come through.

The code half is done and lives in `services/auth/access.js`. It runs on both
mounts of the panel (`admin.vayuindia.com` and `vayuindia.com/admin`) and
verifies the JWT itself rather than trusting that Access ran — which is what
stops a Worker's own `.workers.dev` hostname being a way around the policy.

The dashboard half cannot be done from this repository:

1. **Zero Trust → Access → Applications → Add an application → Self-hosted.**
   Give it both hostnames the panel answers on:

   ```
   admin.vayuindia.com
   vayuindia.com/admin
   ```

2. **Add a policy.** Action *Allow*, and a rule that names who gets in —
   `Emails` with the shop's admins listed is the simplest, and *Emails ending
   in* `@viveksahnidesign.com` the one that survives staff changes.

3. **Pick a login method.** One-time PIN needs no setup and emails a code.
   Google is the better experience if the team already has Workspace, and is
   configured under *Settings → Authentication*.

4. **Copy the Application Audience (AUD) tag** from the application's
   Overview, and note your team name from *Settings → Custom Pages* (the
   subdomain in `https://<team>.cloudflareaccess.com`).

5. **Set both values in `wrangler.jsonc` and `wrangler.admin.jsonc`**, where
   each config already has the block commented out:

   ```jsonc
   "vars": {
     "ACCESS_TEAM_DOMAIN": "your-team",
     "ACCESS_AUD": "5c0e3f...64 hex characters"
   }
   ```

   Neither is a secret — the team name is in every redirect Access issues,
   and the AUD tag identifies an application rather than authorising
   anything — so they belong in the config where a diff shows them, not in
   `wrangler secret put`.

6. **Deploy, then check it from a private window.** You should be bounced to
   the Access login screen before the panel's own login form appears.

**Set both values or neither.** Exactly one is treated as a
misconfiguration and every admin request answers 503 on purpose: a
half-configured Zero Trust gate that quietly waves everyone through is the
failure nobody notices. Locally, both are unset and the gate is off, which is
what `wrangler dev` wants — there is no Access in front of localhost.

The password login stays either way. Access answers *may this person reach
the admin panel*; the session answers *which admin are they, and what may
they do*. Two questions, and losing either gate should not be enough on its
own.

Free for up to 50 users.

## Images: transforming the uploads

Every picture that ships with the site is converted to AVIF and measured at
build time by `scripts/images.mjs`. That cannot touch a picture an admin
uploads months after the build — which, on a product page, is the photograph
the page exists for. Those were served exactly as uploaded: no AVIF, no
resizing, no width or height on the `<img>`.

The `IMAGES` binding closes that gap. `services/media/uploads.js` resizes and
re-encodes on the way out of R2, negotiating AVIF or WebP from the browser's
`Accept` header, and `services/users/admin.js` measures each upload as it
arrives so the markup can state its size. The bytes stay in R2 — nothing is
migrated into Images' own storage, so every `/uploads/…` URL already written
into a product row still means what it meant.

Two things to switch on:

1. The binding, already in `wrangler.jsonc` and `wrangler.api.jsonc`:

   ```jsonc
   "images": { "binding": "IMAGES" }
   ```

2. **Images → Transformations** in the dashboard, enabled for the zone. The
   binding alone is not enough.

Then a request like

```
/uploads/images/chair_1724692000000_1600x1067.webp?w=640
```

comes back as a 640px AVIF to a browser that accepts one, cached at the edge
and marked immutable.

Billing is per unique transformation, which is why `shared/content/variants.js`
holds an allow-list of nine widths rather than accepting any integer — `?w=`
open to the integers is an invitation to pay for four thousand encodings of
the same photograph.

**Nothing here is required.** Remove the binding, or leave transformations
off, and every request falls back to the original bytes. The pictures just
weigh more.

**Stream is not used and is not wanted.** There is no video anywhere on this
site, so the other half of that dashboard card would be cost for nothing.

## Legacy

The old Node server (`server.cjs`, `server/`, `admin/server/`) and the
pre-SvelteKit Worker (`src/worker.js`, `src/partials/`) have been removed: the
SvelteKit app under `app/` (routes + `app/lib/server`) is the single
implementation now. The original JSON document store (`admin/data/db.json`) and
its one-time importer (`scripts/import-db.mjs`) have been removed too — D1 is
the database of record, and a fresh account starts with an empty catalogue that
you populate through the admin panel.
