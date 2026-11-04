jest.mock('../config/db', () => ({ pool: { query: jest.fn() } }));
const { pool } = require('../config/db');
const { getProducts, getProductFilters, updateProductStock, getProductBySlug } = require('../controllers/productController');

beforeEach(() => jest.resetAllMocks());
const response = () => ({ json: jest.fn(), status: jest.fn().mockReturnThis() });

test('populates colour choices from the full catalogue, trimming and removing duplicate or invalid values', async () => {
  pool.query.mockResolvedValueOnce([[
    { colors: '["Royal Blue", " White & Grey ", ""]' },
    { colors: ['royal blue', 'Black', null, 3] },
    { colors: null },
    { colors: 'invalid json' },
    { colors: '{"color":"Red"}' },
  ]]);
  const res = response();
  await getProductFilters({ query: { color: 'Black', page: 2 } }, res);
  expect(res.json).toHaveBeenCalledWith({ colors: ['Black', 'Royal Blue', 'White & Grey'], maxPrice: 0 });
  expect(pool.query).toHaveBeenCalledWith('SELECT colors, COALESCE(discount_price, price) AS price FROM products ORDER BY id ASC');
});

test('includes colours beyond the product pagination limit', async () => {
  const rows = Array.from({ length: 125 }, (_, index) => ({ colors: JSON.stringify([`Colour ${index}`]) }));
  pool.query.mockResolvedValueOnce([rows]);
  const res = response();
  await getProductFilters({ query: {} }, res);
  expect(res.json.mock.calls[0][0].colors).toHaveLength(125);
  expect(res.json.mock.calls[0][0].colors).toContain('Colour 124');
});

test('returns an empty colour list for an empty catalogue', async () => {
  pool.query.mockResolvedValueOnce([[]]);
  const res = response();
  await getProductFilters({ query: {} }, res);
  expect(res.json).toHaveBeenCalledWith({ colors: [], maxPrice: 0 });
});

test('includes the highest selling price even when the product has no colours', async () => {
  pool.query.mockResolvedValueOnce([[
    { colors: '["Blue"]', price: '1874.25' },
    { colors: null, price: '6249.00' },
    { colors: 'invalid', price: 'invalid' },
  ]]);
  const res = response();
  await getProductFilters({ query: { maxPrice: 1500 } }, res);
  expect(res.json).toHaveBeenCalledWith({ colors: ['Blue'], maxPrice: 6249 });
});

test('reports unavailable filter choices without exposing database errors', async () => {
  pool.query.mockRejectedValueOnce(new Error('database unavailable'));
  const res = response();
  await getProductFilters({ query: {} }, res);
  expect(res.status).toHaveBeenCalledWith(500);
  expect(res.json).toHaveBeenCalledWith({ message: 'Could not load product filters' });
});

test.each([-1, 1.5, null, '2', 2147483648])('rejects invalid stock %p without writing inventory', async stock => {
  const res = response();
  await updateProductStock({ body: { stock }, params: { id: 1 } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(pool.query).not.toHaveBeenCalled();
});

test('updates only stock, retaining the product details in the response', async () => {
  const product = { id: 1, name: 'Linen Shirt', price: 2499, stock: 2, sizes: '["M"]', colors: '["White"]', images: '["/photo.jpg"]' };
  pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([[product]]);
  const res = response();
  await updateProductStock({ body: { stock: 2 }, params: { id: '1' } }, res);
  expect(pool.query.mock.calls[0]).toEqual(['UPDATE products SET stock = ? WHERE id = ?', [2, '1']]);
  expect(res.json).toHaveBeenCalledWith({ ...product, sizes: ['M'], colors: ['White'], images: ['/photo.jpg'] });
});

test('reports a missing product when saving stock', async () => {
  pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]).mockResolvedValueOnce([[]]);
  const res = response();
  await updateProductStock({ body: { stock: 2 }, params: { id: '999' } }, res);
  expect(res.status).toHaveBeenCalledWith(404);
});

test('combines catalogue filters and applies the same conditions to pagination totals', async () => {
  pool.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);
  const res = response();
  await getProducts({ query: { sale: 'true', inStock: 'true', size: 'M', color: 'Blue', minPrice: '100', maxPrice: '3000', page: '2', limit: '12', sort: 'price_asc' } }, res);
  const [listSql, listParams] = pool.query.mock.calls[0];
  const [countSql, countParams] = pool.query.mock.calls[1];
  for (const sql of [listSql, countSql]) {
    expect(sql).toContain('p.discount_price > 0 AND p.discount_price < p.price');
    expect(sql).toContain('p.stock > 0');
    expect(sql).toContain('JSON_CONTAINS(p.sizes, ?)');
    expect(sql).toContain('LOWER(p.colors) LIKE ?');
  }
  expect(listSql).toContain('ORDER BY COALESCE(p.discount_price, p.price) ASC');
  expect(listParams).toEqual([100, 3000, '"M"', '%blue%', 12, 12]);
  expect(countParams).toEqual(listParams.slice(0, -2));
  expect(res.json).toHaveBeenCalledWith({ products: [], total: 0, page: 2, pages: 0 });
});

const productRow = { id: 2, slug: 'linen-shirt', name: 'Linen Shirt', price: 2499, category_id: 1, sizes: '["M"]', colors: '["White"]', images: '["/photo.jpg"]' };

test('marks can_review false for an anonymous visitor without checking purchase history', async () => {
  pool.query.mockResolvedValueOnce([[productRow]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);
  const res = response();
  await getProductBySlug({ params: { slug: 'linen-shirt' } }, res);
  expect(pool.query).toHaveBeenCalledTimes(3);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ can_review: false }));
});

test('marks can_review true for a signed-in customer who ordered this product', async () => {
  pool.query.mockResolvedValueOnce([[productRow]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]])
    .mockResolvedValueOnce([[{ id: 9 }]]); // hasPurchasedProduct -> ordered
  const res = response();
  await getProductBySlug({ params: { slug: 'linen-shirt' }, user: { id: 3 } }, res);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ can_review: true }));
});

test('marks can_review false for a signed-in customer who never ordered this product', async () => {
  pool.query.mockResolvedValueOnce([[productRow]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]])
    .mockResolvedValueOnce([[]]); // hasPurchasedProduct -> not ordered
  const res = response();
  await getProductBySlug({ params: { slug: 'linen-shirt' }, user: { id: 3 } }, res);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ can_review: false }));
});

test('false flags do not hide stock or full-price products and values stay parameterized', async () => {
  pool.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);
  const res = response();
  const input = "Blue' OR 1=1 --";
  await getProducts({ query: { sale: 'false', inStock: 'false', color: input } }, res);
  const [sql, params] = pool.query.mock.calls[0];
  expect(sql).not.toContain('p.stock > 0');
  expect(sql).not.toContain('p.discount_price > 0');
  expect(sql).not.toContain(input);
  expect(params[0]).toBe(`%${input.toLowerCase()}%`);
});
