-- Vayu — SEO: product slugs and per-product meta.
--
-- Until now every product in the shop was served from ONE URL:
--
--     /pages/product.html?cat=objects&idx=3
--
-- a prerendered document with a hardcoded <title>Product — Vayu</title>
-- that filled itself in client-side from /api/catalogue. To a crawler the
-- entire catalogue was a single page with no product name, no price and no
-- description in the HTML — nothing to index and nothing to rank. Every
-- product competed for the same URL, so none of them ranked at all.
--
-- `slug` is what gives each product its own address (/products/brass-lotus-diya).
-- It is NOT a rename of the ?cat=&idx= scheme: that stays exactly as it is,
-- because `idx` is a product's position in its category array and every cart
-- line and historical order still refers to products that way. The old URL
-- 301s onto the slug instead of being replaced, which is also what hands the
-- accumulated link equity to the new address rather than throwing it away.
--
-- The unique index is PARTIAL. A plain UNIQUE would reject the second row to
-- carry the '' default, which is every product that existed before this ran;
-- `WHERE slug != ''` lets the backfill fill them in one at a time.
--
-- meta_title / meta_description are the editable overrides. Both default to
-- '' and the page falls back to the product name and a trimmed description,
-- so an unedited product still emits a sensible title and snippet.

ALTER TABLE products ADD COLUMN slug             TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN meta_title       TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN meta_description TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_slug
  ON products(slug) WHERE slug != '';
