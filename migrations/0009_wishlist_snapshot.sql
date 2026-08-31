-- Vayu — wishlist snapshot columns.
--
-- 0008's wishlists table held only the keys (product_id, variant_id) plus
-- a note, on the assumption that the product is always read live when the
-- wishlist is shown. That is right for a product that still exists — its
-- price and image should be current — but a deleted product left nothing
-- behind, so a row the shopper saved looked like a blank "Saved item".
--
-- The localStorage wishlist the storefront shipped with stored the whole
-- product object, so a removed piece still showed its name and photo. These
-- five columns restore that: they are written once at save time and used
-- only as a fallback when the live product read returns nothing.

ALTER TABLE wishlists ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE wishlists ADD COLUMN price TEXT NOT NULL DEFAULT '';
ALTER TABLE wishlists ADD COLUMN img  TEXT NOT NULL DEFAULT '';
ALTER TABLE wishlists ADD COLUMN cat  TEXT NOT NULL DEFAULT '';
ALTER TABLE wishlists ADD COLUMN idx  INTEGER NOT NULL DEFAULT 0;
