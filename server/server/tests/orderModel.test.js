jest.mock('../config/db', () => ({ pool: { query: jest.fn() } }));
const { pool } = require('../config/db');
const { hasPurchasedProduct } = require('../models/orderModel');

beforeEach(() => jest.resetAllMocks());

test('returns true when the customer has a non-cancelled order containing the product', async () => {
  pool.query.mockResolvedValueOnce([[{ id: 42 }]]);
  await expect(hasPurchasedProduct(3, 2)).resolves.toBe(true);
  const [sql, params] = pool.query.mock.calls[0];
  expect(sql).toContain("o.status != 'cancelled'");
  expect(params).toEqual([3, 2]);
});

test('returns false when no order item matches', async () => {
  pool.query.mockResolvedValueOnce([[]]);
  await expect(hasPurchasedProduct(3, 2)).resolves.toBe(false);
});
