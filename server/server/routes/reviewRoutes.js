const express = require('express');
const router = express.Router();
const { protect, protectAdmin } = require('../middleware/auth');
const { getReviews, addReview, deleteReview, adminDeleteReview, adminReplyToReview } = require('../controllers/reviewController');
const { getStoreReviews, addStoreReview, deleteStoreReview, adminReplyToStoreReview } = require('../controllers/storeReviewController');

router.get('/', getReviews);
router.get('/store', getStoreReviews);

// Admin moderation — any review, not just the signed-in customer's own.
router.delete('/admin/store/:id', protectAdmin, deleteStoreReview);
router.put('/admin/store/:id/reply', protectAdmin, adminReplyToStoreReview);
router.delete('/admin/:id', protectAdmin, adminDeleteReview);
router.put('/admin/:id/reply', protectAdmin, adminReplyToReview);

router.use(protect);
router.post('/store', addStoreReview);
router.post('/', addReview);
router.delete('/:id', deleteReview);

module.exports = router;
