-- Vayu — the customer-platform foundation.
--
-- This is the schema behind the unified customer profile, the segment
-- engine, server-side wishlists, loyalty, returns, gift cards, 301
-- redirects, per-customer browsing history and the newsletter manual-add
-- path. It is deliberately one migration because every later phase
-- (wishlist sync, segments, admin Returns/Loyalty/Marketing modules,
-- SEO redirects, server-side conversion tracking) reads from these tables.
--
-- Conventions are exactly 0001's: ids are prefixed TEXT, money is INTEGER
-- rupees, timestamps are TEXT ISO-8601, booleans are INTEGER 0/1, and
-- document-shaped blobs that are never queried inside stay JSON in TEXT.
--
-- Reviews are re-created here. 0007 dropped them because the storefront
-- no longer accepted them; the admin-module list puts Reviews back, so the
-- table returns with the same shape it had, ready for Phase 4's moderation
-- queue.

PRAGMA foreign_keys = ON;

/* ============================================================
   Customer profile — what 0001 did not carry
   ============================================================
   The profile the admin shows is assembled from several tables rather
   than one wide row, because each facet has its own write pattern:
   consents change rarely, loyalty moves on every order, browsing history
   appends on every view. A denormalised mega-row would force a
   read-modify-write on every one of them. */

-- Email / WhatsApp marketing consent per customer. Separate table (not
-- columns on customers) so a consent change is its own audited row with a
-- timestamp, which is what a privacy request needs to answer "when did
-- they opt in". One row per customer.
CREATE TABLE IF NOT EXISTS customer_consents (
  customer_id      TEXT PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  email_consent    INTEGER NOT NULL DEFAULT 0,
  whatsapp_consent INTEGER NOT NULL DEFAULT 0,
  email_at         TEXT,
  whatsapp_at      TEXT,
  updated_at       TEXT NOT NULL
);

-- Loyalty points. balance is the live number the storefront shows; the
-- ledger is the append-only truth, so balance is always reconstructable
-- and a corrupt balance is one replay away from corrected.
CREATE TABLE IF NOT EXISTS loyalty_points (
  customer_id TEXT PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  balance     INTEGER NOT NULL DEFAULT 0,
  lifetime    INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL
);

-- Points movement. kind distinguishes earn / burn / expire / adjust so
-- the ledger reads as a narrative. ref is the order number or admin id
-- behind the movement, copied (not a foreign key) so the ledger survives
-- the order being deleted.
CREATE TABLE IF NOT EXISTS loyalty_ledger (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  delta       INTEGER NOT NULL,
  kind        TEXT NOT NULL,
  reason      TEXT NOT NULL DEFAULT '',
  ref         TEXT NOT NULL DEFAULT '',
  t           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_customer ON loyalty_ledger(customer_id, t DESC);

/* ============================================================
   Wishlist — server-side, with guest merge
   ============================================================
   A logged-in customer's wishlist lives here, not in localStorage. A
   guest's wishlist lives here too, keyed by an opaque guest_key the
   browser keeps in localStorage; the moment that guest signs in, Phase 2
   runs one UPDATE that promotes their guest_key rows onto their
   customer_id (and de-dupes against what they already had). */

CREATE TABLE IF NOT EXISTS wishlists (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  guest_key   TEXT,
  product_id  TEXT NOT NULL,
  variant_id  TEXT,
  note        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  CHECK ((customer_id IS NOT NULL) + (guest_key IS NOT NULL) = 1)
);
CREATE INDEX IF NOT EXISTS idx_wishlists_customer ON wishlists(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wishlists_guest    ON wishlists(guest_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wishlists_product  ON wishlists(product_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wishlists_owner_product
  ON wishlists(COALESCE(customer_id, guest_key), product_id, COALESCE(variant_id, ''));

/* ============================================================
   Browsing history + favourite categories
   ============================================================
   0001's analytics_* tables are aggregate counters keyed by day; they
   cannot answer "what did THIS customer look at". A per-customer view
   log does, which is what the profile's Browsing history and Favourite
   categories panels read. */

CREATE TABLE IF NOT EXISTS customer_views (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id  TEXT,
  category    TEXT NOT NULL DEFAULT '',
  path        TEXT NOT NULL DEFAULT '',
  t           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customer_views_customer ON customer_views(customer_id, t DESC);
CREATE INDEX IF NOT EXISTS idx_customer_views_product  ON customer_views(product_id);

-- Capping the log at ~200 rows per customer is done in application code
-- (a DELETE after insert in the Phase 2 view-recorder) rather than a
-- trigger. wrangler's migration-file splitter breaks on the semicolon
-- inside a CREATE TRIGGER BEGIN END body, so a trigger here would make
-- the whole migration fail to apply. The 0001 trigger
-- (trim_analytics_recent) survives only because 0001 was loaded by the
-- db:import dump restore, not by the migrations runner.

/* ============================================================
   Segments — the profile and Customers filter start with these
   ============================================================
   A segment is a named rule the engine materialises into
   customer_segments. The built-ins below are seeded on day one; the
   Phase 3 job recomputes membership from orders / consents / views.

   rule is stored as JSON in TEXT (it is only ever read by the engine,
   never by a WHERE clause). customer_segments is the materialized
   membership built from those rules. */

CREATE TABLE IF NOT EXISTS segments (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  rule       TEXT NOT NULL DEFAULT '{}',
  is_system  INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_segments_name ON segments(name);

CREATE TABLE IF NOT EXISTS customer_segments (
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  segment_id  TEXT NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  computed_at TEXT NOT NULL,
  PRIMARY KEY (customer_id, segment_id)
);
CREATE INDEX IF NOT EXISTS idx_customer_segments_segment ON customer_segments(segment_id);

INSERT OR IGNORE INTO segments (id, name, rule, is_system, created_at) VALUES
  ('seg_new',              'New',              '{"type":"new","days":30}', 1, datetime('now')),
  ('seg_returning',        'Returning',        '{"type":"returning","minOrders":2}', 1, datetime('now')),
  ('seg_vip',              'VIP',              '{"type":"spent","min":100000,"minOrders":5}', 1, datetime('now')),
  ('seg_high_aov',         'High AOV',         '{"type":"aov","min":20000}', 1, datetime('now')),
  ('seg_dormant',          'Dormant',          '{"type":"dormant","days":120}', 1, datetime('now')),
  ('seg_retail',           'Retail customer',  '{"type":"channel","value":"retail"}', 1, datetime('now')),
  ('seg_online',           'Online customer',  '{"type":"channel","value":"online"}', 1, datetime('now')),
  ('seg_frequent_returns', 'Frequent returns', '{"type":"returns","min":2}', 1, datetime('now')),
  ('seg_furniture',        'Furniture customer','{"type":"category","category":"furniture"}', 1, datetime('now')),
  ('seg_art',              'Art buyer',        '{"type":"category","category":"art"}', 1, datetime('now'));

/* ============================================================
   Returns
   ============================================================
   A return is a customer request to send items from a delivered order
   back. A return has many return_items, each pointing at the order line
   being returned with a quantity and a reason. status walks
   requested -> approved -> received -> refunded | rejected, which is what
   the Phase 4 admin Returns queue drives. */

CREATE TABLE IF NOT EXISTS returns (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'requested',
  total       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_returns_order    ON returns(order_id);
CREATE INDEX IF NOT EXISTS idx_returns_customer ON returns(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_returns_status   ON returns(status);

CREATE TABLE IF NOT EXISTS return_items (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id TEXT NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  item_id   TEXT NOT NULL,
  qty       INTEGER NOT NULL DEFAULT 1,
  reason    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_return_items_return ON return_items(return_id);

/* ============================================================
   Gift cards
   ============================================================
   A gift card is a prepaid store credit identified by its code. The
   ledger is the append-only truth: every issue, top-up, spend and expiry
   is one row, so the live balance is always a SUM over the ledger and
   tampering with the balance row is one replay from corrected.

   status walks active -> expired | disabled. expires_at is nullable for
   cards that never expire. balance is cached for fast reads and rebuilt
   from the ledger on any reconciliation. */

CREATE TABLE IF NOT EXISTS gift_cards (
  id         TEXT PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  balance    INTEGER NOT NULL DEFAULT 0,
  currency   TEXT NOT NULL DEFAULT 'INR',
  status     TEXT NOT NULL DEFAULT 'active',
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gift_cards_status ON gift_cards(status);

CREATE TABLE IF NOT EXISTS gift_card_ledger (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  gift_card_id TEXT NOT NULL REFERENCES gift_cards(id) ON DELETE CASCADE,
  delta        INTEGER NOT NULL,
  kind         TEXT NOT NULL,
  ref          TEXT NOT NULL DEFAULT '',
  t            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gift_card_ledger_card ON gift_card_ledger(gift_card_id, t DESC);

/* ============================================================
   SEO — 301 redirects
   ============================================================
   One row per redirect. from_path is the old URL the store used to serve
   and must begin with '/'; trailing-slash variants are the panel's job to
   add. to_path is the destination, which may be absolute (a full URL) or
   a site path. status is always 301 for permanent moves; the column
   exists so a future temporary-redirect row does not need a schema
   change. active lets the admin disable a redirect without deleting it. */

CREATE TABLE IF NOT EXISTS redirects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  from_path  TEXT NOT NULL,
  to_path    TEXT NOT NULL,
  status     INTEGER NOT NULL DEFAULT 301,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_redirects_from ON redirects(from_path);
CREATE INDEX IF NOT EXISTS idx_redirects_active ON redirects(active);

/* ============================================================
   Reviews — recreated (0007 dropped them)
   ============================================================
   The same shape 0001 used, restored so the admin Reviews moderation
   queue and the product review schema have a table to write to.
   status walks pending -> published | rejected. rating is 1-5. */

CREATE TABLE IF NOT EXISTS reviews (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  rating      INTEGER NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_status  ON reviews(status);

/* ============================================================
   Marketing tracking — server-side conversion events
   ============================================================
   One row per tracked event. kind is utm | view | add_to_cart |
   checkout | purchase. The Phase 5 tracking layer separates a first-touch
   UTM hit on a page view from conversion events written at
   /api/checkout/confirm. customer_id is nullable because a first-touch
   UTM hit often lands on a visitor who has not signed in yet. */

CREATE TABLE IF NOT EXISTS marketing_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  t            TEXT NOT NULL,
  customer_id  TEXT REFERENCES customers(id) ON DELETE SET NULL,
  sid          TEXT NOT NULL DEFAULT '',
  kind         TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT '',
  medium       TEXT NOT NULL DEFAULT '',
  campaign     TEXT NOT NULL DEFAULT '',
  term         TEXT NOT NULL DEFAULT '',
  content      TEXT NOT NULL DEFAULT '',
  value        INTEGER NOT NULL DEFAULT 0,
  currency     TEXT NOT NULL DEFAULT 'INR',
  order_id     TEXT,
  ref          TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_marketing_events_customer ON marketing_events(customer_id, t DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_events_kind     ON marketing_events(kind, t DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_events_sid      ON marketing_events(sid);

/* ============================================================
   Monitoring — failure-rate counters
   ============================================================
   One row per (day, metric) with a counter, so the Phase 8 monitoring
   view reads each failure rate as a single SUM over a date range. Keys
   on day+metric so an increment is one UPSERT, the same pattern the
   analytics tables use. metric names the thing being counted
   (checkout_error, payment_failed, otp_failed, order_failed, http_404,
   http_500, search_failed, inventory_sync_failed, webhook_failed,
   shipping_api_failed, email_failed, whatsapp_failed). */

CREATE TABLE IF NOT EXISTS monitoring_metrics (
  day    TEXT NOT NULL,
  metric TEXT NOT NULL,
  count  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, metric)
);
CREATE INDEX IF NOT EXISTS idx_monitoring_metrics_metric ON monitoring_metrics(metric, day DESC);

/* ============================================================
   Orders — channel + UTM attribution columns
   ============================================================
   channel records where the sale closed: 'online' (the storefront) or
   'retail' (an in-store order entered through the admin, Phase 4).
   Defaults to 'online' so every pre-existing order counts as online,
   which is how the JSON store behaved. utm captures the marketing
   attribution string the Phase 5 tracking layer writes, kept here so an
   order carries its source through to reporting. */

ALTER TABLE orders ADD COLUMN channel TEXT NOT NULL DEFAULT 'online';
ALTER TABLE orders ADD COLUMN utm     TEXT NOT NULL DEFAULT '';
