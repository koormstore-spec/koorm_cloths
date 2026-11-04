const { pool } = require('../config/db');

const listByUserId = async (userId) => {
  const [rows] = await pool.query(
    `SELECT w.id AS wishlist_id, p.* FROM wishlist_items w
     JOIN products p ON w.product_id = p.id
     WHERE w.user_id = ? ORDER BY w.id DESC`,
    [userId]
  );
  return rows;
};

module.exports = { listByUserId };
