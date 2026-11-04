const { pool } = require('../config/db');

const listByUserId = async (userId) => {
  const [rows] = await pool.query(
    'SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC',
    [userId]
  );
  return rows;
};

const create = async (userId, address) => {
  const [result] = await pool.query(
    `INSERT INTO addresses (user_id, full_name, phone, address_line1, address_line2, city, state, pincode, is_default)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, address.full_name, address.phone, address.address_line1, address.address_line2 || null,
      address.city, address.state, address.pincode, address.is_default ? 1 : 0]
  );
  const [rows] = await pool.query('SELECT * FROM addresses WHERE id = ?', [result.insertId]);
  return rows[0];
};

const clearDefaultForUser = async (userId) => {
  await pool.query('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [userId]);
};

const removeForUser = async (id, userId) => {
  await pool.query('DELETE FROM addresses WHERE id = ? AND user_id = ?', [id, userId]);
};

module.exports = { listByUserId, create, clearDefaultForUser, removeForUser };
