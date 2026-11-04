const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
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
} = require('../controllers/authController');

router.post('/register', register);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerificationCode);
router.post('/request-login-code', requestLoginCode);
router.post('/verify-login-code', verifyLoginCode);
router.get('/me', protect, getProfile);
router.put('/me', protect, updateProfile);
router.get('/addresses', protect, listAddresses);
router.post('/addresses', protect, addAddress);
router.delete('/addresses/:id', protect, deleteAddress);

module.exports = router;
