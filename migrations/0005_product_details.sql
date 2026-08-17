-- Vayu — the product page's detail accordion, made editable.
--
-- Description, Dimensions, Materials & Origin, Care Instructions and
-- Shipping & Returns were all hard-coded in pages/product.html: every piece
-- in the shop claimed to be 32 x 32 x 45 cm, to weigh 2.4 kg and to be
-- "Handcrafted", because there was nowhere to say otherwise. Description was
-- the only one of the five that came from the database.
--
-- Two shapes, because the five sections are two kinds of thing:
--
--   specs     Dimensions and Materials & Origin are label/value rows, and
--             which rows exist differs per piece — a saree has a length and
--             a width, a chair has a seat height. So they are rows, not
--             columns: a table with a `section` discriminator serves both
--             and would serve a third without another migration.
--
--   presets   Shipping & Returns is shop policy, not product copy. The same
--             four sentences would otherwise be re-typed against every
--             product and drift apart the first time the returns window
--             changes. It is stored once and pointed at.
--
-- Care is per-product free text, so it is simply a column.

CREATE TABLE product_specs (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  section    TEXT NOT NULL,                  -- 'dimensions' | 'materials'
  label      TEXT NOT NULL,
  value      TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, section, label)
);
CREATE INDEX idx_product_specs_product ON product_specs(product_id);

CREATE TABLE shipping_presets (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE products ADD COLUMN care TEXT NOT NULL DEFAULT '';

-- No foreign key: a preset that gets deleted out from under a product should
-- fall back to the default profile rather than take the product's row with
-- it. The admin panel refuses to delete a preset still in use, which is the
-- real guard; this column tolerating a dangling id is the safety net.
ALTER TABLE products ADD COLUMN shipping_preset TEXT;

-- The three profiles the shop starts with. The first is the copy that was
-- previously hard-coded into the page, so nothing a shopper reads changes on
-- the day this lands.
INSERT INTO shipping_presets (id, name, body, sort_order) VALUES
  ('ship_standard', 'Standard',
   'Ships within 3–5 business days. Free shipping on orders above ₹ 5,000. Returns accepted within 7 days of delivery — items must be unused and in original packaging.',
   0),
  ('ship_made_to_order', 'Made to order',
   'Made to order in our atelier and dispatched within 2–3 weeks. Because each piece is cut for you, made-to-order items cannot be returned or exchanged unless they arrive damaged.',
   1),
  ('ship_final_sale', 'Final sale',
   'Ships within 3–5 business days. Sale pieces are final — they cannot be returned or exchanged. Do write to us if your order arrives damaged and we will make it right.',
   2);
