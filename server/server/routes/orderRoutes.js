const express = require('express');
const router = express.Router();
const { protect, protectAdmin } = require('../middleware/auth');
const {
  createOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  getAllOrders,
  getCancellationRequestCount,
  updateOrderStatus,
  refundOrderByAdmin,
} = require('../controllers/orderController');

router.get('/admin/all', protectAdmin, getAllOrders);
router.get('/admin/cancellation-count', protectAdmin, getCancellationRequestCount);
router.put('/admin/:id/status', protectAdmin, updateOrderStatus);
router.post('/admin/:id/refund', protectAdmin, refundOrderByAdmin);

router.post('/', protect, createOrder);
router.get('/', protect, getMyOrders);
router.get('/:id', protect, getOrderById);
router.put('/:id/cancel', protect, cancelOrder);

module.exports = router;
