const { adminPool } = require('../config/db');

const findByEmail = async (email) => {
  const [rows] = await adminPool.query('SELECT * FROM admins WHERE email = ?', [email]);
  return rows[0] || null;
};

const findById = async (id) => {
  const [rows] = await adminPool.query('SELECT id, name, email FROM admins WHERE id = ?', [id]);
  return rows[0] || null;
};

const createPending = async (email, codeHash, expiry) => {
  const [result] = await adminPool.query(
    'INSERT INTO admins (name, email, verification_code, verification_code_expiry) VALUES (?, ?, ?, ?)',
    ['Koorm Admin', email, codeHash, expiry]
  );
  return result.insertId;
};

const updateVerificationCode = async (id, codeHash, expiry) => {
  await adminPool.query(
    'UPDATE admins SET verification_code = ?, verification_code_expiry = ? WHERE id = ?',
    [codeHash, expiry, id]
  );
};

const findByVerificationCode = async (email, codeHash) => {
  const [rows] = await adminPool.query(
    `SELECT id, name, email FROM admins
     WHERE email = ? AND verification_code = ? AND verification_code_expiry > NOW()`,
    [email, codeHash]
  );
  return rows[0] || null;
};

const setPassword = async (id, passwordHash) => {
  await adminPool.query(
    'UPDATE admins SET password = ?, verification_code = NULL, verification_code_expiry = NULL WHERE id = ?',
    [passwordHash, id]
  );
};

module.exports = {
  findByEmail,
  findById,
  createPending,
  updateVerificationCode,
  findByVerificationCode,
  setPassword,
};
