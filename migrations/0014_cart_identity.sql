-- Vayu — put a name to an abandoned cart.
--
-- The carts table has only ever been keyed by `sid`, the anonymous
-- per-browser id from the analytics beacon. So the panel's Abandoned carts
-- card could say what was left behind but never who left it, which is the
-- half that makes the list actionable: there is nothing to do with "someone
-- abandoned a linen shirt", and something obvious to do with "Priya did".
--
-- Filled by /api/track for a signed-in shopper only. A guest browsing
-- without an account genuinely cannot be identified from a cart snapshot,
-- and nothing here tries to guess: the column stays NULL and the row is
-- still counted, still shown, just anonymous.
--
-- Nullable with no default and no backfill, because there is no honest value
-- to backfill with — every existing row predates the shopper being known.
ALTER TABLE carts ADD COLUMN customer_id TEXT;

CREATE INDEX idx_carts_customer ON carts(customer_id);
