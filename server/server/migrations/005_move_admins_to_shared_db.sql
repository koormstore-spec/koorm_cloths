-- Run this only when migrating an installation that still has koorm_admin_db.
-- The old database is intentionally not dropped; remove it after verification.

CREATE TABLE IF NOT EXISTS koorm_db.admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NULL,
  verification_code VARCHAR(64) NULL,
  verification_code_expiry DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO koorm_db.admins (id, name, email, password, created_at)
SELECT id, name, email, password, created_at
FROM koorm_admin_db.admins;
