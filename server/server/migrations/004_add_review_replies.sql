-- Lets an admin publicly reply to a customer review (product or store
-- review). Run against any existing koorm_db before/with deploying this.

USE koorm_db;

ALTER TABLE reviews
  ADD COLUMN admin_reply TEXT NULL,
  ADD COLUMN admin_reply_at TIMESTAMP NULL;

ALTER TABLE store_reviews
  ADD COLUMN admin_reply TEXT NULL,
  ADD COLUMN admin_reply_at TIMESTAMP NULL;
