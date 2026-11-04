const crypto = require('crypto');
const { pool } = require('../config/db');
const { userModel, addressModel } = require('../models');
const { generateToken } = require('../utils/generateToken');
const { sendWelcomeEmail, sendVerificationCodeEmail } = require('../utils/email');

const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const generateVerificationCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

const issueVerificationCode = async (userId) => {
  const code = generateVerificationCode();
  const codeExpiry = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);
  await userModel.updateVerificationCode(userId, hashToken(code), codeExpiry);
  return code;
};

const register = async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required' });
    }

    const existing = await userModel.findByEmail(email);

    let userId;
    if (existing) {
      if (existing.is_verified) {
        return res.status(400).json({ message: 'An account with this email already exists' });
      }
      // Unverified account from a previous, abandoned signup attempt — reuse
      // it and send a fresh code instead of blocking the user forever.
      userId = existing.id;
      await userModel.update(userId, { name, phone: phone || null });
    } else {
      userId = await userModel.create({ name, email, phone });
    }

    const code = await issueVerificationCode(userId);

    res.status(201).json({
      message: "We've emailed you a verification code. Enter it to finish creating your account.",
      email,
    });

    sendVerificationCodeEmail({ name, email, code }).catch((err) =>
      console.error('Registration email dispatch failed:', err.message)
    );
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const verifyEmail = async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ message: 'Email and code are required' });
    }

    const user = await userModel.findByVerificationCode(email, hashToken(code));
    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired verification code' });
    }
    if (user.is_verified) {
      return res.status(400).json({ message: 'This account is already verified' });
    }

    await userModel.markVerified(user.id);

    // Verification is the moment the account truly comes into existence, so
    // this doubles as first login: hand back a token right away.
    const token = generateToken(user.id);
    res.json({
      id: user.id,
      name: user.name,
      email,
      phone: user.phone,
      token,
    });

    sendWelcomeEmail({ name: user.name, email }).catch((err) =>
      console.error('Welcome email dispatch failed:', err.message)
    );
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const resendVerificationCode = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await userModel.findByEmail(email);
    if (!user) {
      return res.status(404).json({ message: 'No account found with that email' });
    }
    if (user.is_verified) {
      return res.status(400).json({ message: 'This account is already verified' });
    }

    const code = await issueVerificationCode(user.id);
    sendVerificationCodeEmail({ name: user.name, email, code }).catch((err) =>
      console.error('Verification code email dispatch failed:', err.message)
    );

    res.json({ message: 'A new verification code has been sent to your email.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Passwordless login, step 1: email a one-time code to a verified account.
const requestLoginCode = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await userModel.findByEmail(email);
    if (!user) {
      return res.status(404).json({ message: 'No account found with that email' });
    }
    if (!user.is_verified) {
      return res.status(400).json({ message: 'Please finish verifying your email first', unverified: true });
    }

    const code = await issueVerificationCode(user.id);
    sendVerificationCodeEmail({ name: user.name, email, code }).catch((err) =>
      console.error('Login code email dispatch failed:', err.message)
    );

    res.json({ message: 'A login code has been sent to your email.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Passwordless login, step 2: exchange the code for a session token.
const verifyLoginCode = async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ message: 'Email and code are required' });
    }

    const user = await userModel.findByVerificationCode(email, hashToken(code));
    if (!user) {
      return res.status(401).json({ message: 'Invalid or expired code' });
    }

    await userModel.clearVerificationCode(user.id);

    const token = generateToken(user.id);
    res.json({ id: user.id, name: user.name, email, phone: user.phone, token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getProfile = async (req, res) => {
  res.json(await userModel.findById(req.user.id));
};

const updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body;
    await userModel.update(req.user.id, {
      name: name || req.user.name,
      phone: phone !== undefined ? phone : req.user.phone,
    });
    res.json(await userModel.findById(req.user.id));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const listAddresses = async (req, res) => {
  try {
    res.json(await addressModel.listByUserId(req.user.id));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const addAddress = async (req, res) => {
  try {
    const { full_name, phone, address_line1, address_line2, city, state, pincode, is_default } = req.body;
    if (!full_name || !phone || !address_line1 || !city || !state || !pincode) {
      return res.status(400).json({ message: 'Missing required address fields' });
    }
    if (is_default) {
      await addressModel.clearDefaultForUser(req.user.id);
    }
    const address = await addressModel.create(req.user.id, {
      full_name, phone, address_line1, address_line2, city, state, pincode, is_default,
    });
    res.status(201).json(address);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteAddress = async (req, res) => {
  try {
    await addressModel.removeForUser(req.params.id, req.user.id);
    res.json({ message: 'Address removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  register,
  requestLoginCode,
  verifyLoginCode,
  getProfile,
  updateProfile,
  listAddresses,
  addAddress,
  deleteAddress,
  verifyEmail,
  resendVerificationCode,
};
