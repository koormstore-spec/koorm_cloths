-- Ensure production admin accounts support email OTP password setup.
-- Run this against the shared koorm_db database before using admin setup.

USE koorm_db;

SET @has_verification_code = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'admins'
    AND column_name = 'verification_code'
);

SET @sql = IF(
  @has_verification_code = 0,
  'ALTER TABLE admins ADD COLUMN verification_code VARCHAR(64) NULL',
  'SELECT 1'
);
PREPARE add_verification_code FROM @sql;
EXECUTE add_verification_code;
DEALLOCATE PREPARE add_verification_code;

SET @has_verification_code_expiry = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'admins'
    AND column_name = 'verification_code_expiry'
);

SET @sql = IF(
  @has_verification_code_expiry = 0,
  'ALTER TABLE admins ADD COLUMN verification_code_expiry DATETIME NULL',
  'SELECT 1'
);
PREPARE add_verification_code_expiry FROM @sql;
EXECUTE add_verification_code_expiry;
DEALLOCATE PREPARE add_verification_code_expiry;

ALTER TABLE admins MODIFY COLUMN password VARCHAR(255) NULL;
