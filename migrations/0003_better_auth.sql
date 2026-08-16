-- Vayu — Better Auth tables, and the backfill that carries every existing
-- customer and admin across without asking anyone to reset a password.
--
-- The four tables below are Better Auth's own schema for the SQLite adapter.
-- The originals (customers, admins, sessions) are deliberately NOT dropped:
--   * orders.customer_id, addresses.customer_id and the analytics tables all
--     reference customers.id, and those ids have to keep resolving;
--   * a migration that deletes the only copy of the account data is not one
--     you can walk back from if the cutover misbehaves.
-- They become read-only history once this lands. Dropping them is a separate,
-- later migration, once the new path has run in production for a while.

-- ---------------------------------------------------------------- tables --

CREATE TABLE IF NOT EXISTS user (
  id            TEXT PRIMARY KEY,
  name          TEXT,
  email         TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image         TEXT,
  createdAt     TEXT NOT NULL,
  updatedAt     TEXT NOT NULL,
  -- additionalFields declared in app/lib/server/auth.js
  phone         TEXT,
  role          TEXT,
  banned        INTEGER,
  banReason     TEXT,
  banExpires    TEXT,
  -- the id this person had in the pre-Better-Auth tables, so orders,
  -- addresses and analytics rows can still be joined back to them
  legacyId      TEXT
);

CREATE TABLE IF NOT EXISTS session (
  id             TEXT PRIMARY KEY,
  userId         TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  token          TEXT NOT NULL UNIQUE,
  expiresAt      TEXT NOT NULL,
  ipAddress      TEXT,
  userAgent      TEXT,
  impersonatedBy TEXT,
  createdAt      TEXT NOT NULL,
  updatedAt      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS account (
  id                    TEXT PRIMARY KEY,
  userId                TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  accountId             TEXT NOT NULL,
  providerId            TEXT NOT NULL,
  accessToken           TEXT,
  refreshToken          TEXT,
  accessTokenExpiresAt  TEXT,
  refreshTokenExpiresAt TEXT,
  scope                 TEXT,
  idToken               TEXT,
  -- for providerId = 'credential'. A row carried over from the old tables
  -- holds "legacy$<salt>$<hash>"; see the verify hook in server/auth.js.
  password              TEXT,
  createdAt             TEXT NOT NULL,
  updatedAt             TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS verification (
  id         TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value      TEXT NOT NULL,
  expiresAt  TEXT NOT NULL,
  createdAt  TEXT NOT NULL,
  updatedAt  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_token   ON session(token);
CREATE INDEX IF NOT EXISTS idx_session_userid  ON session(userId);
CREATE INDEX IF NOT EXISTS idx_account_userid  ON account(userId);
CREATE INDEX IF NOT EXISTS idx_account_lookup  ON account(providerId, accountId);
CREATE INDEX IF NOT EXISTS idx_user_legacyid   ON user(legacyId);
CREATE INDEX IF NOT EXISTS idx_verification_id ON verification(identifier);

-- --------------------------------------------------------------- backfill --

-- Customers. Their ids are new (Better Auth owns them), and the old id is
-- kept in legacyId so every order and address still joins.
INSERT OR IGNORE INTO user (id, name, email, emailVerified, image, createdAt, updatedAt, phone, role, legacyId)
SELECT
  'usr_' || c.id,
  COALESCE(c.name, ''),
  LOWER(c.email),
  COALESCE(c.email_verified, 0),
  c.picture,
  COALESCE(c.account_created_at, c.first_seen, datetime('now')),
  datetime('now'),
  c.phone,
  NULL,
  c.id
FROM customers c
WHERE c.email IS NOT NULL AND c.email <> '';

-- Admins. Same table, distinguished by role. An address that is both a
-- customer and an admin resolves to the admin row: OR IGNORE keeps the first
-- insert, so the UPDATE below promotes it rather than losing the rank.
INSERT OR IGNORE INTO user (id, name, email, emailVerified, createdAt, updatedAt, role, legacyId)
SELECT
  'usr_adm_' || a.id,
  COALESCE(a.name, ''),
  LOWER(a.email),
  1,
  COALESCE(a.created_at, datetime('now')),
  datetime('now'),
  a.role,
  a.id
FROM admins a
WHERE a.email IS NOT NULL AND a.email <> '';

UPDATE user
SET role = (SELECT a.role FROM admins a WHERE LOWER(a.email) = user.email)
WHERE EXISTS (SELECT 1 FROM admins a WHERE LOWER(a.email) = user.email);

-- Credential rows. The password column carries the old scrypt salt and hash
-- in one string; server/auth.js verifies that shape and rewrites it with a
-- current hash the first time the person signs in.
INSERT OR IGNORE INTO account (id, userId, accountId, providerId, password, createdAt, updatedAt)
SELECT
  'acc_' || c.id,
  u.id,
  u.id,
  'credential',
  'legacy$' || c.salt || '$' || c.hash,
  COALESCE(c.account_created_at, c.first_seen, datetime('now')),
  datetime('now')
FROM customers c
JOIN user u ON u.legacyId = c.id
WHERE c.hash IS NOT NULL AND c.hash <> ''
  AND c.salt IS NOT NULL AND c.salt <> '';

INSERT OR IGNORE INTO account (id, userId, accountId, providerId, password, createdAt, updatedAt)
SELECT
  'acc_adm_' || a.id,
  u.id,
  u.id,
  'credential',
  'legacy$' || a.salt || '$' || a.hash,
  COALESCE(a.created_at, datetime('now')),
  datetime('now')
FROM admins a
JOIN user u ON u.legacyId = a.id
WHERE a.hash IS NOT NULL AND a.hash <> ''
  AND a.salt IS NOT NULL AND a.salt <> '';

-- Google identities already linked to a customer, so anyone who signed in
-- with Google keeps doing so instead of being offered a fresh account.
INSERT OR IGNORE INTO account (id, userId, accountId, providerId, createdAt, updatedAt)
SELECT
  'acc_goog_' || c.id,
  u.id,
  c.google_sub,
  'google',
  COALESCE(c.account_created_at, c.first_seen, datetime('now')),
  datetime('now')
FROM customers c
JOIN user u ON u.legacyId = c.id
WHERE c.google_sub IS NOT NULL AND c.google_sub <> '';
