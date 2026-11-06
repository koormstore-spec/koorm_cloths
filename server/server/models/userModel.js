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
    'UPDATE users SET verification_code = ?, verification_code_expiry = ?, verification_attempts = 0 WHERE id = ?',
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
    'UPDATE users SET is_verified = 1, verification_code = NULL, verification_code_expiry = NULL, verification_attempts = 0 WHERE id = ?',
    [id]
  );
};

// Counts a guess before the code is compared. The update is atomic, so guesses
// sent at the same moment can't get past the limit. False means there is no
// live code or its attempts are used up.
const recordCodeAttempt = async (email, maxAttempts) => {
  const [result] = await pool.query(
    `UPDATE users SET verification_attempts = verification_attempts + 1
     WHERE email = ? AND verification_code IS NOT NULL AND verification_attempts < ?`,
    [email, maxAttempts]
  );
  return result.affectedRows === 1;
};

// Returns true when this wrong guess used the last attempt and the code was cancelled.
const cancelCodeIfAttemptsUsed = async (email, maxAttempts) => {
  const [result] = await pool.query(
    `UPDATE users SET verification_code = NULL, verification_code_expiry = NULL
     WHERE email = ? AND verification_code IS NOT NULL AND verification_attempts >= ?`,
    [email, maxAttempts]
  );
  return result.affectedRows > 0;
};

const clearVerificationCode = async (id) => {
  await pool.query(
    'UPDATE users SET verification_code = NULL, verification_code_expiry = NULL, verification_attempts = 0 WHERE id = ?',
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
  recordCodeAttempt,
  cancelCodeIfAttemptsUsed,
  clearVerificationCode,
};
