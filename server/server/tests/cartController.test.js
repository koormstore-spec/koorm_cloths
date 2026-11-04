jest.mock('../config/db', () => ({ pool: { query: jest.fn() } }));
const { pool } = require('../config/db');
const { addToCart, updateCartItem } = require('../controllers/cartController');

beforeEach(() => jest.resetAllMocks());
const response = () => ({ json: jest.fn(), status: jest.fn().mockReturnThis() });

describe('addToCart', () => {
  it('rejects a missing product_id or size', async () => {
    const res = response();
    await addToCart({ body: { size: 'M' }, user: { id: 1 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects a non-whole or non-positive quantity', async () => {
    const res = response();
    await addToCart({ body: { product_id: 1, size: 'M', quantity: 0 }, user: { id: 1 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects a product that no longer exists', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const res = response();
    await addToCart({ body: { product_id: 99, size: 'M', quantity: 1 }, user: { id: 1 } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('rejects when the 4-per-product bag limit would be exceeded, even with plenty of stock', async () => {
    // mysql2 returns SUM(...) as a string — use one here so a regression to
    // naive `totalInCart + quantity` (string concatenation) would be caught.
    pool.query.mockResolvedValueOnce([[{ name: 'Linen Shirt', stock: 50 }]]) // product
      .mockResolvedValueOnce([[{ id: 5, quantity: 2 }]]) // existing same-size row
      .mockResolvedValueOnce([[{ totalInCart: '3' }]]); // already 3 of this product across sizes
    const res = response();
    await addToCart({ body: { product_id: 9, size: 'M', quantity: 2 }, user: { id: 1 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'You can add up to 4 of Linen Shirt to your bag' });
  });

  it('allows reaching exactly the 4-item limit (string SUM result must add numerically, not concatenate)', async () => {
    pool.query.mockResolvedValueOnce([[{ name: 'Linen Shirt', stock: 50 }]])
      .mockResolvedValueOnce([[{ id: 5, quantity: 2 }]])
      .mockResolvedValueOnce([[{ totalInCart: '2' }]]) // 2 already (as a string, like mysql2 returns), +2 = 4, exactly the cap
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = response();
    await addToCart({ body: { product_id: 9, size: 'M', quantity: 2 }, user: { id: 1 } }, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('rejects with an out-of-stock message when stock has hit zero', async () => {
    pool.query.mockResolvedValueOnce([[{ name: 'Linen Shirt', stock: 0 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ totalInCart: 0 }]]);
    const res = response();
    await addToCart({ body: { product_id: 9, size: 'M', quantity: 1 }, user: { id: 1 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Linen Shirt is out of stock' });
  });

  it('rejects with an insufficient-stock message naming the quantity left, accounting for what is already in the bag', async () => {
    pool.query.mockResolvedValueOnce([[{ name: 'Linen Shirt', stock: 2 }]])
      .mockResolvedValueOnce([[{ id: 5, quantity: 1 }]])
      .mockResolvedValueOnce([[{ totalInCart: 1 }]]);
    const res = response();
    await addToCart({ body: { product_id: 9, size: 'M', quantity: 2 }, user: { id: 1 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Only 2 left in stock for Linen Shirt' });
  });

  it('adds a new line when there is enough stock and no existing cart row', async () => {
    pool.query.mockResolvedValueOnce([[{ name: 'Linen Shirt', stock: 5 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ totalInCart: 0 }]])
      .mockResolvedValueOnce([{ insertId: 1 }]);
    const res = response();
    await addToCart({ body: { product_id: 9, size: 'M', quantity: 2 }, user: { id: 1 } }, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(pool.query.mock.calls[3][0]).toContain('INSERT INTO cart_items');
  });

  it('increments an existing cart row when there is enough stock', async () => {
    pool.query.mockResolvedValueOnce([[{ name: 'Linen Shirt', stock: 5 }]])
      .mockResolvedValueOnce([[{ id: 5, quantity: 2 }]])
      .mockResolvedValueOnce([[{ totalInCart: 2 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = response();
    await addToCart({ body: { product_id: 9, size: 'M', quantity: 2 }, user: { id: 1 } }, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(pool.query.mock.calls[3]).toEqual(['UPDATE cart_items SET quantity = quantity + ? WHERE id = ?', [2, 5]]);
  });
});

describe('updateCartItem', () => {
  it('rejects a non-whole or non-positive quantity', async () => {
    const res = response();
    await updateCartItem({ body: { quantity: 0 }, params: { id: 5 }, user: { id: 1 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('reports a missing cart item', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const res = response();
    await updateCartItem({ body: { quantity: 2 }, params: { id: 5 }, user: { id: 1 } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('rejects when the 4-per-product bag limit would be exceeded by other sizes already in the bag', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 5, product_id: 9, product_name: 'Linen Shirt', stock: 50 }]])
      .mockResolvedValueOnce([[{ otherQuantity: '3' }]]); // 3 more of this product in a different size (string, like mysql2 returns)
    const res = response();
    await updateCartItem({ body: { quantity: 2 }, params: { id: 5 }, user: { id: 1 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'You can add up to 4 of Linen Shirt to your bag' });
  });

  it('rejects with an out-of-stock message when stock has hit zero', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 5, product_id: 9, product_name: 'Linen Shirt', stock: 0 }]])
      .mockResolvedValueOnce([[{ otherQuantity: 0 }]]);
    const res = response();
    await updateCartItem({ body: { quantity: 1 }, params: { id: 5 }, user: { id: 1 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Linen Shirt is out of stock' });
  });

  it('rejects with an insufficient-stock message naming the quantity left', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 5, product_id: 9, product_name: 'Linen Shirt', stock: 2 }]])
      .mockResolvedValueOnce([[{ otherQuantity: 0 }]]);
    const res = response();
    await updateCartItem({ body: { quantity: 3 }, params: { id: 5 }, user: { id: 1 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Only 2 left in stock for Linen Shirt' });
  });

  it('updates the quantity when within stock and exactly at the per-product limit (string SUM result must add numerically)', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 5, product_id: 9, product_name: 'Linen Shirt', stock: 5 }]])
      .mockResolvedValueOnce([[{ otherQuantity: '1' }]]) // 1 in another size (as a string), +3 = 4, exactly the cap
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = response();
    await updateCartItem({ body: { quantity: 3 }, params: { id: 5 }, user: { id: 1 } }, res);
    expect(res.json).toHaveBeenCalledWith({ message: 'Cart updated' });
    expect(pool.query.mock.calls[2]).toEqual(['UPDATE cart_items SET quantity = ? WHERE id = ? AND user_id = ?', [3, 5, 1]]);
  });
});
