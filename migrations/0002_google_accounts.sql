-- Vayu — sign in with Google.
--
-- A customer row can now be reached three ways: a password, a Google
-- account, or neither (a guest who has only ever checked out). They are
-- not exclusive — signing in with Google on an email that already has a
-- password links the two, and the row keeps its order history either way.
--
-- google_sub is Google's immutable subject id. It, not the email, is the
-- identity: a Google account can change its email address, and matching on
-- `sub` means the link survives that.

ALTER TABLE customers ADD COLUMN google_sub TEXT;
ALTER TABLE customers ADD COLUMN picture TEXT;
ALTER TABLE customers ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN given_name TEXT;
ALTER TABLE customers ADD COLUMN family_name TEXT;
ALTER TABLE customers ADD COLUMN locale TEXT;

-- Partial index: only rows that actually carry a Google id are constrained,
-- so the many customers with NULL do not collide with one another.
CREATE UNIQUE INDEX idx_customers_google_sub
  ON customers(google_sub) WHERE google_sub IS NOT NULL;
