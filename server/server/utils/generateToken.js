const jwt = require('jsonwebtoken');

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

const generateAdminToken = (adminId) => {
  return jwt.sign({ id: adminId }, process.env.ADMIN_JWT_SECRET, {
    expiresIn: '7d',
  });
};

module.exports = { generateToken, generateAdminToken };
