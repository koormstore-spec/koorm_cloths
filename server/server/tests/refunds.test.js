jest.mock('../config/db', () => ({ pool: { query: jest.fn(), getConnection: jest.fn() } }));
jest.mock('../utils/razorpay', () => ({ createGatewayRefund: jest.fn() }));
jest.mock('../utils/email', () => ({ sendRefundInitiatedToCustomer: jest.fn().mockResolvedValue({}) }));

const { pool } = require('../config/db');
const { createGatewayRefund } = require('../utils/razorpay');
const { refundOrder, applyRefundWebhook } = require('../utils/refunds');

const paidOrder = {
  id: 5, user_id: 1, order_number: 'KRM5', status: 'placed', payment_method: 'ONLINE',
  payment_status: 'paid', razorpay_payment_id: 'pay_5', total_amount: 2000, refunded_amount: 0,
};

// A connection whose SELECTs return `rows` by table, recording every query.
const connectionFor = (rows) => {
  const connection = {
    beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
    query: jest.fn(async (sql) => {
      if (sql.startsWith('SELECT * FROM orders')) return [[rows.order]];
      if (sql.startsWith('SELECT * FROM refunds')) return [[rows.refund]];
      if (sql.startsWith('INSERT INTO refunds')) return [{ insertId: 70 }];
      return [{}];
    }),
  };
  return connection;
};
const updatesTo = (connection, table) => connection.query.mock.calls.filter(([sql]) => sql.startsWith(`UPDATE ${table}`));

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockResolvedValue([[{ name: 'Jane', email: 'jane@example.com' }]]);
});

it('refunds the full remaining amount to the original payment by default', async () => {
  const connection = connectionFor({ order: paidOrder });
  pool.getConnection.mockResolvedValue(connection);
  createGatewayRefund.mockResolvedValue({ id: 'rfnd_1', status: 'processed' });

  const refund = await refundOrder({ orderId: 5, reason: 'Cancelled', initiatedBy: 'customer' });

  expect(createGatewayRefund).toHaveBeenCalledWith('pay_5', 2000, expect.objectContaining({ order_number: 'KRM5' }));
  expect(updatesTo(connection, 'orders')[0][1]).toEqual([2000, 'refunded', 5]);
  expect(refund).toMatchObject({ amount: 2000, method: 'razorpay', status: 'processed' });
  expect(pool.query).toHaveBeenCalledWith('UPDATE refunds SET razorpay_refund_id = ?, status = ? WHERE id = ?', ['rfnd_1', 'processed', 70]);
});

it('allows a partial refund and marks the order partially refunded', async () => {
  const connection = connectionFor({ order: paidOrder });
  pool.getConnection.mockResolvedValue(connection);
  createGatewayRefund.mockResolvedValue({ id: 'rfnd_2', status: 'pending' });

  await refundOrder({ orderId: 5, amount: 499.5, initiatedBy: 'admin' });

  expect(updatesTo(connection, 'orders')[0][1]).toEqual([499.5, 'partially_refunded', 5]);
  expect(createGatewayRefund).toHaveBeenCalledWith('pay_5', 499.5, expect.any(Object));
});

it('never refunds more than what is left on the order', async () => {
  pool.getConnection.mockResolvedValue(connectionFor({ order: { ...paidOrder, refunded_amount: 1500, payment_status: 'partially_refunded' } }));

  await expect(refundOrder({ orderId: 5, amount: 600, initiatedBy: 'admin' })).rejects.toMatchObject({
    statusCode: 400, message: 'You can refund at most ₹500 on this order.',
  });
  expect(createGatewayRefund).not.toHaveBeenCalled();
});

it('puts the amount back if Razorpay refuses the refund', async () => {
  const reserve = connectionFor({ order: paidOrder });
  const release = connectionFor({ order: { ...paidOrder, refunded_amount: 2000 }, refund: { id: 70, order_id: 5, amount: 2000, status: 'pending' } });
  pool.getConnection.mockResolvedValueOnce(reserve).mockResolvedValueOnce(release);
  createGatewayRefund.mockRejectedValue(Object.assign(new Error('Payment not captured'), { statusCode: 400 }));

  await expect(refundOrder({ orderId: 5, initiatedBy: 'admin' })).rejects.toThrow('Payment not captured');

  expect(updatesTo(release, 'orders')[0][1]).toEqual([0, 'paid', 5]);
  expect(release.query).toHaveBeenCalledWith("UPDATE refunds SET status = 'failed' WHERE id = ?", [70]);
});

it('refuses an order that was never paid online', async () => {
  pool.getConnection.mockResolvedValue(connectionFor({ order: { ...paidOrder, payment_status: 'pending', razorpay_payment_id: null } }));
  await expect(refundOrder({ orderId: 5, initiatedBy: 'admin' })).rejects.toThrow('This order has no online payment to refund.');
});

describe('cash-on-delivery orders', () => {
  const codOrder = { ...paidOrder, payment_method: 'COD', payment_status: 'cod', razorpay_payment_id: null, status: 'delivered' };

  it('records a manual refund with its transfer reference, without calling Razorpay', async () => {
    const connection = connectionFor({ order: codOrder });
    pool.getConnection.mockResolvedValue(connection);

    const refund = await refundOrder({ orderId: 5, amount: 800, reference: 'UPI-123', initiatedBy: 'admin' });

    expect(createGatewayRefund).not.toHaveBeenCalled();
    expect(refund).toMatchObject({ method: 'manual', status: 'processed', amount: 800 });
    const insert = connection.query.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO refunds'));
    expect(insert[1]).toEqual([5, null, 800, null, 'manual', 'UPI-123', 'processed', 'admin']);
  });

  it('needs the transfer reference', async () => {
    pool.getConnection.mockResolvedValue(connectionFor({ order: codOrder }));
    await expect(refundOrder({ orderId: 5, initiatedBy: 'admin' })).rejects.toThrow('Add the bank or UPI reference');
  });

  it('is only for delivered orders, where the cash was actually collected', async () => {
    pool.getConnection.mockResolvedValue(connectionFor({ order: { ...codOrder, status: 'shipped' } }));
    await expect(refundOrder({ orderId: 5, reference: 'X', initiatedBy: 'admin' })).rejects.toThrow('Manual refunds are for delivered');
  });
});

describe('applyRefundWebhook', () => {
  it('marks a refund processed', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 70, status: 'pending' }]]).mockResolvedValueOnce([{}]);
    await applyRefundWebhook('refund.processed', { id: 'rfnd_1' });
    expect(pool.query).toHaveBeenLastCalledWith("UPDATE refunds SET status = 'processed' WHERE id = ?", [70]);
  });

  it('gives the amount back to the order when a refund fails', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 70, status: 'pending' }]]);
    const release = connectionFor({ order: { ...paidOrder, refunded_amount: 2000 }, refund: { id: 70, order_id: 5, amount: 2000, status: 'pending' } });
    pool.getConnection.mockResolvedValue(release);
    await applyRefundWebhook('refund.failed', { id: 'rfnd_1' });
    expect(release.query).toHaveBeenCalledWith("UPDATE refunds SET status = 'failed' WHERE id = ?", [70]);
  });

  it('ignores refunds it does not know about', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    await applyRefundWebhook('refund.processed', { id: 'rfnd_unknown' });
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});
