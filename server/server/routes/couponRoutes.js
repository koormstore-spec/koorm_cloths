const express = require('express');
const router = express.Router();
const { protect, protectAdmin } = require('../middleware/auth');
const {
  getFirstOrderEligibility,
  validateCoupon,
  listCoupons,
  getCouponById,
  createCoupon,
  updateCoupon,
  deleteCoupon,
} = require('../controllers/couponController');

router.post('/validate', protect, validateCoupon);
router.get('/first-order-eligibility', protect, getFirstOrderEligibility);

router.get('/', protectAdmin, listCoupons);
router.get('/:id', protectAdmin, getCouponById);
router.post('/', protectAdmin, createCoupon);
router.put('/:id', protectAdmin, updateCoupon);
router.delete('/:id', protectAdmin, deleteCoupon);

module.exports = router;
