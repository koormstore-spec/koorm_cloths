-- Run this against an EXISTING koorm_db (including production) after deploying
-- the passwordless auth code. Registration/login now identify users purely via
-- emailed one-time codes, so the old password/reset-token columns are unused.
--
-- IMPORTANT: deploy the new server code and run this migration together —
-- the new /auth/register endpoint no longer sends a password, and the old
-- `password` column is NOT NULL, so registrations will fail with a
-- "Field 'password' doesn't have a default value" error until this runs.

USE koorm_db;

ALTER TABLE users
  DROP COLUMN password,
  DROP COLUMN reset_token,
  DROP COLUMN reset_token_expiry;
