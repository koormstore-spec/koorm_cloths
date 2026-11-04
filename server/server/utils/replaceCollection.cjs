// Explicit one-time replacement; never runs automatically at server startup.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { pool } = require('../config/db');
const { products } = require('../data/collection-26.json');

async function main() {
  if (products.length !== 25 || new Set(products.map(p => p.slug)).size !== 25) throw new Error('Invalid replacement catalogue.');
  for (const product of products) {
    if (!(product.price > 0) || product.stock < 0 || product.images.length !== 6) throw new Error(`Invalid product: ${product.name}`);
    for (const image of product.images) {
      if (!image.startsWith(`/images/collection-26/${product.slug}/`) || !fs.existsSync(path.join(__dirname, '../../client/public', image))) {
        throw new Error(`Missing or invalid photo: ${image}`);
      }
    }
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [current] = await connection.query('SELECT * FROM products FOR UPDATE');
    if (current.length === products.length && current.every(p => products.some(next => next.slug === p.slug))) {
      console.log('Replacement catalogue is already installed; existing admin edits were preserved.');
      await connection.rollback();
      return;
    }
    console.log(`Replace ${current.length} existing products with ${products.length} new products and 150 photos.`);
    if (!process.argv.includes('--replace')) {
      console.log('Validation complete. Run with --replace to back up and replace the catalogue.');
      await connection.rollback();
      return;
    }
    const backup = { created_at: new Date().toISOString(), products: current };
    for (const table of ['categories', 'cart_items', 'wishlist_items', 'reviews', 'order_items']) {
      [backup[table]] = await connection.query(`SELECT * FROM ${table} FOR UPDATE`);
    }
    const backupDir = path.join(__dirname, '../backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `catalogue-${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), { flag: 'wx' });
    console.log(`Backup saved: ${backupPath}`);
    // Product references in old orders become NULL; order names/prices remain intact.
    // Existing product-specific carts, wishlists and reviews follow their FK rules.
    await connection.query('DELETE FROM products');
    await connection.query(
      'INSERT INTO categories (name, slug, image_url) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE image_url = VALUES(image_url)',
      ['Men', 'men', products.find(p => p.slug === 'olive-green-european-linen-shirt').images[0]],
    );
    const [[category]] = await connection.query('SELECT id FROM categories WHERE slug = ?', ['men']);
    for (const product of products) {
      await connection.query(
        `INSERT INTO products (name, slug, description, price, discount_price, category_id, brand, gender, sizes, colors, images, stock, rating, num_reviews, is_featured)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [product.name, product.slug, product.description, product.price, product.discount_price,
          category.id, product.brand, product.gender, JSON.stringify(product.sizes),
          JSON.stringify(product.colors), JSON.stringify(product.images), product.stock, 0, 0, product.is_featured],
      );
    }
    const [[result]] = await connection.query('SELECT COUNT(*) AS count FROM products');
    if (result.count !== 25) throw new Error('Catalogue count mismatch; rolling back.');
    await connection.commit();
    console.log('Installed 25 new products. Old catalogue removed from admin and storefront.');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
