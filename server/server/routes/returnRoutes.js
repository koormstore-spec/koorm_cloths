const express = require('express');
const router = express.Router();
const { protect, protectAdmin } = require('../middleware/auth');
const { createReturnRequest, listReturns, getPendingReturnCount, getReturnImage, updateReturn } = require('../controllers/returnController');

router.get('/admin', protectAdmin, listReturns);
router.get('/admin/pending-count', protectAdmin, getPendingReturnCount);
router.get('/admin/:id/images/:imageId', protectAdmin, getReturnImage);
router.get('/:id/images/:imageId', protect, getReturnImage);
router.put('/admin/:id', protectAdmin, express.json(), updateReturn);
// Authenticate before accepting the larger photo payload; other APIs keep their default limit.
router.post('/', protect, express.json({ limit: '9mb' }), createReturnRequest);
router.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ message: 'Upload up to 3 photos, no larger than 2 MB each.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid request data.' });
  next(err);
});

module.exports = router;
