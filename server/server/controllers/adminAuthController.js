const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { adminModel } = require('../models');
const { generateAdminToken } = require('../utils/generateToken');
const { sendAdminVerificationCodeEmail } = require('../utils/email');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'koormstore@gmail.com').split(',')[0].trim();
const CODE_TTL_MS = 10 * 60 * 1000;
const hashCode = code => crypto.createHash('sha256').update(code).digest('hex');
const generateCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

// A 6-digit code can be guessed, so a code is cancelled after a few wrong tries.
const MAX_CODE_ATTEMPTS = 5;
const failedCodeAttempts = new Map();

const adminLogin = async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const { password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    const admin = await adminModel.findByEmail(email);
    if (!admin) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    if (!admin.password) {
      return res.status(403).json({ message: 'Finish setting up your admin password with the email verification code first' });
    }
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const token = generateAdminToken(admin.id);
    res.json({
      id: admin.id,
      name: admin.name,
      email: admin.email,
      token,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const requestAdminSetupCode = async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ message: 'Email is required' });
    if (email !== ADMIN_EMAIL.toLowerCase()) {
      return res.status(403).json({ message: 'Use the configured admin email address' });
    }

    const admin = await adminModel.findByEmail(email);
    if (admin?.password) {
      return res.status(400).json({ message: 'This admin account is already set up. Sign in with your password.' });
    }

    const code = generateCode();
    failedCodeAttempts.delete(email);
    const expiry = new Date(Date.now() + CODE_TTL_MS);
    if (!admin) {
      await adminModel.createPending(email, hashCode(code), expiry);
    } else {
      await adminModel.updateVerificationCode(admin.id, hashCode(code), expiry);
    }

    sendAdminVerificationCodeEmail({ name: admin?.name || 'Admin', email, code }).catch(err =>
      console.error('Admin verification email dispatch failed:', err.message)
    );
    res.json({ message: 'A verification code has been sent to the admin email address.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const verifyAdminSetup = async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const code = String(req.body.code || '').trim();
    const password = String(req.body.password || '');
    if (!email || !code || !password) {
      return res.status(400).json({ message: 'Email, verification code, and password are required' });
    }
    if (email !== ADMIN_EMAIL.toLowerCase()) {
      return res.status(403).json({ message: 'Use the configured admin email address' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const admin = await adminModel.findByVerificationCode(email, hashCode(code));
    if (!admin) {
      const failures = (failedCodeAttempts.get(email) || 0) + 1;
      if (failures >= MAX_CODE_ATTEMPTS) {
        failedCodeAttempts.delete(email);
        const existing = await adminModel.findByEmail(email);
        if (existing) await adminModel.updateVerificationCode(existing.id, null, null);
        return res.status(429).json({ message: 'Too many incorrect codes. Please request a new code.' });
      }
      failedCodeAttempts.set(email, failures);
      return res.status(400).json({ message: 'Invalid or expired verification code' });
    }
    failedCodeAttempts.delete(email);

    const hashedPassword = await bcrypt.hash(password, 10);
    await adminModel.setPassword(admin.id, hashedPassword);

    const token = generateAdminToken(admin.id);
    res.json({ id: admin.id, name: admin.name, email: admin.email, token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Forgotten password: email a code to the admin address, then the same code
// check as first-time setup lets them choose a new password.
const requestAdminPasswordReset = async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ message: 'Email is required' });
    if (email !== ADMIN_EMAIL.toLowerCase()) {
      return res.status(403).json({ message: 'Use the configured admin email address' });
    }
    const admin = await adminModel.findByEmail(email);
    if (!admin?.password) {
      return res.status(400).json({ message: 'This admin account has no password yet. Use "First-time admin? Set up your account" instead.' });
    }

    const code = generateCode();
    failedCodeAttempts.delete(email);
    await adminModel.updateVerificationCode(admin.id, hashCode(code), new Date(Date.now() + CODE_TTL_MS));
    sendAdminVerificationCodeEmail({ name: admin.name, email, code, purpose: 'reset' }).catch(err =>
      console.error('Admin password reset email dispatch failed:', err.message)
    );
    res.json({ message: 'A password reset code has been sent to the admin email address.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getAdminProfile = async (req, res) => {
  res.json(req.admin);
};

module.exports = {
  adminLogin,
  requestAdminSetupCode,
  verifyAdminSetup,
  requestAdminPasswordReset,
  // Same checks as setup: a valid emailed code, then a new password.
  resetAdminPassword: verifyAdminSetup,
  getAdminProfile,
};
