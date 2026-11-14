// Per-size stock lives in product_size_stock (product_id, size, stock).
// products.stock is kept equal to the sum of a product's sizes so listings,
// the "In stock" filter and badges keep working off a single number.
//
// A product with no rows in product_size_stock has not been set up per size
// yet; it keeps selling from products.stock, shared across all its sizes.

const MAX_STOCK = 2147483647;
const MAX_SIZE_LENGTH = 20;

// SQL expression for the stock available to one cart/order line. Needs the
// product aliased as `p` and the size column passed in.
const lineStockSql = (sizeColumn) => `CASE
  WHEN EXISTS (SELECT 1 FROM product_size_stock pss_any WHERE pss_any.product_id = p.id)
  THEN COALESCE((SELECT pss.stock FROM product_size_stock pss WHERE pss.product_id = p.id AND pss.size = ${sizeColumn}), 0)
  ELSE p.stock END`;

const sizeTrackedSql = 'EXISTS (SELECT 1 FROM product_size_stock pss_t WHERE pss_t.product_id = p.id)';

// { productId: { size: stock } } for the given products (only those set up per size).
const loadSizeStock = async (db, productIds, { lock = false } = {}) => {
  const byProduct = new Map();
  if (!productIds.length) return byProduct;
  const [rows] = await db.query(
    `SELECT product_id, size, stock FROM product_size_stock WHERE product_id IN (?)${lock ? ' FOR UPDATE' : ''}`,
    [productIds]
  );
  for (const row of rows || []) {
    if (!byProduct.has(row.product_id)) byProduct.set(row.product_id, {});
    byProduct.get(row.product_id)[row.size] = Number(row.stock);
  }
  return byProduct;
};

// Adds `size_stock` ({ size: stock }, empty when not tracked per size) to products.
const attachSizeStock = async (db, products) => {
  const list = products.filter(Boolean);
  const byProduct = await loadSizeStock(db, list.map((product) => product.id));
  for (const product of list) product.size_stock = byProduct.get(product.id) || {};
  return products;
};

// Validates { size: stock } against the product's size list.
// Returns { entries: [[size, stock], ...] } or { error }.
const normaliseSizeStock = (sizeStock, sizes) => {
  if (!sizeStock || typeof sizeStock !== 'object' || Array.isArray(sizeStock)) {
    return { error: 'size_stock must be an object of size → units' };
  }
  const sizeList = (sizes || []).map((size) => String(size).trim()).filter(Boolean);
  if (!sizeList.length) return { error: 'Add at least one size before setting stock per size.' };
  const entries = [];
  for (const size of sizeList) {
    if (size.length > MAX_SIZE_LENGTH) return { error: `Size "${size}" is longer than ${MAX_SIZE_LENGTH} characters.` };
    const stock = Number(sizeStock[size]);
    if (sizeStock[size] === '' || sizeStock[size] == null || !Number.isInteger(stock) || stock < 0 || stock > MAX_STOCK) {
      return { error: `Enter a whole number of units, zero or more, for size ${size}.` };
    }
    entries.push([size, stock]);
  }
  const unknown = Object.keys(sizeStock).find((size) => !sizeList.includes(size));
  if (unknown) return { error: `Size ${unknown} is not one of this product's sizes.` };
  return { entries };
};

// Replaces a product's per-size stock and syncs products.stock to the total.
// Run inside a transaction.
const saveSizeStock = async (connection, productId, entries) => {
  const sizes = entries.map(([size]) => size);
  await connection.query('DELETE FROM product_size_stock WHERE product_id = ? AND size NOT IN (?)', [productId, sizes]);
  for (const [size, stock] of entries) {
    await connection.query(
      'INSERT INTO product_size_stock (product_id, size, stock) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE stock = VALUES(stock)',
      [productId, size, stock]
    );
  }
  await syncProductTotal(connection, productId);
};

// Drops per-size rows for sizes the product no longer offers.
const pruneRemovedSizes = async (connection, productId, sizes) => {
  if (sizes.length) {
    await connection.query('DELETE FROM product_size_stock WHERE product_id = ? AND size NOT IN (?)', [productId, sizes]);
  } else {
    await connection.query('DELETE FROM product_size_stock WHERE product_id = ?', [productId]);
  }
};

// products.stock = sum of sizes, for products tracked per size.
const syncProductTotal = (connection, productId) => connection.query(
  `UPDATE products p
   JOIN (SELECT product_id, SUM(stock) AS total FROM product_size_stock WHERE product_id = ? GROUP BY product_id) s
     ON s.product_id = p.id
   SET p.stock = s.total`,
  [productId]
);

// Takes stock for one order line: the size row (if tracked) and the product total.
const takeStock = async (connection, productId, size, quantity) => {
  await connection.query(
    'UPDATE product_size_stock SET stock = stock - ? WHERE product_id = ? AND size = ?',
    [quantity, productId, size]
  );
  await connection.query('UPDATE products SET stock = stock - ? WHERE id = ?', [quantity, productId]);
};

module.exports = {
  lineStockSql,
  sizeTrackedSql,
  loadSizeStock,
  attachSizeStock,
  normaliseSizeStock,
  saveSizeStock,
  pruneRemovedSizes,
  syncProductTotal,
  takeStock,
};
