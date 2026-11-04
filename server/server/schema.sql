-- Koorm Clothing E-Commerce Database Schema
-- Run this file against MySQL to create the database, tables, and seed data.
-- Admin accounts use the shared database — see admin_schema.sql.
-- This database (koorm_db) holds only customers and catalog/order data.

CREATE DATABASE IF NOT EXISTS koorm_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE koorm_db;

-- ---------- USERS (customers only) ----------
-- Passwordless: identity is proven by emailed one-time codes, both at
-- registration and at login. See migrations/002_drop_password.sql for
-- upgrading an existing database that still has the old password column.
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  phone VARCHAR(20),
  is_verified TINYINT(1) NOT NULL DEFAULT 0,
  verification_code VARCHAR(255) NULL,
  verification_code_expiry DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------- ADDRESSES ----------
CREATE TABLE IF NOT EXISTS addresses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  address_line1 VARCHAR(255) NOT NULL,
  address_line2 VARCHAR(255),
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  pincode VARCHAR(12) NOT NULL,
  is_default TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ---------- CATEGORIES ----------
CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(120) NOT NULL UNIQUE,
  image_url VARCHAR(500)
);

-- ---------- PRODUCTS ----------
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(220) NOT NULL UNIQUE,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  discount_price DECIMAL(10,2),
  category_id INT,
  brand VARCHAR(100) DEFAULT 'Koorm',
  gender ENUM('men', 'women', 'unisex', 'kids') DEFAULT 'unisex',
  sizes JSON,
  colors JSON,
  images JSON,
  stock INT DEFAULT 100,
  rating DECIMAL(2,1) DEFAULT 0,
  num_reviews INT DEFAULT 0,
  is_featured TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- ---------- CART ----------
CREATE TABLE IF NOT EXISTS cart_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  product_id INT NOT NULL,
  size VARCHAR(20) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_cart_item (user_id, product_id, size),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- ---------- WISHLIST ----------
CREATE TABLE IF NOT EXISTS wishlist_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  product_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_wishlist_item (user_id, product_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- ---------- COUPONS ----------
CREATE TABLE IF NOT EXISTS coupons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  discount_type ENUM('percent','flat') NOT NULL DEFAULT 'percent',
  discount_value DECIMAL(10,2) NOT NULL,
  min_order_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  max_discount_amount DECIMAL(10,2) NULL,
  usage_limit INT NULL,
  used_count INT NOT NULL DEFAULT 0,
  expires_at DATETIME NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------- ORDERS ----------
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  order_number VARCHAR(30) NOT NULL UNIQUE,
  items_total DECIMAL(10,2) NOT NULL,
  shipping_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  coupon_code VARCHAR(40) NULL,
  discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(10,2) NOT NULL,
  payment_method VARCHAR(30) NOT NULL DEFAULT 'COD',
  status ENUM('pending_payment','placed','processing','shipped','delivered','cancelled') NOT NULL DEFAULT 'placed',
  cancellation_status ENUM('none','requested','approved') NOT NULL DEFAULT 'none',
  cancellation_requested_at DATETIME NULL,
  -- 'cod' = cash on delivery; online orders move pending -> paid (or failed), then optionally refunded.
  payment_status ENUM('cod','pending','paid','failed','partially_refunded','refunded') NOT NULL DEFAULT 'cod',
  razorpay_order_id VARCHAR(64) NULL,
  razorpay_payment_id VARCHAR(64) NULL,
  paid_at DATETIME NULL,
  refunded_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  delivered_at DATETIME NULL,
  shipping_name VARCHAR(120) NOT NULL,
  shipping_phone VARCHAR(20) NOT NULL,
  shipping_address_line1 VARCHAR(255) NOT NULL,
  shipping_address_line2 VARCHAR(255),
  shipping_city VARCHAR(100) NOT NULL,
  shipping_state VARCHAR(100) NOT NULL,
  shipping_pincode VARCHAR(12) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX orders_razorpay_order (razorpay_order_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ---------- ORDER ITEMS ----------
CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT,
  product_name VARCHAR(200) NOT NULL,
  product_image VARCHAR(500),
  size VARCHAR(20),
  quantity INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

-- ---------- RETURN REQUESTS ----------
CREATE TABLE IF NOT EXISTS return_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  user_id INT NOT NULL,
  request_type ENUM('return','exchange') NOT NULL DEFAULT 'return',
  exchange_details VARCHAR(1000) NULL,
  reason VARCHAR(80) NOT NULL,
  note VARCHAR(1000) NULL,
  status ENUM('requested','approved','rejected','received','refunded','exchanged') NOT NULL DEFAULT 'requested',
  admin_note VARCHAR(1000) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Private evidence photos, served only to the order owner or an admin.
CREATE TABLE IF NOT EXISTS return_request_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  return_request_id INT NOT NULL,
  content_type VARCHAR(32) NOT NULL,
  image_data MEDIUMBLOB NOT NULL,
  FOREIGN KEY (return_request_id) REFERENCES return_requests(id) ON DELETE CASCADE
);

-- ---------- REFUNDS ----------
-- method 'razorpay' = refunded to the original online payment;
-- 'manual' = recorded by the admin (e.g. a bank/UPI transfer for a COD order).
CREATE TABLE IF NOT EXISTS refunds (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  return_request_id INT NULL,
  amount DECIMAL(10,2) NOT NULL,
  reason VARCHAR(255) NULL,
  method ENUM('razorpay','manual') NOT NULL,
  razorpay_refund_id VARCHAR(64) NULL,
  reference VARCHAR(120) NULL,
  status ENUM('pending','processed','failed') NOT NULL DEFAULT 'pending',
  initiated_by VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX refunds_gateway (razorpay_refund_id),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (return_request_id) REFERENCES return_requests(id) ON DELETE SET NULL
);

-- ---------- REVIEWS ----------
CREATE TABLE IF NOT EXISTS reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  user_id INT NOT NULL,
  rating TINYINT NOT NULL,
  comment TEXT,
  admin_reply TEXT NULL,
  admin_reply_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_review (product_id, user_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ---------- STORE REVIEWS ----------
CREATE TABLE IF NOT EXISTS store_reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  rating TINYINT NOT NULL,
  comment VARCHAR(1000) NOT NULL,
  admin_reply TEXT NULL,
  admin_reply_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY store_review_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =========================================================
-- SEED DATA
-- New collection from Updated_26_charts. Prices/sizes are provisional; stock awaits confirmation.

INSERT INTO categories (name, slug, image_url) VALUES
('Men', 'men', '/images/collection-26/olive-green-european-linen-shirt/1.jpg')
ON DUPLICATE KEY UPDATE image_url = VALUES(image_url);

INSERT INTO products (name, slug, description, price, discount_price, category_id, brand, gender, sizes, colors, images, stock, rating, num_reviews, is_featured) VALUES
('Light Pink Linen Shirt', 'light-pink-linen-shirt', 'Light Pink Linen Shirt in 100% linen. A light pink addition to the Koorm collection, easy to pair with your everyday wardrobe. Explore all six photographs for a closer look at the fabric and styling.', 2499, 1874.25, (SELECT id FROM categories WHERE slug = 'men'), 'Koorm', 'men', '["S","M","L","XL","XXL"]', '["Light Pink"]', '["/images/collection-26/light-pink-linen-shirt/1.jpg","/images/collection-26/light-pink-linen-shirt/2.jpg","/images/collection-26/light-pink-linen-shirt/3.jpg","/images/collection-26/light-pink-linen-shirt/4.jpg","/images/collection-26/light-pink-linen-shirt/5.jpg","/images/collection-26/light-pink-linen-shirt/6.jpg"]', 0, 0, 0, 0),
('Aqua Blue Printed Linen Shirt', 'aqua-blue-printed-linen-shirt', 'Aqua Blue Printed Linen Shirt in 100% European linen. A aqua blue addition to the Koorm collection, easy to pair with your everyday wardrobe. Explore all six photographs for a closer look at the fabric and styling.', 2499, 1874.25, (SELECT id FROM categories WHERE slug = 'men'), 'Koorm', 'men', '["S","M","L","XL","XXL"]', '["Aqua Blue"]', '["/images/collection-26/aqua-blue-printed-linen-shirt/1.jpg","/images/collection-26/aqua-blue-printed-linen-shirt/2.jpg","/images/collection-26/aqua-blue-printed-linen-shirt/3.jpg","/images/collection-26/aqua-blue-printed-linen-shirt/4.jpg","/images/collection-26/aqua-blue-printed-linen-shirt/5.jpg","/images/collection-26/aqua-blue-printed-linen-shirt/6.jpg"]', 0, 0, 0, 0),
('Black Micro Print Cotton Shirt', 'black-micro-print-cotton-shirt', 'Black Micro Print Cotton Shirt in 100% cotton. A black addition to the Koorm collection, easy to pair with your everyday wardrobe. Explore all six photographs for a closer look at the fabric and styling.', 2499, 1874.25, (SELECT id FROM categories WHERE slug = 'men'), 'Koorm', 'men', '["S","M","L","XL","XXL"]', '["Black"]', '["/images/collection-26/black-micro-print-cotton-shirt/1.jpg","/images/collection-26/black-micro-print-cotton-shirt/2.jpg","/images/collection-26/black-micro-print-cotton-shirt/3.jpg","/images/collection-26/black-micro-print-cotton-shirt/4.jpg","/images/collection-26/black-micro-print-cotton-shirt/5.jpg","/images/collection-26/black-micro-print-cotton-shirt/6.jpg"]', 0, 0, 0, 0),
('Blush Check Cotton Shirt', 'blush-check-cotton-shirt', 'Blush Check Cotton Shirt in cotton. A blush pink addition to the Koorm collection, easy to pair with your everyday wardrobe. Explore all six photographs for a closer look at the fabric and styling.', 2499, 1874.25, (SELECT id FROM categories WHERE slug = 'men'), 'Koorm', 'men', '["S","M","L","XL","XXL"]', '["Blush Pink"]', '["/images/collection-26/blush-check-cotton-shirt/1.jpg","/images/collection-26/blush-check-cotton-shirt/2.jpg","/images/collection-26/blush-check-cotton-shirt/3.jpg","/images/collection-26/blush-check-cotton-shirt/4.jpg","/images/collection-26/blush-check-cotton-shirt/5.jpg","/images/collection-26/blush-check-cotton-shirt/6.jpg"]', 0, 0, 0, 1),
('Burgundy Check Twill Shirt', 'burgundy-check-twill-shirt', 'Burgundy Check Twill Shirt in twill. A burgundy addition to the Koorm collection, easy to pair with your everyday wardrobe. Explore all six photographs for a closer look at the fabric and styling.', 2499, 1874.25, (SELECT id FROM categories WHERE slug = 'men'), 'Koorm', 'men', '["S","M","L","XL","XXL"]', '["Burgundy"]', '["/images/collection-26/burgundy-check-twill-shirt/1.jpg","/images/collection-26/burgundy-check-twill-shirt/2.jpg","/images/collection-26/burgundy-check-twill-shirt/3.jpg","/images/collection-26/burgundy-check-twill-shirt/4.jpg","/images/collection-26/burgundy-check-twill-shirt/5.jpg","/images/collection-26/burgundy-check-twill-shirt/6.jpg"]', 0, 0, 0, 0),
('Charcoal Check Cotton Twill Shirt', 'charcoal-check-cotton-twill-shirt', 'Charcoal Check Cotton Twill Shirt in cotton twill. A charcoal addition to the Koorm collection, easy to pair with your everyday wardrobe. Explore all six photographs for a closer look at the fabric and styling.', 2499, 1874.25, (SELECT id FROM categories WHERE slug = 'men'), 'Koorm', 'men', '["S","M","L","XL","XXL"]', '["Charcoal"]', '["/images/collection-26/charcoal-check-cotton-twill-shirt/1.jpg","/images/collection-26/charcoal-check-cotton-twill-shirt/2.jpg","/images/collection-26/charcoal-check-cotton-twill-shirt/3.jpg","/images/collection-26/charcoal-check-cotton-twill-shirt/4.jpg","/images/collection-26/charcoal-check-cotton-twill-shirt/5.jpg","/images/collection-26/charcoal-check-cotton-twill-shirt/6.jpg"]', 0, 0, 0, 0),
('Charcoal Grey Oxford Shirt', 'charcoal-grey-oxford-shirt', 'Charcoal Grey Oxford Shirt in Oxford weave. A charcoal grey addition to the Koorm collection, easy to pair with your everyday wardrobe. Explore all six photographs for a closer look at the fabric and styling.', 2499, 1874.25, (SELECT id FROM categories WHERE slug = 'men'), 'Koorm', 'men', '["S","M","L","XL","XXL"]', '["Charcoal Grey"]', '["/images/collection-26/charcoal-grey-oxford-shirt/1.jpg","/images/collection-26/charcoal-grey-oxford-shirt/2.jpg","/images/collection-26/charcoal-grey-oxford-shirt/3.jpg","/images/collection-26/charcoal-grey-oxford-shirt/4.jpg","/images/collection-26/charcoal-grey-oxford-shirt/5.jpg","/images/collection-26/charcoal-grey-oxford-shirt/6.jpg"]', 0, 0, 0, 1),
('Light Blue Stripe Cotton Linen Shirt', 'light-blue-stripe-cotton-linen-shirt', 'Light Blue Stripe Cotton Linen Shirt in cotton linen blend. A light blue addition to the Koorm collection, easy to pair with your everyday wardrobe. Explore all six photographs for a closer look at the fabric and styling.', 2499, 1874.25, (SELECT id FROM categories WHERE slug = 'men'), 'Koorm', 'men', '["S","M","L","XL","XXL"]', '["Light Blue"]', '["/images/collection-26/light-blue-stripe-cotton-linen-shirt/1.jpg","/images/collection-26/light-blue-stripe-cotton-linen-shirt/2.jpg","/images/collection-26/light-blue-stripe-cotton-linen-shirt/3.jpg","/images/collection-26/light-blue-stripe-cotton-linen-shirt/4.jpg","/images/collection-26/light-blue-stripe-cotton-linen-shirt/5.jpg","/images/collection-26/light-blue-stripe-cotton-linen-shirt/6.jpg"]', 0, 0, 0, 0),
('Royal Blue Cotton Linen Shirt', 'royal-blue-cotton-linen-shirt', 'Royal Blue Cotton Linen Shirt in cotton linen blend. A royal blue addition to the Koorm collection, easy to pair with your everyday wardrobe. Explore all six photographs for a closer look at the fabric and styling.', 2499, 1874.25, (SELECT id FROM categories WHERE slug = 'men'), 'Koorm', 'men', '["S","M","L","XL","XXL"]', '["Royal Blue"]', '["/images/collection-26/royal-blue-cotton-linen-shirt/1.jpg","/images/collection-26/royal-blue-cotton-linen-shirt/2.jpg","/images/collection-26/royal-blue-cotton-linen-shirt/3.jpg","/images/collection-26/royal-blue-cotton-linen-shirt/4.jpg","/images/collection-26/royal-blue-cotton-linen-shirt/5.jpg","/images/collection-26/royal-blue-cotton-linen-shirt/6.jpg"]', 0, 0, 0, 0),
('Chocolate Brown Cotton Shirt', 'chocolate-brown-cotton-shirt', 'Chocolate Brown Cotton Shirt in 100% cotton. A chocolate brown addition to the Koorm collection, easy to pair with your everyday wardrobe. Explore all six photographs for a closer look at the fabric and styling.', 2499, 1874.25, (SELECT id FROM categories WHERE slug = 'men'), 'Koorm', 'men', '["S","M","L","XL","XXL"]', '["Chocolate Brown"]', '["/images/collection-26/chocolate-brown-cotton-shirt/1.jpg","/images/collection-26/chocolate-brown-cotton-shirt/2.jpg","/images/collection-26/chocolate-brown-cotton-shirt/3.jpg","/images/collection-26/chocolate-brown-cotton-shirt/4.jpg","/images/collection-26/chocolate-brown-cotton-shirt/5.jpg","/images/collection-26/chocolate-brown-cotton-shirt/6.jpg"]', 0, 0, 0, 0),
('Dark Navy Cotton Shirt', 'dark-navy-cotton-shirt', 'Dark Navy Cotton Shirt in 100% cotton. A dark navy addition to the Koorm collection, easy to pair with your everyday wardrobe. Explore all six photographs for a closer look at the fabric and styling.', 2499, 1874.25, (SELECT id FROM categories WHERE slug = 'men'), 'Koorm', 'men', '["S","M","L","XL","XXL"]', '["Dark Navy"]', '["/images/collection-26/dark-navy-cotton-shirt/1.jpg","/images/collection-26/dark-navy-cotton-shirt/2.jpg","/images/collection-26/dark-navy-cotton-shirt/3.jpg","/images/collection-26/dark-navy-cotton-shirt/4.jpg","/images/collection-26/dark-navy-cotton-shirt/5.jpg","/images/collection-26/dark-navy-cotton-shirt/6.jpg"]', 0, 0, 0, 0),
('Rust European Linen Shirt', 'rust-european-linen-shirt', 'Rust European Linen Shirt in 100% European linen. A rust addition to the Koorm collection, easy to pair with your everyday wardrobe. Explore all six photographs for a closer look at the fabric and styling.', 2499, 1874.25, (SELECT id FROM categories WHERE slug = 'men'), 'Koorm', 'men', '["S","M","L","XL","XXL"]', '["Rust"]', '["/images/collection-26/rust-european-linen-shirt/1.jpg","/images/collection-26/rust-european-linen-shirt/2.jpg","/images/collection-26/rust-european-linen-shirt/3.jpg","/images/collection-26/rust-european-linen-shirt/4.jpg","/images/collection-26/rust-european-linen-shirt/5.jpg","/images/collection-26/rust-european-linen-shirt/6.jpg"]', 0, 0, 0, 1),
('Light Pink Printed Cotton Shirt', 'light-pink-printed-cotton-shirt', 'Light Pink Printed Cotton Shirt in cotton. A light pink addition to the Koorm collection, easy to pair with your everyday wardrobe. Explore all six photographs for a closer look at the fabric and styling.', 2499, 1874.25, (SELECT id FROM categories WHERE slug = 'men'), 'Koorm', 'men', '["S","M","L","XL","XXL"]', '["Light Pink"]', '["/images/collection-26/light-pink-printed-cotton-shirt/1.jpg","/images/collection-26/light-pink-printed-cotton-shirt/2.jpg","/images/collection-26/light-pink-printed-cotton-shirt/3.jpg","/images/collection-26/light-pink-printed-cotton-shirt/4.jpg","/images/collection-26/light-pink-printed-cotton-shirt/5.jpg","/images/collection-26/light-pink-printed-cotton-shirt/6.jpg"]', 0, 0, 0, 0),
('Monochrome Check Cotton Shirt', 'monochrome-check-cotton-shirt', 'Monochrome Check Cotton Shirt in 100% cotton. A black & white addition to the Koorm collection, easy to pair with your everyday wardrobe. Explore all six photographs for a closer look at the fabric and styling.', 2499, 1874.25, (SELECT id FROM categories WHERE slug = 'men'), 'Koorm', 'men', '["S","M","L","XL","XXL"]', '["Black & White"]', '["/images/collection-26/monochrome-check-cotton-shirt/1.jpg","/images/collection-26/monochrome-check-cotton-shirt/2.jpg","/images/collection-26/monochrome-check-cotton-shirt/3.jpg","/images/collection-26/monochrome-check-cotton-shirt/4.jpg","/images/collection-26/monochrome-check-cotton-shirt/5.jpg","/images/collection-26/monochrome-check-cotton-shirt/6.jpg"]', 0, 0, 0, 0),
('Mustard Check Twill Shirt', 'mustard-check-twill-shirt', 'Mustard Check Twill Shirt in twill. A mustard addition to the Koorm collection, easy to pair with your everyday wardrobe. Explore all six photographs for a closer look at the fabric and styling.', 2499, 1874.25, (SELECT id FROM categories WHERE slug = 'men'), 'Koorm', 'men', '["S","M","L","XL","XXL"]', '["Mustard"]', '["/images/collection-26/mustard-check-twill-shirt/1.jpg","/images/collection-26/mustard-check-twill-shirt/2.jpg","/images/collection-26/mustard-check-twill-shirt/3.jpg","/images/collection-26/mustard-check-twill-shirt/4.jpg","/images/collection-26/mustard-check-twill-shirt/5.jpg","/images/collection-26/mustard-check-twill-shirt/6.jpg"]', 0, 0, 0, 0),
('Off White Check Twill Shirt', 'off-white-check-twill-shirt', 'Off White Check Twill Shirt in twill. A off white addition to the Koorm collection, easy to pair with your everyday wardrobe. Explore all six photographs for a closer look at the fabric and styling.', 2499, 1874.25, (SELECT id FROM categories WHERE slug = 'men'), 'Koorm', 'men', '["S","M","L","XL","XXL"]', '["Off White"]', '["/images/collection-26/off-white-check-twill-shirt/1.jpg","/images/collection-26/off-white-check-twill-shirt/2.jpg","/images/collection-26/off-white-check-twill-shirt/3.jpg","/images/collection-26/off-white-check-twill-shirt/4.jpg","/images/collection-26/off-white-check-twill-shirt/5.jpg","/images/collection-26/off-white-check-twill-shirt/6.jpg"]', 0, 0, 0, 0),
('Olive Green European Linen Shirt', 'olive-green-european-linen-shirt', 'Olive Green European Linen Shirt in 100% European linen. A olive green addition to the Koorm collection, easy to pair with your everyday wardrobe. Explore all six photographs for a closer look at the fabric and styling.', 2499, 1874.25, (SELECT id FROM categories WHERE slug = 'men'), 'Koorm', 'men', '["S","M","L","XL","XXL"]', '["Olive Green"]', '["/images/collection-26/olive-green-european-linen-shirt/1.jpg","/images/collection-26/olive-green-european-linen-shirt/2.jpg","/images/collection-26/olive-green-european-linen-shirt/3.jpg","/images/collection-26/olive-green-european-linen-shirt/4.jpg","/images/collection-26/olive-green-european-linen-shirt/5.jpg","/images/collection-26/olive-green-european-linen-shirt/6.jpg"]', 0, 0, 0, 1),
('Olive Green Check Twill Shirt', 'olive-green-check-twill-shirt', 'Olive Green Check Twill Shirt in twill. A olive green addition to the Koorm collection, easy to pair with your everyday wardrobe. Explore all six photographs for a closer look at the fabric and styling.', 2499, 1874.25, (SELECT id FROM categories WHERE slug = 'men'), 'Koorm', 'men', '["S","M","L","XL","XXL"]', '["Olive Green"]', '["/images/collection-26/olive-green-check-twill-shirt/1.jpg","/images/collection-26/olive-green-check-twill-shirt/2.jpg","/images/collection-26/olive-green-check-twill-shirt/3.jpg","/images/collection-26/olive-green-check-twill-shirt/4.jpg","/images/collection-26/olive-green-check-twill-shirt/5.jpg","/images/collection-26/olive-green-check-twill-shirt/6.jpg"]', 0, 0, 0, 0),
('Petrol Blue Check Twill Shirt', 'petrol-blue-check-twill-shirt', 'Petrol Blue Check Twill Shirt in twill. A petrol blue addition to the Koorm collection, easy to pair with your everyday wardrobe. Explore all six photographs for a closer look at the fabric and styling.', 2499, 1874.25, (SELECT id FROM categories WHERE slug = 'men'), 'Koorm', 'men', '["S","M","L","XL","XXL"]', '["Petrol Blue"]', '["/images/collection-26/petrol-blue-check-twill-shirt/1.jpg","/images/collection-26/petrol-blue-check-twill-shirt/2.jpg","/images/collection-26/petrol-blue-check-twill-shirt/3.jpg","/images/collection-26/petrol-blue-check-twill-shirt/4.jpg","/images/collection-26/petrol-blue-check-twill-shirt/5.jpg","/images/collection-26/petrol-blue-check-twill-shirt/6.jpg"]', 0, 0, 0, 1),
('Rust Oxford Shirt', 'rust-oxford-shirt', 'Rust Oxford Shirt in Oxford weave. A rust addition to the Koorm collection, easy to pair with your everyday wardrobe. Explore all six photographs for a closer look at the fabric and styling.', 2499, 1874.25, (SELECT id FROM categories WHERE slug = 'men'), 'Koorm', 'men', '["S","M","L","XL","XXL"]', '["Rust"]', '["/images/collection-26/rust-oxford-shirt/1.jpg","/images/collection-26/rust-oxford-shirt/2.jpg","/images/collection-26/rust-oxford-shirt/3.jpg","/images/collection-26/rust-oxford-shirt/4.jpg","/images/collection-26/rust-oxford-shirt/5.jpg","/images/collection-26/rust-oxford-shirt/6.jpg"]', 0, 0, 0, 1),
('Sand Beige Linen Shirt', 'sand-beige-linen-shirt', 'Sand Beige Linen Shirt in 100% linen. A sand beige addition to the Koorm collection, easy to pair with your everyday wardrobe. Explore all six photographs for a closer look at the fabric and styling.', 2499, 1874.25, (SELECT id FROM categories WHERE slug = 'men'), 'Koorm', 'men', '["S","M","L","XL","XXL"]', '["Sand Beige"]', '["/images/collection-26/sand-beige-linen-shirt/1.jpg","/images/collection-26/sand-beige-linen-shirt/2.jpg","/images/collection-26/sand-beige-linen-shirt/3.jpg","/images/collection-26/sand-beige-linen-shirt/4.jpg","/images/collection-26/sand-beige-linen-shirt/5.jpg","/images/collection-26/sand-beige-linen-shirt/6.jpg"]', 0, 0, 0, 0),
('Cherry Check Twill Shirt', 'cherry-check-twill-shirt', 'Cherry Check Twill Shirt in twill. A cherry addition to the Koorm collection, easy to pair with your everyday wardrobe. Explore all six photographs for a closer look at the fabric and styling.', 2499, 1874.25, (SELECT id FROM categories WHERE slug = 'men'), 'Koorm', 'men', '["S","M","L","XL","XXL"]', '["Cherry"]', '["/images/collection-26/cherry-check-twill-shirt/1.jpg","/images/collection-26/cherry-check-twill-shirt/2.jpg","/images/collection-26/cherry-check-twill-shirt/3.jpg","/images/collection-26/cherry-check-twill-shirt/4.jpg","/images/collection-26/cherry-check-twill-shirt/5.jpg","/images/collection-26/cherry-check-twill-shirt/6.jpg"]', 0, 0, 0, 0),
('Rust Orange Check Twill Shirt', 'rust-orange-check-twill-shirt', 'Rust Orange Check Twill Shirt in twill. A rust orange addition to the Koorm collection, easy to pair with your everyday wardrobe. Explore all six photographs for a closer look at the fabric and styling.', 2499, 1874.25, (SELECT id FROM categories WHERE slug = 'men'), 'Koorm', 'men', '["S","M","L","XL","XXL"]', '["Rust Orange"]', '["/images/collection-26/rust-orange-check-twill-shirt/1.jpg","/images/collection-26/rust-orange-check-twill-shirt/2.jpg","/images/collection-26/rust-orange-check-twill-shirt/3.jpg","/images/collection-26/rust-orange-check-twill-shirt/4.jpg","/images/collection-26/rust-orange-check-twill-shirt/5.jpg","/images/collection-26/rust-orange-check-twill-shirt/6.jpg"]', 0, 0, 0, 0),
('White Grey Stripe Cotton Shirt', 'white-grey-stripe-cotton-shirt', 'White Grey Stripe Cotton Shirt in cotton. A white & grey addition to the Koorm collection, easy to pair with your everyday wardrobe. Explore all six photographs for a closer look at the fabric and styling.', 2499, 1874.25, (SELECT id FROM categories WHERE slug = 'men'), 'Koorm', 'men', '["S","M","L","XL","XXL"]', '["White & Grey"]', '["/images/collection-26/white-grey-stripe-cotton-shirt/1.jpg","/images/collection-26/white-grey-stripe-cotton-shirt/2.jpg","/images/collection-26/white-grey-stripe-cotton-shirt/3.jpg","/images/collection-26/white-grey-stripe-cotton-shirt/4.jpg","/images/collection-26/white-grey-stripe-cotton-shirt/5.jpg","/images/collection-26/white-grey-stripe-cotton-shirt/6.jpg"]', 0, 0, 0, 0),
('White Grey Cotton Shirt', 'white-grey-cotton-shirt', 'White Grey Cotton Shirt in 100% cotton. A white & grey addition to the Koorm collection, easy to pair with your everyday wardrobe. Explore all six photographs for a closer look at the fabric and styling.', 2499, 1874.25, (SELECT id FROM categories WHERE slug = 'men'), 'Koorm', 'men', '["S","M","L","XL","XXL"]', '["White & Grey"]', '["/images/collection-26/white-grey-cotton-shirt/1.jpg","/images/collection-26/white-grey-cotton-shirt/2.jpg","/images/collection-26/white-grey-cotton-shirt/3.jpg","/images/collection-26/white-grey-cotton-shirt/4.jpg","/images/collection-26/white-grey-cotton-shirt/5.jpg","/images/collection-26/white-grey-cotton-shirt/6.jpg"]', 0, 0, 0, 0)
ON DUPLICATE KEY UPDATE name = VALUES(name);
