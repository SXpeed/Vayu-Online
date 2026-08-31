-- Vayu — seed the meta row that nextId() counts on.
--
-- `meta` holds exactly one row (id = 1), and its `seq` column is the counter
-- behind store.nextId(): every product, order, coupon, customer, variant,
-- option, address and admin id is minted by
--
--     UPDATE meta SET seq = seq + 1 WHERE id = 1 RETURNING seq
--
-- 0001_init creates that table but never inserts the row. Until now the row
-- arrived from scripts/import-db.mjs, which carried the old JSON store's
-- counter across on import. That hid the gap for as long as every database
-- began life as an import of the old shop.
--
-- A database built from migrations alone — which is exactly what a fresh
-- Cloudflare account gets from `wrangler d1 migrations apply --remote` — has
-- an EMPTY meta table instead. The UPDATE then matches no row, RETURNING
-- yields nothing, and nextId() throws reading `.seq` of undefined. The
-- failure surfaces as a 500 on the first "add product" in the admin panel
-- and on the first checkout, with a schema that looks complete.
--
-- Idempotent on purpose: OR IGNORE means a database that already carries a
-- counter keeps it exactly where it is rather than being reset to 0, so this
-- is safe to apply to the existing shop as well as to a new one.

INSERT OR IGNORE INTO meta (id, version, seq, seeded_at)
VALUES (1, 1, 0, NULL);
