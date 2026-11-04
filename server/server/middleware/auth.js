const jwt = require('jsonwebtoken');
const { pool, adminPool } = require('../config/db');
const { userModel, adminModel } = require('../models');

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Not authorized, no token' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await userModel.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

// Unlike `protect`, this never rejects the request — it just attaches
// req.user when a valid token is present, so a public route can tailor its
// response for a signed-in visitor without requiring sign-in to view it.
const attachUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await userModel.findById(decoded.id);
      if (user) req.user = user;
    }
  } catch {
    // Invalid/expired token: proceed as an anonymous visitor.
  }
  next();
};

// Uses a separate token secret and the shared koorm_db admins table.
const protectAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Not authorized, no admin token' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);

    const admin = await adminModel.findById(decoded.id);
    if (!admin) {
      return res.status(401).json({ message: 'Not authorized, admin not found' });
    }
    req.admin = admin;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Not authorized, admin token failed' });
  }
};

module.exports = { protect, attachUser, protectAdmin };
