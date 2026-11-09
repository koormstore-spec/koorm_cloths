jest.mock('../config/db', () => ({ pool: { query: jest.fn(), getConnection: jest.fn() } }));
jest.mock('../utils/email', () => ({
  sendOrderConfirmationToCustomer: jest.fn().mockResolvedValue({}),
  sendOrderNotificationToAdmin: jest.fn().mockResolvedValue({}),
  sendOrderCancellationToAdmin: jest.fn().mockResolvedValue({}),
  sendOrderStatusUpdateToCustomer: jest.fn().mockResolvedValue({}),
}));
jest.mock('../utils/razorpay', () => ({
  ...jest.requireActual('../utils/razorpay'),
  createGatewayOrder: jest.fn(),
}));
jest.mock('../utils/orderLifecycle', () => ({ cancelOrderAndRefund: jest.fn().mockResolvedValue({}), loadOrderForEmail: jest.fn() }));

const { pool } = require('../config/db');
const { createGatewayOrder } = require('../utils/razorpay');
const { cancelOrderAndRefund } = require('../utils/orderLifecycle');
const { sendOrderConfirmationToCustomer } = require('../utils/email');
const { createOrder } = require('../controllers/orderController');

const user = { id: 1, name: 'Jane', email: 'jane@example.com' };
const body = {
  shipping_name: 'Jane', shipping_phone: '9876543210', shipping_address_line1: '1 Road',
  shipping_city: 'Pune', shipping_state: 'Maharashtra', shipping_pincode: '411001', payment_method: 'online',
};
const cartItem = { id: 1, size: 'M', quantity: 2, product_id: 9, name: 'Linen Shirt', images: '[]', price: 1000, stock: 5 };
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const connectionWith = (stock = 5) => ({
  beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
  query: jest.fn(async (sql) => {
    if (sql.includes('FROM cart_items')) return [[cartItem]];
    if (sql.includes('FROM products')) return [[{ id: 9, stock }]];
    if (sql.includes('INSERT INTO orders')) return [{ insertId: 42 }];
    return [[{ id: 1 }]];
  }),
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
  process.env.RAZORPAY_ALLOW_TEST = 'true';
  process.env.RAZORPAY_KEY_SECRET = 'test_secret';
  pool.query.mockResolvedValue([{}]);
});

it('holds the stock, keeps the bag, and returns what the payment window needs', async () => {
  const connection = connectionWith();
  pool.getConnection.mockResolvedValue(connection);
  createGatewayOrder.mockResolvedValue({ id: 'order_rzp_42' });
  const res = mockRes();

  await createOrder({ user, body }, res);

  const insert = connection.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO orders'));
  expect(insert[1].slice(7, 10)).toEqual(['ONLINE', 'pending_payment', 'pending']);
  const sqls = connection.query.mock.calls.map(([sql]) => sql);
  expect(sqls.some((sql) => sql.includes('stock = stock - ?'))).toBe(true);
  expect(sqls.some((sql) => sql.includes('DELETE FROM cart_items'))).toBe(false);
  // 2 x ₹1000 = ₹2000, which qualifies for free shipping (₹1999 and up).
  expect(createGatewayOrder).toHaveBeenCalledWith(expect.objectContaining({ amount: 2000 }));
  expect(pool.query).toHaveBeenCalledWith('UPDATE orders SET razorpay_order_id = ? WHERE id = ?', ['order_rzp_42', 42]);
  expect(res.status).toHaveBeenCalledWith(201);
  expect(res.json.mock.calls[0][0]).toMatchObject({
    id: 42, status: 'pending_payment', payment_method: 'ONLINE',
    payment: { key_id: 'rzp_test_key', razorpay_order_id: 'order_rzp_42', amount: 200000, prefill: { contact: '9876543210' } },
  });
  // Confirmation emails wait until the payment succeeds.
  expect(sendOrderConfirmationToCustomer).not.toHaveBeenCalled();
});

it('releases the held stock if Razorpay cannot start the payment', async () => {
  pool.getConnection.mockResolvedValue(connectionWith());
  createGatewayOrder.mockRejectedValue(Object.assign(new Error('Razorpay unavailable'), { statusCode: 502 }));
  const res = mockRes();

  await createOrder({ user, body }, res);

  expect(cancelOrderAndRefund).toHaveBeenCalledWith(42, { initiatedBy: 'system' });
  expect(res.status).toHaveBeenCalledWith(502);
});

it('re-checks stock under a lock, so the last piece can only be sold once', async () => {
  const connection = connectionWith(1);
  pool.getConnection.mockResolvedValue(connection);
  const res = mockRes();

  await createOrder({ user, body }, res);

  expect(res.json).toHaveBeenCalledWith({ message: 'Only 1 left in stock for Linen Shirt' });
  expect(connection.rollback).toHaveBeenCalled();
  expect(createGatewayOrder).not.toHaveBeenCalled();
});

it('offers cash on delivery instead when no Razorpay keys are set', async () => {
  delete process.env.RAZORPAY_KEY_SECRET;
  const connection = connectionWith();
  pool.getConnection.mockResolvedValue(connection);
  const res = mockRes();

  await createOrder({ user, body }, res);

  expect(res.status).toHaveBeenCalledWith(503);
  expect(connection.query).not.toHaveBeenCalled();
});
