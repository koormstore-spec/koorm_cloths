jest.mock('../config/db', () => ({ pool: { query: jest.fn(), getConnection: jest.fn() } }));
jest.mock('../utils/email', () => ({ sendOrderConfirmationToCustomer: jest.fn().mockResolvedValue({}), sendOrderNotificationToAdmin: jest.fn().mockResolvedValue({}) }));
const { pool } = require('../config/db');
const { validateCoupon } = require('../controllers/couponController');
const { createOrder } = require('../controllers/orderController');
const coupon = { id: 30, code: 'FIRST30', discount_type: 'percent', discount_value: 30, min_order_amount: 0, is_active: 1 };
const item = { id: 1, product_id: 2, name: 'Shirt', size: 'M', quantity: 1, price: 1000, stock: 2, images: '[]' };
const user = { id: 9, name: 'Test', email: 'test@example.invalid' };
const shipping = { shipping_name: 'Test', shipping_phone: '1234567890', shipping_address_line1: 'Test address', shipping_city: 'Test city', shipping_state: 'Test state', shipping_pincode: '123456', coupon_code: 'FIRST30' };
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
beforeEach(() => jest.clearAllMocks());

test.each([false, true])('coupon preview checks previous orders: %p', async hasPrevious => {
  pool.query.mockResolvedValueOnce([[item]]).mockResolvedValueOnce([[coupon]]).mockResolvedValueOnce([hasPrevious ? [{ id: 77 }] : []]);
  const res = response();
  await validateCoupon({ user, body: { code: ' first30 ' } }, res);
  if (hasPrevious) {
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'FIRST30 is available on your first order only.' });
  } else {
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'FIRST30', discount_amount: 300 }));
  }
});

test.each([false, true])('checkout rechecks eligibility inside the transaction: %p', async hasPrevious => {
  const connection = { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(), query: jest.fn(async sql => {
    if (sql.includes('FROM cart_items')) return [[item]];
    if (sql.includes('FROM coupons')) return [[coupon]];
    if (sql.includes('FROM users')) return [[{ id: user.id }]];
    if (sql.includes('FROM orders')) return [hasPrevious ? [{ id: 77 }] : []];
    if (sql.includes('FROM products')) return [[{ ...item, id: item.product_id }]];
    if (sql.includes('INSERT INTO orders')) return [{ insertId: 99 }];
    return [{ affectedRows: 1 }];
  }) };
  pool.getConnection.mockResolvedValue(connection);
  const res = response();
  await createOrder({ user, body: shipping }, res);
  const sql = connection.query.mock.calls.map(([query]) => query);
  expect(sql.indexOf('SELECT id FROM users WHERE id = ? FOR UPDATE')).toBeLessThan(sql.indexOf("SELECT id FROM orders WHERE user_id = ? AND payment_status <> 'failed' LIMIT 1 FOR UPDATE"));
  if (hasPrevious) {
    expect(res.status).toHaveBeenCalledWith(400);
    expect(connection.rollback).toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(sql.some(query => query.includes('INSERT INTO orders'))).toBe(false);
  } else {
    expect(connection.commit).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ items_total: 1000, shipping_fee: 99, discount_amount: 300, total_amount: 799, coupon_code: 'FIRST30' }));
  }
  expect(connection.release).toHaveBeenCalledTimes(1);
});
