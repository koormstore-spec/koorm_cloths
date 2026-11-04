const express = require('express');
const router = express.Router();
const { protectAdmin, attachUser } = require('../middleware/auth');
const {
  getProducts,
  getProductFilters,
  getProductBySlug,
  createProduct,
  updateProduct,
  updateProductStock,
  deleteProduct,
} = require('../controllers/productController');

router.get('/', getProducts);
router.get('/filters', getProductFilters);
router.get('/:slug', attachUser, getProductBySlug);
router.post('/', protectAdmin, createProduct);
router.put('/:id', protectAdmin, updateProduct);
router.patch('/:id/stock', protectAdmin, updateProductStock);
router.delete('/:id', protectAdmin, deleteProduct);

module.exports = router;
