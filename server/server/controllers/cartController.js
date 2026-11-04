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

const getCart = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ci.id, ci.size, ci.quantity, p.id AS product_id, p.name, p.slug, p.price,
              p.discount_price, p.images, p.stock
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       WHERE ci.user_id = ?
       ORDER BY ci.id DESC`,
      [req.user.id]
    );
    const items = rows.map((r) => ({
      ...r,
      images: parseImages(r.images),
    }));
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Zero stock and "not enough left" are different situations for the
// customer — distinguish them instead of a single generic error.
const stockShortfallMessage = (stock, requestedQuantity, productName) => {
  if (stock <= 0) {
    return `${productName} is out of stock`;
  }
  if (requestedQuantity > stock) {
    return `Only ${stock} left in stock for ${productName}`;
  }
  return null;
};

// A per-customer cap on how many of the same product can sit in one bag,
// independent of (and checked separately from) physical stock — it applies
// across every size of that product, not per size.
const MAX_QUANTITY_PER_PRODUCT = 4;
// mysql2 returns SUM(...) as a string, not a number — coerce before
// comparing/adding so "3" + 1 can't silently become the string "31".
const quantityLimitMessage = (totalQuantity, productName) =>
  Number(totalQuantity) > MAX_QUANTITY_PER_PRODUCT
    ? `You can add up to ${MAX_QUANTITY_PER_PRODUCT} of ${productName} to your bag`
    : null;

const addToCart = async (req, res) => {
  try {
    const { product_id, size, quantity = 1 } = req.body;
    if (!product_id || !size) {
      return res.status(400).json({ message: 'product_id and size are required' });
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ message: 'quantity must be a whole number of at least 1' });
    }

    const [products] = await pool.query('SELECT name, stock FROM products WHERE id = ?', [product_id]);
    if (products.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }
    const { name: productName, stock } = products[0];

    const [existing] = await pool.query(
      'SELECT * FROM cart_items WHERE user_id = ? AND product_id = ? AND size = ?',
      [req.user.id, product_id, size]
    );
    const currentQuantity = existing.length > 0 ? existing[0].quantity : 0;

    const [[{ totalInCart }]] = await pool.query(
      'SELECT COALESCE(SUM(quantity), 0) AS totalInCart FROM cart_items WHERE user_id = ? AND product_id = ?',
      [req.user.id, product_id]
    );
    const limitError = quantityLimitMessage(Number(totalInCart) + quantity, productName);
    if (limitError) {
      return res.status(400).json({ message: limitError });
    }

    const shortfall = stockShortfallMessage(stock, currentQuantity + quantity, productName);
    if (shortfall) {
      return res.status(400).json({ message: shortfall });
    }

    if (existing.length > 0) {
      await pool.query('UPDATE cart_items SET quantity = quantity + ? WHERE id = ?', [
        quantity,
        existing[0].id,
      ]);
    } else {
      await pool.query(
        'INSERT INTO cart_items (user_id, product_id, size, quantity) VALUES (?, ?, ?, ?)',
        [req.user.id, product_id, size, quantity]
      );
    }
    res.status(201).json({ message: 'Added to cart' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateCartItem = async (req, res) => {
  try {
    const { quantity } = req.body;
    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ message: 'quantity must be a whole number of at least 1' });
    }

    const [items] = await pool.query(
      `SELECT ci.id, ci.product_id, p.name AS product_name, p.stock
       FROM cart_items ci JOIN products p ON p.id = ci.product_id
       WHERE ci.id = ? AND ci.user_id = ?`,
      [req.params.id, req.user.id]
    );
    if (items.length === 0) {
      return res.status(404).json({ message: 'Cart item not found' });
    }
    const { product_id: productId, product_name: productName, stock } = items[0];

    const [[{ otherQuantity }]] = await pool.query(
      'SELECT COALESCE(SUM(quantity), 0) AS otherQuantity FROM cart_items WHERE user_id = ? AND product_id = ? AND id != ?',
      [req.user.id, productId, req.params.id]
    );
    const limitError = quantityLimitMessage(Number(otherQuantity) + quantity, productName);
    if (limitError) {
      return res.status(400).json({ message: limitError });
    }

    const shortfall = stockShortfallMessage(stock, quantity, productName);
    if (shortfall) {
      return res.status(400).json({ message: shortfall });
    }

    await pool.query('UPDATE cart_items SET quantity = ? WHERE id = ? AND user_id = ?', [
      quantity,
      req.params.id,
      req.user.id,
    ]);
    res.json({ message: 'Cart updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const removeCartItem = async (req, res) => {
  try {
    await pool.query('DELETE FROM cart_items WHERE id = ? AND user_id = ?', [
      req.params.id,
      req.user.id,
    ]);
    res.json({ message: 'Item removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const clearCart = async (req, res) => {
  try {
    await pool.query('DELETE FROM cart_items WHERE user_id = ?', [req.user.id]);
    res.json({ message: 'Cart cleared' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getCart, addToCart, updateCartItem, removeCartItem, clearCart };
