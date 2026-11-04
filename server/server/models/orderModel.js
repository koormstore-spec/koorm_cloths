const { pool } = require('../config/db');

const findByIdForUser = async (id, userId) => {
  const [rows] = await pool.query('SELECT * FROM orders WHERE id = ? AND user_id = ?', [id, userId]);
  return rows[0] || null;
};

const listByUserId = async (userId) => {
  const [rows] = await pool.query(
    'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );
  return rows;
};

const listItems = async (orderId) => {
  const [rows] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
  return rows;
};

// A cancelled order never reached the customer, so it doesn't count as a
// purchase for review eligibility.
const hasPurchasedProduct = async (userId, productId) => {
  const [rows] = await pool.query(
    `SELECT oi.id FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.user_id = ? AND oi.product_id = ? AND o.status != 'cancelled'
     LIMIT 1`,
    [userId, productId]
  );
  return rows.length > 0;
};

module.exports = { findByIdForUser, listByUserId, listItems, hasPurchasedProduct };
