-- Vayu — record whether an order has actually been paid.
--
-- These two columns were being WRITTEN before they existed. The Razorpay
-- webhook's payment.captured branch runs:
--
--     UPDATE orders SET paid_at = ?, payment_status = ? WHERE number = ?
--
-- against a table that had neither column, and the call is wrapped in
-- `.catch(() => {})`. So every captured payment Razorpay told us about was
-- discarded in silence: no error, no log, and an order that stays looking
-- unpaid forever. The catch is there so a webhook cannot 500 and be retried
-- into a loop, which is right — but it also hid this completely.
--
-- The vocabulary, kept deliberately small:
--   'paid'     money is in. Set at commit for a verified Razorpay payment,
--              or by the webhook when capture lands.
--   'pending'  nothing collected yet. Every COD order until it is delivered,
--              and any prepaid order still in flight.
--   'failed'   Razorpay told us the payment did not go through.
--   'refunded' money was sent back.
--
-- Backfill reconstructs the truth for rows that predate this. A razorpay
-- order can only exist if checkout verified its signature before committing
-- (see confirmPayment in services/orders/checkout.js), so those really are
-- paid, and created_at is the closest honest timestamp available. COD orders
-- are pending by definition.

ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN paid_at TEXT;

UPDATE orders
   SET payment_status = 'paid',
       paid_at = created_at
 WHERE payment_method <> 'cod'
   AND payment_id IS NOT NULL
   AND payment_id <> '';

UPDATE orders
   SET payment_status = 'pending'
 WHERE payment_method = 'cod';

CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
