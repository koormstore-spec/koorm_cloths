const { pool } = require('../config/db');

const listByUserId = async (userId) => {
  const [rows] = await pool.query(
    `SELECT ci.id, ci.size, ci.quantity, p.id AS product_id, p.name, p.slug, p.price,
            p.discount_price, p.images, p.stock
     FROM cart_items ci JOIN products p ON ci.product_id = p.id
     WHERE ci.user_id = ? ORDER BY ci.id DESC`,
    [userId]
  );
  return rows;
};

module.exports = { listByUserId };
