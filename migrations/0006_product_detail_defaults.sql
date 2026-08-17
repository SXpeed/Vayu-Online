-- Vayu — fallback copy for the product detail accordion.
--
-- Migration 0005 made the five sections per-product and hid the ones with
-- nothing behind them. Correct, but the catalogue has not been written up
-- yet: all 31 products have an empty description and no spec rows, so every
-- product page collapsed to a single section overnight.
--
-- So the sections get a shop-wide default, editable under Content in the
-- panel like the announcement bar and the hero slides. A product that has
-- been given its own copy overrides it section by section; one that has not
-- shows this. The text below is exactly what the page used to hard-code, so
-- nothing a shopper reads changes — the difference is that it can now be
-- corrected in one place instead of being welded into the markup.
--
-- The dimensions default is the uncomfortable one: it states 32 x 32 x 45 cm
-- for every piece that has not been measured, which is what the page did
-- before and is wrong for most of the shop. It is here so the section does
-- not vanish, and it is the first thing worth either filling in per product
-- or clearing entirely.

INSERT INTO config (scope, key, value, updated_at) VALUES (
  'content',
  'productDefaults',
  json_object(
    'description',
    'A singular piece from the Vayu atelier — crafted by hand using time-honoured techniques and natural materials. Each object carries the quiet imperfection of the artist''s touch, making it uniquely yours.',
    'care',
    'Wipe with a soft dry cloth. Avoid abrasive cleaners and prolonged exposure to direct sunlight to preserve the natural finish.',
    'dimensions',
    json_array(
      json_object('label', 'Length', 'value', '32 cm'),
      json_object('label', 'Width',  'value', '32 cm'),
      json_object('label', 'Height', 'value', '45 cm'),
      json_object('label', 'Weight', 'value', '2.4 kg')
    ),
    'materials',
    json_array(
      json_object('label', 'Material', 'value', 'Handcrafted'),
      json_object('label', 'Origin',   'value', 'Made in India')
    )
  ),
  datetime('now')
)
ON CONFLICT (scope, key) DO NOTHING;
