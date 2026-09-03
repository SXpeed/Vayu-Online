-- Vayu — price on inquiry, and the enquiries it collects.
--
-- Some pieces are not sold off a shelf at a printed number: a commission, a
-- one-off, something priced by size and finish once the buyer has said what
-- they want. Until now the catalogue had no way to say so. The only options
-- were to invent a price, or to leave the field at 0 — which the storefront
-- renders as "₹ 0" and the checkout happily accepts, so an order could
-- arrive for nothing.
--
-- `inquiry_only` is that third state. It is a display and sale rule, not a
-- price: the row keeps whatever `price` it has (an internal guide figure is
-- useful to the shop and is never shown), the product page prints "Price on
-- request" in place of the number, the buy buttons are replaced by a form,
-- and resolveLine in the checkout refuses the piece outright — the last is
-- the one that matters, because the storefront is not the only thing that
-- can post a cart line.
--
-- Every existing product defaults to 0 and is therefore unchanged.

ALTER TABLE products ADD COLUMN inquiry_only INTEGER NOT NULL DEFAULT 0;

-- The enquiries themselves: a lead, not a subscription.
--
-- Unlike stock_alerts, this does NOT cascade when the product goes. Someone
-- asked the shop a question and left their number, and deleting the piece
-- they asked about is no reason to lose the person — so the reference is
-- ON DELETE SET NULL and `product_name` carries a snapshot of what they were
-- looking at, which stays readable afterwards. `variant` is the combination
-- they had chosen on the page ("Colour=Natural|Size=L" made human), empty
-- when the piece has no options.
--
-- No UNIQUE on (product_id, email): a second enquiry about the same piece is
-- a follow-up worth seeing, not a duplicate to swallow. The panel dedupes by
-- eye, and the endpoint clamps length and rate instead.
CREATE TABLE product_inquiries (
  id           TEXT PRIMARY KEY,
  product_id   TEXT REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL DEFAULT '',
  variant      TEXT NOT NULL DEFAULT '',
  name         TEXT NOT NULL DEFAULT '',
  email        TEXT NOT NULL DEFAULT '',
  phone        TEXT NOT NULL DEFAULT '',
  message      TEXT NOT NULL DEFAULT '',
  -- new | contacted | closed. 'new' is what the sidebar badge counts.
  status       TEXT NOT NULL DEFAULT 'new',
  notes        TEXT NOT NULL DEFAULT '',
  t            TEXT NOT NULL,
  handled_at   TEXT
);

-- The panel's default listing is "new first, newest first", and the badge is
-- a COUNT over status — both are this index.
CREATE INDEX idx_product_inquiries_status ON product_inquiries(status, t);
CREATE INDEX idx_product_inquiries_product ON product_inquiries(product_id);
