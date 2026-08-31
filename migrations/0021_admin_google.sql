-- Google sign-in for the admin panel, with approval for everyone after the
-- first.
--
-- The panel authenticated one way: an email and a password hashed into
-- admins.salt/hash. That form is on the open internet and the throttle in
-- front of it is per-isolate (see createThrottle in services/auth/sessions.js),
-- so it slows a guesser without capping them. Google removes the guessable
-- secret altogether.
--
-- Two columns rather than a new table, because this describes an admin
-- rather than relating them to something:
--
--   status         'active'  may sign in
--                  'pending' has asked, and is waiting for an owner to say
--                            yes. Authenticated by Google, authorised by
--                            nobody yet — which is the whole point of the
--                            approval step.
--
--   auth_provider  'google'   signs in through Google; salt and hash are ''
--                             and verifyPassword() refuses an empty hash, so
--                             the password form cannot admit them at all.
--                  'password' the old way, still available as a break-glass
--                             for an account made by scripts/create-admin.mjs.
--
-- Both defaults describe the rows that already exist: anyone in this table
-- before this migration got there with a password and is allowed in. That is
-- what makes this safe to apply to a live shop — nobody is locked out by it.
ALTER TABLE admins ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE admins ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'password';

-- Pending rows are read on every approval screen and never by id.
CREATE INDEX IF NOT EXISTS idx_admins_status ON admins (status);
