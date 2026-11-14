const { pool } = require('../config/db');
const { orderModel } = require('../models');
const {
  attachSizeStock, normaliseSizeStock, saveSizeStock, pruneRemovedSizes, syncProductTotal,
} = require('../utils/sizeStock');

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

    const products = await attachSizeStock(pool, rows.map(parseProduct));
    res.json({
      products,
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

    const [product] = await attachSizeStock(pool, [parseProduct(rows[0])]);
    res.json({
      ...product,
      reviews,
      related: related.map(parseProduct),
      can_review: canReview,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const loadProductForAdmin = async (db, id) => {
  const [rows] = await db.query('SELECT * FROM products WHERE id = ?', [id]);
  if (!rows.length) return null;
  const [product] = await attachSizeStock(db, [parseProduct(rows[0])]);
  return product;
};

// Runs `work` in a transaction on its own connection.
const inTransaction = async (work) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

const createProduct = async (req, res) => {
  try {
    const {
      name, slug, description, price, discount_price, category_id,
      brand, gender, sizes, colors, images, stock, is_featured, size_stock,
    } = req.body;

    if (!name || !slug || !price) {
      return res.status(400).json({ message: 'name, slug and price are required' });
    }

    let sizeEntries = null;
    if (size_stock !== undefined && size_stock !== null) {
      const result = normaliseSizeStock(size_stock, sizes);
      if (result.error) return res.status(400).json({ message: result.error });
      sizeEntries = result.entries;
    }

    const productId = await inTransaction(async (connection) => {
      const [result] = await connection.query(
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
      if (sizeEntries) await saveSizeStock(connection, result.insertId, sizeEntries);
      return result.insertId;
    });
    res.status(201).json(await loadProductForAdmin(pool, productId));
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
      brand, gender, sizes, colors, images, stock, is_featured, size_stock,
    } = req.body;

    const finalSizes = sizes || parseProduct(current).sizes;
    let sizeEntries = null;
    if (size_stock !== undefined && size_stock !== null) {
      const result = normaliseSizeStock(size_stock, finalSizes);
      if (result.error) return res.status(400).json({ message: result.error });
      sizeEntries = result.entries;
    }

    await inTransaction(async (connection) => {
      await connection.query(
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
      if (sizeEntries) {
        await saveSizeStock(connection, req.params.id, sizeEntries);
      } else if (sizes) {
        // Sizes changed without new per-size numbers: drop removed sizes and
        // keep the total in step with what is left.
        await pruneRemovedSizes(connection, req.params.id, sizes.map((size) => String(size).trim()));
        await syncProductTotal(connection, req.params.id);
      } else {
        // A per-size product's total always comes from its sizes.
        await syncProductTotal(connection, req.params.id);
      }
    });
    res.json(await loadProductForAdmin(pool, req.params.id));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Body: { size_stock: { S: 4, M: 0 } } for per-size products, or { stock } for
// products that haven't been set up per size.
const updateProductStock = async (req, res) => {
  const { stock, size_stock } = req.body;
  if (size_stock === undefined
    && (typeof stock !== 'number' || !Number.isInteger(stock) || stock < 0 || stock > 2147483647)) {
    return res.status(400).json({ message: 'Stock must be a whole number between 0 and 2147483647.' });
  }
  try {
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Product not found' });
    const product = parseProduct(rows[0]);

    if (size_stock !== undefined) {
      const result = normaliseSizeStock(size_stock, product.sizes);
      if (result.error) return res.status(400).json({ message: result.error });
      await inTransaction((connection) => saveSizeStock(connection, product.id, result.entries));
      return res.json(await loadProductForAdmin(pool, product.id));
    }

    const [[{ tracked }]] = await pool.query(
      'SELECT COUNT(*) AS tracked FROM product_size_stock WHERE product_id = ?', [product.id]
    );
    if (Number(tracked) > 0) {
      return res.status(400).json({ message: 'This product tracks stock per size. Set the units for each size instead.' });
    }
    await pool.query('UPDATE products SET stock = ? WHERE id = ?', [stock, product.id]);
    res.json(await loadProductForAdmin(pool, product.id));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteProduct = async (req, res) => {
  try {
    await inTransaction(async (connection) => {
      await connection.query('DELETE FROM product_size_stock WHERE product_id = ?', [req.params.id]);
      await connection.query('DELETE FROM products WHERE id = ?', [req.params.id]);
    });
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
