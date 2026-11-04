const { pool } = require('../config/db');

const parseImages = (images) => {
  if (!images) return [];
  if (Array.isArray(images)) return images;
  try {
    return JSON.parse(images);
  } catch {
    return [];
  }
};

const getWishlist = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT w.id AS wishlist_id, p.* FROM wishlist_items w
       JOIN products p ON w.product_id = p.id
       WHERE w.user_id = ? ORDER BY w.id DESC`,
      [req.user.id]
    );
    res.json(rows.map((r) => ({ ...r, images: parseImages(r.images) })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const addToWishlist = async (req, res) => {
  try {
    const { product_id } = req.body;
    if (!product_id) {
      return res.status(400).json({ message: 'product_id is required' });
    }
    await pool.query(
      'INSERT IGNORE INTO wishlist_items (user_id, product_id) VALUES (?, ?)',
      [req.user.id, product_id]
    );
    res.status(201).json({ message: 'Added to wishlist' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const removeFromWishlist = async (req, res) => {
  try {
    await pool.query('DELETE FROM wishlist_items WHERE product_id = ? AND user_id = ?', [
      req.params.productId,
      req.user.id,
    ]);
    res.json({ message: 'Removed from wishlist' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getWishlist, addToWishlist, removeFromWishlist };
