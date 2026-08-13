-- Vayu — initial D1 schema.
--
-- This is admin/data/db.json turned into tables. The JSON file could get
-- away with nesting (a product carried its own gallery, variants and
-- category pairs; an order carried its items); D1 cannot, and should not:
-- every one of those nested arrays is a row set that wants its own table,
-- its own index and its own foreign key.
--
-- Conventions, applied throughout:
--   * ids stay TEXT and keep the prefixed form the app already mints
--     ("prod_12", "ord_4") so existing links, orders and ?id= URLs survive
--     the move unchanged.
--   * timestamps are TEXT ISO-8601, exactly what the app already stores —
--     SQLite has no date type and ISO strings sort correctly.
--   * booleans are INTEGER 0/1, since SQLite has no boolean.
--   * money is INTEGER paise-free rupees, as the JSON store had it.
--   * anything genuinely document-shaped (a settings blob, a live cart
--     snapshot) stays JSON in a TEXT column. Rows we filter, sort or join
--     on never do.

PRAGMA foreign_keys = ON;

/* ============================================================
   Configuration — small singleton documents, keyed by name
   ============================================================ */

-- settings ("store", "payment", "shipping") and editable site content
-- ("announcement", "heroSlides"). These are read whole and written whole,
-- are never queried by their innards, and are one row each: a key/value
-- document table is the honest shape for them.
CREATE TABLE config (
  scope      TEXT NOT NULL,              -- 'settings' | 'content'
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,              -- JSON
  updated_at TEXT NOT NULL,
  PRIMARY KEY (scope, key)
);

-- Single-row bookkeeping the JSON file kept under `meta`.
CREATE TABLE meta (
  id        INTEGER PRIMARY KEY CHECK (id = 1),
  version   INTEGER NOT NULL,
  seq       INTEGER NOT NULL,            -- the id counter behind nextId()
  seeded_at TEXT
);

/* ============================================================
   People
   ============================================================ */

CREATE TABLE admins (
  id                   TEXT PRIMARY KEY,
  email                TEXT NOT NULL UNIQUE,
  name                 TEXT NOT NULL DEFAULT '',
  salt                 TEXT NOT NULL,
  hash                 TEXT NOT NULL,
  role                 TEXT NOT NULL DEFAULT 'owner',   -- staff | manager | owner
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL
);

-- A customer row is created by checkout (guest) and gains salt/hash the
-- moment that email is claimed by registering — that is what makes a guest
-- order history survive into an account. hash IS NULL means "no account".
CREATE TABLE customers (
  id                  TEXT PRIMARY KEY,
  email               TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name                TEXT NOT NULL DEFAULT '',
  phone               TEXT NOT NULL DEFAULT '',
  address             TEXT NOT NULL DEFAULT '',
  city                TEXT NOT NULL DEFAULT '',
  pin                 TEXT NOT NULL DEFAULT '',
  orders_count        INTEGER NOT NULL DEFAULT 0,
  total_spent         INTEGER NOT NULL DEFAULT 0,
  first_seen          TEXT NOT NULL,
  last_seen           TEXT NOT NULL,
  source              TEXT NOT NULL DEFAULT 'checkout',
  notes               TEXT NOT NULL DEFAULT '',
  salt                TEXT,
  hash                TEXT,
  account_created_at  TEXT
);
CREATE INDEX idx_customers_last_seen ON customers(last_seen DESC);

CREATE TABLE customer_tags (
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tag         TEXT NOT NULL,
  PRIMARY KEY (customer_id, tag)
);

CREATE TABLE addresses (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label       TEXT NOT NULL DEFAULT 'Address',
  name        TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  address     TEXT NOT NULL,
  city        TEXT NOT NULL DEFAULT '',
  pin         TEXT NOT NULL,
  is_default  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_addresses_customer ON addresses(customer_id);

-- Admin and customer sessions in one table, told apart by `kind`, so a
-- token issued for one can never be mistaken for the other: every lookup
-- filters on kind as well as the token.
CREATE TABLE sessions (
  token      TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,              -- 'admin' | 'customer'
  subject_id TEXT NOT NULL,              -- admins.id or customers.id
  expires    INTEGER NOT NULL,           -- epoch ms
  created_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_expires ON sessions(expires);
CREATE INDEX idx_sessions_subject ON sessions(kind, subject_id);

/* ============================================================
   Catalogue
   ============================================================ */

CREATE TABLE categories (
  slug       TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  curated    TEXT NOT NULL DEFAULT '',
  banner     TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE category_subs (
  category_slug TEXT NOT NULL REFERENCES categories(slug) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  thumb         TEXT NOT NULL DEFAULT '',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (category_slug, label)
);

CREATE TABLE products (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price       INTEGER NOT NULL DEFAULT 0,
  compare_at  INTEGER,
  sku         TEXT NOT NULL DEFAULT '',
  stock       INTEGER NOT NULL DEFAULT 0,   -- ignored when variants exist
  status      TEXT NOT NULL DEFAULT 'active', -- active | draft | archived
  is_new      INTEGER NOT NULL DEFAULT 0,
  img         TEXT NOT NULL DEFAULT '',
  publish_at  TEXT,                          -- scheduled activation
  views       INTEGER NOT NULL DEFAULT 0,
  sold        INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,    -- keeps legacy cat/idx stable
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_publish ON products(status, publish_at);
CREATE INDEX idx_products_order ON products(sort_order);

-- A product may sit in several categories at once, which is why this is a
-- join table and not a column: the storefront's ?cat=&idx= links are built
-- from it, one row per (product, category) pair.
CREATE TABLE product_categories (
  product_id    TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_slug TEXT NOT NULL,
  sub           TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (product_id, category_slug, sub)
);
CREATE INDEX idx_product_categories_cat ON product_categories(category_slug);

CREATE TABLE product_gallery (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, url)
);

CREATE TABLE product_variants (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  price      INTEGER,                     -- NULL = inherit the product price
  stock      INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (product_id, label)
);

CREATE TABLE product_tags (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tag        TEXT NOT NULL,
  PRIMARY KEY (product_id, tag)
);
CREATE INDEX idx_product_tags_tag ON product_tags(tag);

/* ============================================================
   Orders
   ============================================================ */

-- The delivery details are copied onto the order rather than joined from
-- the customer: an order is a record of where it actually shipped, and
-- must not change when the customer later edits their address book.
CREATE TABLE orders (
  id               TEXT PRIMARY KEY,
  number           TEXT NOT NULL UNIQUE,
  customer_id      TEXT REFERENCES customers(id) ON DELETE SET NULL,
  name             TEXT NOT NULL DEFAULT '',
  email            TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
  phone            TEXT NOT NULL DEFAULT '',
  address          TEXT NOT NULL DEFAULT '',
  city             TEXT NOT NULL DEFAULT '',
  pin              TEXT NOT NULL DEFAULT '',
  subtotal         INTEGER NOT NULL DEFAULT 0,
  discount         INTEGER NOT NULL DEFAULT 0,
  coupon           TEXT,
  shipping         INTEGER NOT NULL DEFAULT 0,
  total            INTEGER NOT NULL DEFAULT 0,
  payment_method   TEXT NOT NULL DEFAULT 'cod',
  payment_id       TEXT,
  payment_order_id TEXT,
  guest            INTEGER NOT NULL DEFAULT 1,
  status           TEXT NOT NULL DEFAULT 'new',   -- new|processing|shipped|delivered|cancelled
  created_at       TEXT NOT NULL
);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_email ON orders(email);

-- product_id is not a foreign key on purpose: a line must still read
-- correctly years later, after the product it refers to has been deleted.
-- name, price and variant are captured at the moment of sale.
CREATE TABLE order_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT,
  name       TEXT NOT NULL,
  price      INTEGER NOT NULL,
  qty        INTEGER NOT NULL,
  img        TEXT NOT NULL DEFAULT '',
  variant    TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

CREATE TABLE order_timeline (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  t        TEXT NOT NULL,
  status   TEXT NOT NULL,
  note     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_order_timeline_order ON order_timeline(order_id, t);

/* ============================================================
   Coupons
   ============================================================ */

-- Keyed by id, not by code: the panel edits a coupon by id and a code may
-- be rewritten while the coupon keeps its identity (and its use history).
CREATE TABLE coupons (
  id                 TEXT PRIMARY KEY,
  code               TEXT NOT NULL UNIQUE,
  type               TEXT NOT NULL DEFAULT 'percent',   -- percent | flat
  value              INTEGER NOT NULL DEFAULT 0,
  min_order          INTEGER NOT NULL DEFAULT 0,
  expires_at         TEXT,
  usage_limit        INTEGER NOT NULL DEFAULT 0,        -- 0 = unlimited
  per_customer_limit INTEGER NOT NULL DEFAULT 0,
  active             INTEGER NOT NULL DEFAULT 1,
  used_count         INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL
);

-- An empty restriction set means "anyone"; rows narrow the coupon to the
-- listed emails and/or phones, matched on either channel.
CREATE TABLE coupon_restrictions (
  coupon_id TEXT NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  kind      TEXT NOT NULL,                -- 'email' | 'phone'
  value     TEXT NOT NULL,
  PRIMARY KEY (coupon_id, kind, value)
);

-- Keyed by code rather than coupon id: a redemption is a fact about the
-- code the shopper typed, and must survive the coupon being deleted.
CREATE TABLE coupon_uses (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  code  TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  t     TEXT NOT NULL
);
CREATE INDEX idx_coupon_uses_code_email ON coupon_uses(code, email);

/* ============================================================
   Storefront content and signals
   ============================================================ */

-- product_name is denormalised on purpose: the moderation queue lists
-- reviews for products that may since have been deleted, and the original
-- store kept the name on the review for exactly that reason.
CREATE TABLE reviews (
  id           TEXT PRIMARY KEY,
  product_id   TEXT,
  product_name TEXT NOT NULL DEFAULT '',
  name         TEXT NOT NULL DEFAULT '',
  email        TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
  rating       INTEGER NOT NULL DEFAULT 5,
  text         TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  t            TEXT NOT NULL
);
CREATE INDEX idx_reviews_product ON reviews(product_id, status);
CREATE INDEX idx_reviews_status ON reviews(status, t DESC);

-- The id doubles as the slug, which is how /pages/journal-post.html?id=…
-- already addresses a story. `body` is a JSON array of paragraphs: prose
-- read whole and written whole, never queried a paragraph at a time, so
-- normalising it into rows would buy nothing.
CREATE TABLE journal (
  id             TEXT PRIMARY KEY,
  featured       INTEGER NOT NULL DEFAULT 0,
  category       TEXT NOT NULL DEFAULT 'craft',
  category_label TEXT NOT NULL DEFAULT '',
  title          TEXT NOT NULL,
  excerpt        TEXT NOT NULL DEFAULT '',
  date           TEXT NOT NULL DEFAULT '',
  image          TEXT NOT NULL DEFAULT '',
  alt            TEXT NOT NULL DEFAULT '',
  reading_time   TEXT NOT NULL DEFAULT '',
  body           TEXT NOT NULL DEFAULT '[]',
  sort_order     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_journal_order ON journal(sort_order);

CREATE TABLE subscribers (
  email  TEXT PRIMARY KEY COLLATE NOCASE,
  t      TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'footer'
);

CREATE TABLE stock_alerts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  email      TEXT NOT NULL COLLATE NOCASE,
  notified   INTEGER NOT NULL DEFAULT 0,
  t          TEXT NOT NULL,
  UNIQUE (product_id, email)
);
CREATE INDEX idx_stock_alerts_pending ON stock_alerts(product_id, notified);

-- Queued mail. Nothing sends yet (no SMTP); the panel shows this as an
-- outbox, so status moves queued -> sent by hand.
CREATE TABLE outbox (
  id         TEXT PRIMARY KEY,
  to_addr    TEXT NOT NULL,
  subject    TEXT NOT NULL,
  body       TEXT NOT NULL,
  event      TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'queued',
  t          TEXT NOT NULL
);
CREATE INDEX idx_outbox_status ON outbox(status, t DESC);

CREATE TABLE inventory_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  t          TEXT NOT NULL,
  product_id TEXT,
  name       TEXT NOT NULL DEFAULT '',
  delta      INTEGER NOT NULL,
  reason     TEXT NOT NULL DEFAULT '',
  by         TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_inventory_log_t ON inventory_log(t DESC);
CREATE INDEX idx_inventory_log_product ON inventory_log(product_id, t DESC);

-- Live cart snapshots per visitor, for the abandoned-cart list. Genuinely
-- a document: written whole on every change, read whole, never queried
-- inside. It is also the one table safe to lose.
CREATE TABLE carts (
  sid        TEXT PRIMARY KEY,
  items      TEXT NOT NULL,              -- JSON
  total      INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_carts_updated ON carts(updated_at DESC);

CREATE TABLE searches (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  q       TEXT NOT NULL,
  results INTEGER NOT NULL DEFAULT 0,
  sid     TEXT NOT NULL DEFAULT '',
  t       TEXT NOT NULL
);
CREATE INDEX idx_searches_t ON searches(t DESC);

CREATE TABLE activity (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  t      TEXT NOT NULL,
  admin  TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_activity_t ON activity(t DESC);

/* ============================================================
   Analytics
   ============================================================
   The JSON store nested counters inside one object per day
   ({ days: { '2026-08-13': { views, paths: {...} } } }), which meant every
   page view rewrote the whole document. Split into a day row plus two
   counter tables, a view is one UPSERT of one row. */

CREATE TABLE analytics_days (
  day            TEXT PRIMARY KEY,       -- YYYY-MM-DD
  views          INTEGER NOT NULL DEFAULT 0,
  atc            INTEGER NOT NULL DEFAULT 0,   -- add-to-cart events
  checkout_start INTEGER NOT NULL DEFAULT 0
);

-- Distinct visitors per day. The JSON store kept a `sids` object inside the
-- day document purely to count unique ids; one row per (day, sid) counts
-- the same thing with COUNT(*) and no read-modify-write.
CREATE TABLE analytics_visitors (
  day TEXT NOT NULL REFERENCES analytics_days(day) ON DELETE CASCADE,
  sid TEXT NOT NULL,
  PRIMARY KEY (day, sid)
);

CREATE TABLE analytics_paths (
  day   TEXT NOT NULL REFERENCES analytics_days(day) ON DELETE CASCADE,
  path  TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
);

CREATE TABLE analytics_products (
  day        TEXT NOT NULL REFERENCES analytics_days(day) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  count      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, product_id)
);

-- The "recent visits" ticker: capped by a trigger rather than by rewriting
-- an array, so a page view never has to read the history to append to it.
CREATE TABLE analytics_recent (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  t    TEXT NOT NULL,
  path TEXT NOT NULL,
  ref  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_analytics_recent_t ON analytics_recent(t DESC);

CREATE TRIGGER trim_analytics_recent AFTER INSERT ON analytics_recent
BEGIN
  DELETE FROM analytics_recent
  WHERE id <= NEW.id - 200;
END;
