-- Vayu — drop the reviews feature.
--
-- The storefront no longer accepts or displays reviews and the admin panel's
-- moderation queue is gone, so the table and its indexes are dead weight.
-- D1 has no ALTER TABLE DROP CONSTRAINT, but these indexes were created with
-- IF NOT EXISTS in 0001, so dropping them explicitly keeps a re-run harmless.
-- The table itself is dropped IF EXISTS for the same reason.

DROP INDEX IF EXISTS idx_reviews_product;
DROP INDEX IF EXISTS idx_reviews_status;
DROP TABLE IF EXISTS reviews;
