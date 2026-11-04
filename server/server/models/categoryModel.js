const { pool } = require('../config/db');

const findBySlug = async (slug) => {
  const [rows] = await pool.query('SELECT * FROM categories WHERE slug = ?', [slug]);
  return rows[0] || null;
};

const list = async () => {
  const [rows] = await pool.query('SELECT * FROM categories ORDER BY name ASC');
  return rows;
};

module.exports = { findBySlug, list };
