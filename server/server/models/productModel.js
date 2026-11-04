const { pool } = require('../config/db');

const findById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
  return rows[0] || null;
};

const findBySlug = async (slug) => {
  const [rows] = await pool.query('SELECT * FROM products WHERE slug = ?', [slug]);
  return rows[0] || null;
};

const findRelated = async (categoryId, productId) => {
  const [rows] = await pool.query(
    'SELECT * FROM products WHERE category_id = ? AND id != ? LIMIT 4',
    [categoryId, productId]
  );
  return rows;
};

module.exports = { findById, findBySlug, findRelated };
