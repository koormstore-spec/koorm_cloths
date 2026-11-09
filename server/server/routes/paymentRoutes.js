const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { verifyPayment, retryPayment } = require('../controllers/paymentController');
const { isEnabled, getMode } = require('../utils/razorpay');

// The webhook is mounted separately in server.js, before express.json(),
// because its signature check needs the raw request body.
// Lets checkout hide 'Pay online' until live Razorpay keys are configured, and
// flag test mode. Only booleans and the mode name leave the server, never keys.
router.get('/config', (req, res) => res.json({ online: isEnabled(), mode: getMode() }));
router.post('/verify', protect, verifyPayment);
router.post('/orders/:id/retry', protect, retryPayment);

module.exports = router;
