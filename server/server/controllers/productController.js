const { pool } = require('../config/db');
const { orderModel } = require('../models');

const parseProduct = (row) => {
  if (!row) return row;
  const parseField = (field) => {
    if (field == null) return [];
    if (Array.isArray(field)) return field;
    try {
      return JSON.parse(field);
    } catch {
      return [];
    }
  };
  return {
    ...row,
    sizes: parseField(row.sizes),
    colors: parseField(row.colors),
    images: parseField(row.images),
  };
};

const getProductFilters = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT colors, COALESCE(discount_price, price) AS price FROM products ORDER BY id ASC');
    const colors = new Map();
    let maxPrice = 0;
    for (const row of rows) {
      const price = Number(row.price);
      if (Number.isFinite(price)) maxPrice = Math.max(maxPrice, price);
      const values = parseProduct(row).colors;
      if (!Array.isArray(values)) continue;
      for (const value of values) {
        if (typeof value !== 'string' || !value.trim()) continue;
        const color = value.trim();
        const key = color.toLowerCase();
        if (!colors.has(key)) colors.set(key, color);
      }
    }
    res.json({ colors: [...colors.values()].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })), maxPrice });
  } catch (err) {
    res.status(500).json({ message: 'Could not load product filters' });
  }
};

const getProducts = async (req, res) => {
  try {
    const {
      category,
      gender,
      search,
      minPrice,
      maxPrice,
      sort,
      featured,
      sale,
      inStock,
      size,
      color,
      page = 1,
      limit = 20,
    } = req.query;

    const where = [];
    const params = [];

    if (category) {
      where.push('c.slug = ?');
      params.push(category);
    }
    if (gender) {
      where.push('p.gender = ?');
      params.push(gender);
    }
    if (search) {
      where.push('(p.name LIKE ? OR p.description LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    if (minPrice) {
      where.push('COALESCE(p.discount_price, p.price) >= ?');
      params.push(Number(minPrice));
    }
    if (maxPrice) {
      where.push('COALESCE(p.discount_price, p.price) <= ?');
      params.push(Number(maxPrice));
    }
    if (featured) {
      where.push('p.is_featured = 1');
    }
    if (sale === 'true') where.push('p.discount_price > 0 AND p.discount_price < p.price');
    if (inStock === 'true') where.push('p.stock > 0');
    if (size) {
      where.push('JSON_CONTAINS(p.sizes, ?)');
      params.push(JSON.stringify(String(size)));
    }
    if (color) {
      where.push('LOWER(p.colors) LIKE ?');
      params.push(`%${String(color).toLowerCase()}%`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    let orderBy = 'p.created_at DESC';
    if (sort === 'price_asc') orderBy = 'COALESCE(p.discount_price, p.price) ASC';
    if (sort === 'price_desc') orderBy = 'COALESCE(p.discount_price, p.price) DESC';
    if (sort === 'rating') orderBy = 'p.rating DESC';
    if (sort === 'newest') orderBy = 'p.created_at DESC';

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const [rows] = await pool.query(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       ${whereClause}
       ORDER BY ${orderBy}, p.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM products p LEFT JOIN categories c ON p.category_id = c.id ${whereClause}`,
      params
    );

    res.json({
      products: rows.map(parseProduct),
      total: countRows[0].total,
      page: pageNum,
      pages: Math.ceil(countRows[0].total / limitNum),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getProductBySlug = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.slug = ?`,
      [req.params.slug]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const [reviews] = await pool.query(
      `SELECT r.id, r.rating, r.comment, r.admin_reply, r.admin_reply_at, r.created_at, u.name AS user_name
       FROM reviews r JOIN users u ON r.user_id = u.id
       WHERE r.product_id = ? ORDER BY r.created_at DESC`,
      [rows[0].id]
    );

    const [related] = await pool.query(
      `SELECT p.* FROM products p WHERE p.category_id = ? AND p.id != ? LIMIT 4`,
      [rows[0].category_id, rows[0].id]
    );

    // Only a signed-in visitor can be told whether they're eligible to
    // review — everyone else just doesn't see the review form at all.
    const canReview = req.user ? await orderModel.hasPurchasedProduct(req.user.id, rows[0].id) : false;

    res.json({
      ...parseProduct(rows[0]),
      reviews,
      related: related.map(parseProduct),
      can_review: canReview,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createProduct = async (req, res) => {
  try {
    const {
      name, slug, description, price, discount_price, category_id,
      brand, gender, sizes, colors, images, stock, is_featured,
    } = req.body;

    if (!name || !slug || !price) {
      return res.status(400).json({ message: 'name, slug and price are required' });
    }

    const [result] = await pool.query(
      `INSERT INTO products
       (name, slug, description, price, discount_price, category_id, brand, gender, sizes, colors, images, stock, is_featured)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, slug, description || '', price, discount_price || null, category_id || null,
        brand || 'Koorm', gender || 'unisex',
        JSON.stringify(sizes || []), JSON.stringify(colors || []), JSON.stringify(images || []),
        stock ?? 100, is_featured ? 1 : 0,
      ]
    );
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [result.insertId]);
    res.status(201).json(parseProduct(rows[0]));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateProduct = async (req, res) => {
  try {
    const existing = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (existing[0].length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }
    const current = existing[0][0];
    const {
      name, slug, description, price, discount_price, category_id,
      brand, gender, sizes, colors, images, stock, is_featured,
    } = req.body;

    await pool.query(
      `UPDATE products SET name=?, slug=?, description=?, price=?, discount_price=?, category_id=?,
       brand=?, gender=?, sizes=?, colors=?, images=?, stock=?, is_featured=? WHERE id=?`,
      [
        name ?? current.name,
        slug ?? current.slug,
        description ?? current.description,
        price ?? current.price,
        discount_price ?? current.discount_price,
        category_id ?? current.category_id,
        brand ?? current.brand,
        gender ?? current.gender,
        sizes ? JSON.stringify(sizes) : current.sizes,
        colors ? JSON.stringify(colors) : current.colors,
        images ? JSON.stringify(images) : current.images,
        stock ?? current.stock,
        is_featured !== undefined ? (is_featured ? 1 : 0) : current.is_featured,
        req.params.id,
      ]
    );
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    res.json(parseProduct(rows[0]));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateProductStock = async (req, res) => {
  const { stock } = req.body;
  if (typeof stock !== 'number' || !Number.isInteger(stock) || stock < 0 || stock > 2147483647) {
    return res.status(400).json({ message: 'Stock must be a whole number between 0 and 2147483647.' });
  }
  try {
    await pool.query('UPDATE products SET stock = ? WHERE id = ?', [stock, req.params.id]);
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Product not found' });
    res.json(parseProduct(rows[0]));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteProduct = async (req, res) => {
  try {
    await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getProducts,
  getProductFilters,
  getProductBySlug,
  createProduct,
  updateProduct,
  updateProductStock,
  deleteProduct,
};
