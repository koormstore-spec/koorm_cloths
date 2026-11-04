const express = require('express');
const router = express.Router();
const { protectAdmin } = require('../middleware/auth');
const {
  adminLogin,
  requestAdminSetupCode,
  verifyAdminSetup,
  requestAdminPasswordReset,
  resetAdminPassword,
  getAdminProfile,
} = require('../controllers/adminAuthController');

router.post('/login', adminLogin);
router.post('/request-setup-code', requestAdminSetupCode);
router.post('/verify-setup', verifyAdminSetup);
router.post('/forgot-password', requestAdminPasswordReset);
router.post('/reset-password', resetAdminPassword);
router.get('/me', protectAdmin, getAdminProfile);

module.exports = router;
