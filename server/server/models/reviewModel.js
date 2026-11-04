const { pool } = require('../config/db');

const findByProductAndUser = async (productId, userId) => {
  const [rows] = await pool.query(
    'SELECT id FROM reviews WHERE product_id = ? AND user_id = ?',
    [productId, userId]
  );
  return rows[0] || null;
};

const getProductSummary = async (productId) => {
  const [rows] = await pool.query(
    'SELECT AVG(rating) AS avgRating, COUNT(*) AS count FROM reviews WHERE product_id = ?',
    [productId]
  );
  return rows[0];
};

module.exports = { findByProductAndUser, getProductSummary };
