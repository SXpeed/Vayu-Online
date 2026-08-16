-- Vayu — product options (colour / pattern / size) as a proper two-level model.
--
-- Until now a product carried one flat list of `product_variants`, each a
-- bare label. That can express "Small, Medium, Large" but not "this colour
-- in that size", which is what the storefront actually needs to show: a row
-- of swatches and a row of sizes, chosen independently.
--
-- The shape here is the standard one:
--
--   product_options          one row per choice the shopper makes
--                            ("Colour", "Size"), in display order
--   product_option_values    the choices inside it ("Dusty pink", "L"),
--                            carrying a swatch and an optional heading so a
--                            colour rail can be split into "Solid" / "Stripes"
--   product_variants         unchanged in purpose — still the sellable row
--                            that owns price and stock — but now addressable
--                            by the combination that selects it
--
-- `product_variants.label` keeps its old meaning and its old contents (the
-- human string that lands on a cart line and an order line), so every
-- existing order, cart and API consumer reads exactly as before. What is new
-- is `combo`: a canonical key built from the chosen values, which is how the
-- product page turns "Colour=Dusty pink, Size=L" into one variant row.
--
-- A product with no rows in product_options behaves precisely as it did
-- before this migration — which is what makes the storefront rule "show
-- nothing unless the panel configured it" fall out for free.

PRAGMA foreign_keys = ON;

CREATE TABLE product_options (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,                     -- 'Colour', 'Size', 'Finish'
  kind       TEXT NOT NULL DEFAULT 'text',      -- 'swatch' | 'text'
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (product_id, name)
);
CREATE INDEX idx_product_options_product ON product_options(product_id, sort_order);

-- `swatch` is either a CSS colour ('#e8dcd0') or an image URL; the panel
-- decides which and the storefront renders whatever it is given. `heading`
-- is the optional left-hand label that groups a swatch rail into bands
-- ("Solid", "Stripes") — empty means the value sits in the default band.
CREATE TABLE product_option_values (
  id         TEXT PRIMARY KEY,
  option_id  TEXT NOT NULL REFERENCES product_options(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  swatch     TEXT NOT NULL DEFAULT '',
  heading    TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (option_id, label)
);
CREATE INDEX idx_product_option_values_option ON product_option_values(option_id, sort_order);

-- `combo` is the canonical selection key: option/value pairs in option order,
-- joined as "Colour=Dusty pink|Size=L". It is stored rather than derived so
-- the lookup on the product page is a map hit, and so a variant keeps
-- answering to the same key after its label is reworded. Empty for products
-- that use the old flat variant list.
ALTER TABLE product_variants ADD COLUMN combo TEXT NOT NULL DEFAULT '';

-- Selecting a colour should be able to change the photograph. NULL/'' means
-- "leave the gallery alone", which is every pre-existing variant.
ALTER TABLE product_variants ADD COLUMN image TEXT NOT NULL DEFAULT '';

CREATE INDEX idx_product_variants_combo ON product_variants(product_id, combo);
