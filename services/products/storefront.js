/**
 * Vayu — the public API the storefront calls. No session required;
 * everything here is either read-only or append-only, and each writer
 * clamps what it stores so a hostile caller cannot grow the database
 * without bound.
 *
 * The analytics beacon is the part that changed most in the move to D1.
 * It used to read the whole day document, mutate it and write the file
 * back; now each event is one or two UPSERTs of one row, which is both
 * cheaper and safe when two visitors are counted at the same instant.
 */

import { json, ok, badRequest, notFound, parseCookies } from '#shared/utils/http.js';
import { now, today } from '#shared/database/store.js';
import { currentCustomer, CUSTOMER_COOKIE } from '#services/auth/sessions.js';
import {
  loadProducts, loadCategories, toLegacyCatalogue, toLegacyTaxonomy,
  productById, productByCatIdx, sweepScheduled, loadShippingPresets,
} from './catalogue.js';

const EMAIL_RE = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/;

/* ---------- catalogue ---------- */

/**
 * Public, identical for everyone and read on a hot path, so both endpoints
 * below are cached at the edge by src/cache.js. `s-maxage` is what the edge
 * honours; `max-age` is the visitor's own browser. An admin write purges
 * both immediately (see the admin dispatch in src/worker.js), so the
 * stale-while-revalidate window is a safety net rather than the mechanism.
 */
const CATALOGUE_CACHE = 'public, max-age=60, s-maxage=1800, stale-while-revalidate=86400';

/**
 * The menus, the footer columns and the announcement bar — and nothing
 * else.
 *
 * This endpoint exists because every page on the site wants the category
 * list, and until now the only way to get it was /api/catalogue, which
 * carries every product and every gallery image path with it. A page with
 * no products on it was downloading the entire shop to put six words in a
 * menu.
 */
export async function nav({ store }) {
  const [categories, content, settings] = await Promise.all([
    loadCategories(store),
    store.config('content'),
    store.settings(),
  ]);

  return json(200, {
    categories: toLegacyTaxonomy(categories),
    content,
    // Here as well as on /api/catalogue, because the cart is the page that
    // needs it and the cart does not fetch the catalogue: it is not in
    // CATALOGUE_ROUTES (app/routes/+layout.svelte), so it gets /api/nav and
    // nothing else. Two numbers on a response every page already makes.
    shipping: {
      freeAbove: settings.freeShippingAbove,
      flat: settings.shippingFlat,
    },
  }, { 'Cache-Control': CATALOGUE_CACHE });
}

/** Everything the storefront needs to render: catalogue, taxonomy, copy. */
export async function catalogue({ store }) {
  await sweepScheduled(store);

  const [products, categories, content, shippingPresets, settings] = await Promise.all([
    loadProducts(store),
    loadCategories(store),
    store.config('content'),
    loadShippingPresets(store),
    store.settings(),
  ]);

  return json(200, {
    products: toLegacyCatalogue(products, categories),
    categories: toLegacyTaxonomy(categories),
    content,
    // Sent as a list rather than resolved onto each product: there are a
    // handful of these and a product only points at one, so inlining the
    // text would repeat the same four sentences once per product per
    // category it appears in.
    shippingPresets,
    // Just the two numbers the cart needs to show a total, picked out by
    // hand rather than spread from `settings`: that object also carries
    // storeEmail, storePhone and payment.razorpayKeySecret, and this
    // response is public and edge-cached.
    //
    // `zones` is deliberately not here. A zone rate is chosen by PIN code
    // and the cart has no PIN field, so the cart can only ever show the flat
    // case; checkout.js resolves the real rate server-side once an address
    // exists. Sending zones would let the cart imply a precision it does
    // not have.
    shipping: {
      freeAbove: settings.freeShippingAbove,
      flat: settings.shippingFlat,
    },
  }, { 'Cache-Control': CATALOGUE_CACHE });
}

/**
 * The press coverage, for /pages/press.html.
 *
 * Its own endpoint rather than a field on /api/catalogue: the press page
 * sells nothing, and the catalogue is the whole shop. Fetching it to draw
 * four articles would download every product to render a page that lists
 * none — the same complaint /api/nav was split out to answer.
 *
 * An empty table is not an error. The page ships with the same list as a
 * static array and falls back to it, so this returning [] leaves the page
 * exactly as it was before anything was typed into the admin panel.
 */
export async function press({ store }) {
  const rows = await store.all('SELECT * FROM press ORDER BY sort_order, rowid');
  return json(200, { press: rows.map(pressRow) }, { 'Cache-Control': CATALOGUE_CACHE });
}

/** A press row in the shape app/lib/data/press-data.js exports. */
export const pressRow = (p) => ({
  id: p.id,
  featured: !!p.featured,
  verified: !!p.verified,
  source: p.source,
  headline: p.headline,
  byline: p.byline,
  date: p.date,
  quote: p.quote,
  quoteAttribution: p.quote_attribution,
  snippet: p.snippet,
  image: p.image,
  alt: p.alt,
  url: p.url,
});

/**
 * The programme — every show at both houses, current first.
 *
 * Its own endpoint for the same reason as /api/press: the venue pages, the
 * event pages and the MENU panel all want the shows and none of them wants
 * the catalogue. The storefront falls back to the static list in
 * app/lib/data/events.js when this returns nothing, so an empty table looks
 * like the site did before the panel could edit it.
 *
 * Shaped as venues carrying events, which is what every consumer already
 * expects — data/events.js exported exactly this.
 */
export async function events({ store }) {
  const rows = await store.all(
    'SELECT * FROM events ORDER BY venue, current DESC, sort_order, rowid');

  const byVenue = new Map();
  for (const row of rows) {
    if (!byVenue.has(row.venue)) byVenue.set(row.venue, []);
    byVenue.get(row.venue).push(eventRow(row));
  }

  return json(200, {
    venues: VENUES.map(v => ({ ...v, events: byVenue.get(v.id) || [] })),
  }, { 'Cache-Control': CATALOGUE_CACHE });
}

/**
 * The two houses themselves are not editable: they are the addresses the
 * shop trades from, not content. Their pages exist as routes, so inventing
 * a third venue in the panel would produce events linking nowhere.
 */
const VENUES = [
  {
    id: 'design-for-living',
    name: 'Vayu — Design for Living',
    kind: 'The store',
    href: '/pages/design-for-living.html',
  },
  {
    id: 'gallery-vayu',
    name: 'Gallery Vayu',
    kind: 'The gallery',
    href: '/pages/gallery.html',
  },
];

/** An event row in the shape app/lib/data/events.js exports. */
export const eventRow = (e) => ({
  id: e.id,
  venue: e.venue,
  title: e.title,
  dates: e.dates,
  note: e.note,
  statement: e.statement,
  image: e.image,
  // The phone crop, or '' meaning "use the wide one on phones too".
  // See migrations/0020_event_phone_image.sql.
  imageMobile: e.image_mobile || '',
  alt: e.alt || e.title,
  cta: e.cta,
  secNote: e.sec_note,
  closing: e.closing || '',
  images: safeJson(e.images),
  curated: safeJson(e.curated),
  current: !!e.current,
  // Where the menu card and the "past shows" tiles point. An event always
  // has a page of its own now, which is what makes a finished show worth
  // keeping: it stops being a line in a list and stays a room with photographs.
  href: `/pages/event.html?id=${encodeURIComponent(e.id)}`,
});

const safeJson = (s, fallback = []) => { try { return JSON.parse(s); } catch { return fallback; } };

/**
 * The artists, in the order the index page lists them.
 *
 * Its own endpoint on the same grounds as /api/press and /api/events: the
 * artist index, an artist's own page and (one day) a product page's "by"
 * line all want the people, and none of them wants the catalogue. The
 * storefront falls back to app/lib/data/artists.js when this returns
 * nothing, so an empty table looks like the site did before the panel
 * could edit it.
 */
export async function artists({ store }) {
  const rows = await store.all('SELECT * FROM artists ORDER BY sort_order, rowid');
  return json(200, { artists: rows.map(artistRow) }, { 'Cache-Control': CATALOGUE_CACHE });
}

/** An artist row in the shape app/lib/data/artists.js exports. */
export const artistRow = (a) => ({
  id: a.id,
  name: a.name,
  tag: a.tag,
  place: a.place,
  bio: a.bio,
  portrait: a.portrait,
  hero: a.hero || a.portrait,
  heroAlt: a.hero_alt || a.name,
  // Split here rather than in each page: the shop types paragraphs into a
  // textarea, and both the page and the panel's preview want the same
  // reading of what a paragraph is. A run of blank lines is one break.
  story: String(a.story || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean),
  curated: safeJson(a.curated),
  listed: !!a.listed,
  // Empty for an artist with no page of their own, which is what the index
  // card reads to decide whether it is a link at all. A card that animates
  // under the cursor and goes nowhere is a promise the site cannot keep.
  href: a.listed ? `/pages/artist-profile.html?id=${encodeURIComponent(a.id)}` : '',
});

/* ---------- analytics beacon ---------- */

/** Make sure today's row exists, then hand back its key. */
async function ensureDay(store) {
  const day = today();
  await store.run('INSERT INTO analytics_days (day) VALUES (?) ON CONFLICT (day) DO NOTHING', day);
  return day;
}

/** Attribute a product view from /pages/product.html?id=… (or ?cat=&idx=). */
async function creditProductView(store, day, pathname, query) {
  if (!pathname.endsWith('/product.html') || !query) return;
  const params = new URLSearchParams(query);
  const product = params.get('id')
    ? await productById(store, params.get('id'))
    : await productByCatIdx(store, params.get('cat'), Number(params.get('idx')));
  if (!product) return;

  await store.batch([
    store.stmt('UPDATE products SET views = views + 1 WHERE id = ?', product.id),
    store.stmt(
      `INSERT INTO analytics_products (day, product_id, count) VALUES (?, ?, 1)
       ON CONFLICT (day, product_id) DO UPDATE SET count = count + 1`,
      day, product.id,
    ),
  ]);
}

async function recordPageView(store, day, body, sid, customer) {
  const full = String(body.path || '/').slice(0, 300);
  const [pathname, query = ''] = full.split('?');

  const statements = [
    store.stmt('UPDATE analytics_days SET views = views + 1 WHERE day = ?', day),
    store.stmt(
      `INSERT INTO analytics_paths (day, path, count) VALUES (?, ?, 1)
       ON CONFLICT (day, path) DO UPDATE SET count = count + 1`,
      day, pathname,
    ),
    store.stmt('INSERT INTO analytics_recent (t, path, ref) VALUES (?, ?, ?)',
      now(), full, String(body.ref || '').slice(0, 200)),
  ];
  if (sid) {
    statements.push(store.stmt(
      'INSERT INTO analytics_visitors (day, sid) VALUES (?, ?) ON CONFLICT (day, sid) DO NOTHING', day, sid,
    ));
  }

  await store.batch(statements);
  await creditProductView(store, day, pathname, query);

  // Per-customer browsing history — the profile's "Browsing history" and
  // "Favourite categories" panels read this. Only recorded for a signed-in
  // shopper; a guest has no customer row to attach to. Capped at ~200 rows
  // per customer so the log cannot grow without bound.
  if (customer?.id) await recordCustomerView(store, customer.id, pathname, query);
}

/**
 * Append one product/category view to customer_views, then trim that
 * customer's log to the newest 200 rows. A product page resolves to its
 * categories; anything else records the path as context.
 */
async function recordCustomerView(store, customerId, pathname, query) {
  let productId = null;
  let category = '';
  if (pathname.endsWith('/product.html') && query) {
    const params = new URLSearchParams(query);
    const product = params.get('id')
      ? await productById(store, params.get('id'))
      : await productByCatIdx(store, params.get('cat'), Number(params.get('idx')));
    if (product) {
      productId = product.id;
      category = product.categories?.[0]?.slug || params.get('cat') || '';
    }
  } else if (pathname.endsWith('/collection-detail.html') && query) {
    category = new URLSearchParams(query).get('cat') || '';
  }

  await store.batch([
    store.stmt(
      'INSERT INTO customer_views (customer_id, product_id, category, path, t) VALUES (?, ?, ?, ?, ?)',
      customerId, productId, category, pathname, now(),
    ),
    // Keep the newest 200 rows per customer — a DELETE after insert, since
    // a trigger would trip wrangler's migration splitter (see 0008 notes).
    store.stmt(
      `DELETE FROM customer_views WHERE customer_id = ? AND id NOT IN (
         SELECT id FROM customer_views WHERE customer_id = ? ORDER BY t DESC, id DESC LIMIT 200)`,
      customerId, customerId,
    ),
  ]);
}

/**
 * How many distinct terms are kept.
 *
 * Terms grow far more slowly than events did — a shop's vocabulary is
 * small, and a repeat costs nothing now — but the endpoint is public, so
 * "slowly" is not the same as "bounded". Anything past this many, ordered
 * by how often it was searched, is dropped: the tail being discarded is
 * one-off queries nobody repeated, which is also what a flood would look
 * like.
 */
const MAX_SEARCH_TERMS = 2000;

/**
 * One search term, as it is counted rather than logged.
 *
 * Lowercased and whitespace-collapsed so "Brass Bowl", "brass  bowl" and
 * "brass bowl" are one term with one count, which is what makes the counts
 * mean anything.
 */
const normaliseQuery = (raw) => String(raw ?? '')
  .trim().toLowerCase().replaceAll(/\s+/g, ' ').slice(0, 80);

async function recordSearch(store, body) {
  const q = normaliseQuery(body.q);
  if (!q) return;
  const results = Math.max(0, Number(body.results) || 0);
  const stamp = now();

  await store.batch([
    store.stmt(
      `INSERT INTO search_terms (q, searches, zero_hits, results, first_seen, last_seen)
       VALUES (?, 1, ?, ?, ?, ?)
       ON CONFLICT (q) DO UPDATE SET
         searches   = search_terms.searches + 1,
         zero_hits  = search_terms.zero_hits + excluded.zero_hits,
         -- The newest answer wins: a term that found nothing until the piece
         -- was stocked should stop reading as a gap in the catalogue.
         results    = excluded.results,
         last_seen  = excluded.last_seen`,
      q, results === 0 ? 1 : 0, results, stamp, stamp,
    ),
    // Deletes nothing at all until the table is over the cap, at which point
    // it takes the least-searched tail. Cheap either way against a table
    // this size, and it is the clamp the module's contract asks for.
    store.stmt(
      `DELETE FROM search_terms WHERE q IN (
         SELECT q FROM search_terms
          ORDER BY searches DESC, last_seen DESC
          LIMIT -1 OFFSET ?)`,
      MAX_SEARCH_TERMS,
    ),
  ]);
}

/**
 * Snapshot a live cart so Analytics can show the ones never checked out.
 *
 * `customerId` is the signed-in shopper, or null for a guest. It is written
 * on every snapshot rather than only the first, so a cart begun before
 * signing in gets a name the moment its owner does.
 */
async function recordCart(store, body, sid, customerId) {
  if (!sid) return;
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 40).map(i => ({
    name: String(i.name || '').slice(0, 120),
    qty: Number(i.qty) || 1,
    price: String(i.price || '').slice(0, 20),
    img: String(i.img || '').slice(0, 200),
  }));

  if (!items.length) {
    await store.run('DELETE FROM carts WHERE sid = ?', sid);
    return;
  }
  await store.run(
    `INSERT INTO carts (sid, items, total, updated_at, customer_id) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (sid) DO UPDATE SET items = excluded.items, total = excluded.total,
       updated_at = excluded.updated_at,
       -- Never unset a known shopper: the beacon can fire from a second tab
       -- that has not resolved the session yet, and losing the name because
       -- of that would be worse than keeping a slightly stale one.
       customer_id = COALESCE(excluded.customer_id, carts.customer_id)`,
    sid, JSON.stringify(items), 0, now(), customerId || null,
  );
}

/**
 * The signed-in shopper behind a beacon, or null.
 *
 * Guarded by a cookie check rather than called outright, because /api/track
 * fires on every page view and currentCustomer() costs a Better Auth session
 * lookup plus a database read. A guest carries no session cookie at all, so
 * the common case pays one header parse and nothing else.
 *
 * Never throws: the beacon is fire-and-forget, and an unidentified cart is a
 * far smaller loss than a tracking call that 500s.
 */
async function beaconCustomer(store, request, env) {
  try {
    if (!request) return null;
    const cookies = parseCookies(request);
    const signedIn = cookies[CUSTOMER_COOKIE]
      || Object.keys(cookies).some(name => name.includes('better-auth'));
    if (!signedIn) return null;
    return await currentCustomer(store, request, env);
  } catch {
    return null;
  }
}

/**
 * One beacon endpoint for every storefront event:
 *   view (default)  page view, with product views attributed from the URL
 *   atc             added to cart          } the two middle steps of the
 *   checkoutStart   checkout form opened   } conversion funnel
 *   search          header search {q, results}
 *   cart            cart snapshot for abandoned-cart tracking
 *
 * The two events that can carry a person — the page view, which feeds the
 * profile's browsing history, and the cart snapshot, which feeds the
 * abandoned-cart list — resolve the shopper first. The counters and the
 * search log do not: they are aggregate, and looking up a session to
 * increment an integer would be work spent on nothing.
 */
export async function track({ store, body, request, env }) {
  const day = await ensureDay(store);
  const sid = String(body.sid || '').slice(0, 40);
  const type = String(body.type || 'view');

  const customer = (type === 'cart' || !['atc', 'checkout', 'checkoutStart', 'search'].includes(type))
    ? await beaconCustomer(store, request, env)
    : null;

  switch (type) {
    case 'atc':
      await store.run('UPDATE analytics_days SET atc = atc + 1 WHERE day = ?', day);
      break;
    case 'checkout':
    case 'checkoutStart':
      await store.run('UPDATE analytics_days SET checkout_start = checkout_start + 1 WHERE day = ?', day);
      break;
    case 'search': await recordSearch(store, body); break;
    case 'cart': await recordCart(store, body, sid, customer?.id || null); break;
    // recordPageView has always taken a `customer` and never been given one,
    // so recordCustomerView inside it never ran: the profile's Browsing
    // history and Favourite categories panels have been empty for every
    // shopper since they were written. This is the argument it was missing.
    default: await recordPageView(store, day, body, sid, customer);
  }

  return ok();
}

/* ---------- waitlists ---------- */

export async function notifyMe({ store, body }) {
  const product = await productById(store, String(body.productId || ''));
  const email = String(body.email || '').toLowerCase().trim();
  if (!product) return notFound('Product not found');
  if (!EMAIL_RE.test(email)) return badRequest('Invalid email');

  // The UNIQUE (product_id, email) pair makes "already waiting" a no-op
  // rather than something to check for first.
  await store.run(
    `INSERT INTO stock_alerts (product_id, email, notified, t) VALUES (?, ?, 0, ?)
     ON CONFLICT (product_id, email) DO NOTHING`,
    product.id, email, now(),
  );
  return ok();
}

export async function newsletter({ store, body }) {
  const email = String(body.email || '').toLowerCase().trim();
  if (!EMAIL_RE.test(email)) return badRequest('Invalid email');
  await store.run(
    `INSERT INTO subscribers (email, t, source) VALUES (?, ?, 'footer') ON CONFLICT (email) DO NOTHING`,
    email, now(),
  );
  return ok();
}
