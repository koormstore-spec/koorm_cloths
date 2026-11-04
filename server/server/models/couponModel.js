const { pool } = require('../config/db');

const findByCode = async (code) => {
  const [rows] = await pool.query('SELECT * FROM coupons WHERE code = ?', [code]);
  return rows[0] || null;
};

const findById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM coupons WHERE id = ?', [id]);
  return rows[0] || null;
};

const list = async () => {
  const [rows] = await pool.query('SELECT * FROM coupons ORDER BY created_at DESC');
  return rows;
};

const create = async (coupon) => {
  const [result] = await pool.query(
    `INSERT INTO coupons (code, discount_type, discount_value, min_order_amount, max_discount_amount, usage_limit, expires_at, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [coupon.code, coupon.discount_type, coupon.discount_value, coupon.min_order_amount,
    coupon.max_discount_amount, coupon.usage_limit, coupon.expires_at, coupon.is_active]
  );
  return findById(result.insertId);
};

const update = async (id, coupon) => {
  await pool.query(
    `UPDATE coupons SET code = ?, discount_type = ?, discount_value = ?, min_order_amount = ?,
      max_discount_amount = ?, usage_limit = ?, expires_at = ?, is_active = ? WHERE id = ?`,
    [coupon.code, coupon.discount_type, coupon.discount_value, coupon.min_order_amount,
    coupon.max_discount_amount, coupon.usage_limit, coupon.expires_at, coupon.is_active, id]
  );
  return findById(id);
};

const remove = async (id) => {
  await pool.query('DELETE FROM coupons WHERE id = ?', [id]);
};

module.exports = { findByCode, findById, list, create, update, remove };
