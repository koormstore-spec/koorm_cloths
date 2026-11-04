const express = require('express');
const router = express.Router();
const { protectAdmin } = require('../middleware/auth');
const { getCategories, createCategory, deleteCategory } = require('../controllers/categoryController');

router.get('/', getCategories);
router.post('/', protectAdmin, createCategory);
router.delete('/:id', protectAdmin, deleteCategory);

module.exports = router;
