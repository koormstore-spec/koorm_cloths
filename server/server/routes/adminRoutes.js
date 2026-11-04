const express = require('express');
const router = express.Router();
const { protectAdmin } = require('../middleware/auth');
const { getDashboardStats } = require('../controllers/adminController');
const { getPayments, refreshPayment } = require('../controllers/adminPaymentController');

router.get('/stats', protectAdmin, getDashboardStats);
router.get('/payments', protectAdmin, getPayments);
router.post('/payments/:id/refresh', protectAdmin, refreshPayment);

module.exports = router;
