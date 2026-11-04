const { pool } = require('../config/db');

const findByEmail = async (email) => {
  const [rows] = await pool.query('SELECT id, name, phone, email, is_verified FROM users WHERE email = ?', [email]);
  return rows[0] || null;
};

const findById = async (id) => {
  const [rows] = await pool.query('SELECT id, name, email, phone FROM users WHERE id = ?', [id]);
  return rows[0] || null;
};

const create = async ({ name, email, phone }) => {
  const [result] = await pool.query(
    'INSERT INTO users (name, email, phone) VALUES (?, ?, ?)',
    [name, email, phone || null]
  );
  return result.insertId;
};

const update = async (id, { name, phone }) => {
  await pool.query('UPDATE users SET name = ?, phone = ? WHERE id = ?', [name, phone, id]);
};

const updateVerificationCode = async (id, codeHash, expiry) => {
  await pool.query(
    'UPDATE users SET verification_code = ?, verification_code_expiry = ? WHERE id = ?',
    [codeHash, expiry, id]
  );
};

const findByVerificationCode = async (email, codeHash) => {
  const [rows] = await pool.query(
    `SELECT id, name, phone, is_verified FROM users
     WHERE email = ? AND verification_code = ? AND verification_code_expiry > NOW()`,
    [email, codeHash]
  );
  return rows[0] || null;
};

const markVerified = async (id) => {
  await pool.query(
    'UPDATE users SET is_verified = 1, verification_code = NULL, verification_code_expiry = NULL WHERE id = ?',
    [id]
  );
};

const clearVerificationCode = async (id) => {
  await pool.query(
    'UPDATE users SET verification_code = NULL, verification_code_expiry = NULL WHERE id = ?',
    [id]
  );
};

module.exports = {
  findByEmail,
  findById,
  create,
  update,
  updateVerificationCode,
  findByVerificationCode,
  markVerified,
  clearVerificationCode,
};
