USE koorm_db;

ALTER TABLE admins
  MODIFY COLUMN password VARCHAR(255) NULL,
  ADD COLUMN verification_code VARCHAR(64) NULL,
  ADD COLUMN verification_code_expiry DATETIME NULL;
