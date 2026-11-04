jest.mock('../config/db', () => ({ pool: { query: jest.fn(), getConnection: jest.fn() } }));
jest.mock('../utils/email', () => ({
  sendOrderConfirmationToCustomer: jest.fn().mockResolvedValue({}),
  sendOrderNotificationToAdmin: jest.fn().mockResolvedValue({}),
}));
jest.mock('../utils/refunds', () => ({
  refundOrder: jest.fn(),
  refundableBalance: (order) => Number(order.total_amount) - Number(order.refunded_amount || 0),
  httpError: (statusCode, message) => Object.assign(new Error(message), { statusCode }),
}));

const { pool } = require('../config/db');
const { refundOrder } = require('../utils/refunds');
const { sendOrderConfirmationToCustomer } = require('../utils/email');
const { markOrderPaid, cancelOrderAndRefund, requestOrderCancellation, expireStalePendingOrders } = require('../utils/orderLifecycle');

const pendingOrder = {
  id: 8, user_id: 1, order_number: 'KRM8', status: 'pending_payment', payment_method: 'ONLINE',
  payment_status: 'pending', coupon_code: 'FIRST30', total_amount: 1400, refunded_amount: 0,
};
const connectionFor = (order) => ({
  beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
  query: jest.fn(async (sql) => (sql.startsWith('SELECT') ? [order ? [order] : []] : [{}])),
});
const ran = (connection, fragment) => connection.query.mock.calls.filter(([sql]) => sql.includes(fragment));
const updates = (connection) => connection.query.mock.calls.filter(([sql]) => sql.startsWith('UPDATE'));
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockResolvedValue([[]]);
});

describe('markOrderPaid', () => {
  it('confirms the order, clears the purchased items from the bag, counts the coupon, and emails', async () => {
    const connection = connectionFor(pendingOrder);
    pool.getConnection.mockResolvedValue(connection);
    pool.query.mockResolvedValueOnce([[{ ...pendingOrder, customer_name: 'Jane', customer_email: 'j@example.com' }]]).mockResolvedValueOnce([[]]);

    const result = await markOrderPaid({ razorpayOrderId: 'order_8', razorpayPaymentId: 'pay_8' });
    await flush();

    expect(ran(connection, "SET status = 'placed', payment_status = 'paid'")[0][1]).toEqual(['pay_8', 8]);
    expect(ran(connection, 'DELETE ci FROM cart_items')[0][1]).toEqual([1, 8]);
    expect(ran(connection, 'used_count = used_count + 1')[0][1]).toEqual(['FIRST30']);
    expect(connection.commit).toHaveBeenCalled();
    expect(result.order).toMatchObject({ status: 'placed', payment_status: 'paid' });
    expect(sendOrderConfirmationToCustomer).toHaveBeenCalledTimes(1);
  });

  it('does nothing the second time (browser verify and webhook both arrive)', async () => {
    const connection = connectionFor({ ...pendingOrder, status: 'placed', payment_status: 'paid' });
    pool.getConnection.mockResolvedValue(connection);

    const result = await markOrderPaid({ razorpayOrderId: 'order_8', razorpayPaymentId: 'pay_8' });

    expect(result.alreadyHandled).toBe(true);
    expect(updates(connection)).toHaveLength(0);
    expect(connection.rollback).toHaveBeenCalled();
    expect(sendOrderConfirmationToCustomer).not.toHaveBeenCalled();
  });

  it('refunds a payment that arrives after the order expired, since its stock was released', async () => {
    const connection = connectionFor({ ...pendingOrder, status: 'cancelled', payment_status: 'failed' });
    pool.getConnection.mockResolvedValue(connection);
    refundOrder.mockResolvedValue({ amount: 1400 });

    const result = await markOrderPaid({ razorpayOrderId: 'order_8', razorpayPaymentId: 'pay_8' });

    expect(result.refundedLatePayment).toBe(true);
    expect(ran(connection, "payment_status = 'paid', razorpay_payment_id")[0][1]).toEqual(['pay_8', 8]);
    expect(ran(connection, 'DELETE ci FROM cart_items')).toHaveLength(0);
    expect(refundOrder).toHaveBeenCalledWith(expect.objectContaining({ orderId: 8, initiatedBy: 'system' }));
    expect(sendOrderConfirmationToCustomer).not.toHaveBeenCalled();
  });

  it('ignores an unknown Razorpay order', async () => {
    pool.getConnection.mockResolvedValue(connectionFor(null));
    const result = await markOrderPaid({ razorpayOrderId: 'order_x', razorpayPaymentId: 'pay_x' });
    expect(result.order).toBeNull();
  });
});

describe('cancelOrderAndRefund', () => {
  it('requires admin approval instead of letting a customer cancel directly', async () => {
    const connection = connectionFor({ ...pendingOrder, status: 'placed', cancellation_status: 'requested' });
    pool.getConnection.mockResolvedValue(connection);
    await expect(cancelOrderAndRefund(8, { userId: 1, initiatedBy: 'customer' })).rejects.toMatchObject({ statusCode: 400 });
    expect(updates(connection)).toHaveLength(0);
    expect(refundOrder).not.toHaveBeenCalled();
  });

  it('records approval and refunds only when the admin cancels a requested paid order', async () => {
    const connection = connectionFor({ ...pendingOrder, status: 'placed', payment_status: 'paid', cancellation_status: 'requested' });
    pool.getConnection.mockResolvedValue(connection);
    refundOrder.mockResolvedValue({ amount: 1400, method: 'razorpay' });
    const result = await cancelOrderAndRefund(8, { initiatedBy: 'admin' });
    expect(updates(connection)[0][0]).toContain("cancellation_status = IF(cancellation_status = 'requested', 'approved', cancellation_status)");
    expect(ran(connection, 'p.stock + oi.quantity')).toHaveLength(1);
    expect(result.refund.amount).toBe(1400);
  });

  it('does not restock or refund again after approval was already processed', async () => {
    const connection = connectionFor({ ...pendingOrder, status: 'cancelled', cancellation_status: 'approved' });
    pool.getConnection.mockResolvedValue(connection);
    await expect(cancelOrderAndRefund(8, { initiatedBy: 'admin' })).rejects.toMatchObject({ statusCode: 400 });
    expect(updates(connection)).toHaveLength(0);
    expect(refundOrder).not.toHaveBeenCalled();
  });
  it('refunds a paid online order in full after cancelling and restocking it', async () => {
    const paid = { ...pendingOrder, status: 'placed', payment_status: 'paid' };
    const connection = connectionFor(paid);
    pool.getConnection.mockResolvedValue(connection);
    refundOrder.mockResolvedValue({ amount: 1400, method: 'razorpay' });

    const result = await cancelOrderAndRefund(8, { initiatedBy: 'admin' });

    expect(ran(connection, "SET status = 'cancelled', payment_status = ?")[0][1]).toEqual(['paid', 8]);
    expect(ran(connection, 'p.stock + oi.quantity')).toHaveLength(1);
    expect(ran(connection, 'used_count - 1')[0][1]).toEqual(['FIRST30']);
    expect(refundOrder).toHaveBeenCalledWith({ orderId: 8, reason: 'Order cancelled before shipping', initiatedBy: 'admin' });
    expect(result.refund).toEqual({ amount: 1400, method: 'razorpay' });
  });

  it('marks an unpaid order failed, restocks it, and leaves its uncounted coupon alone', async () => {
    const connection = connectionFor(pendingOrder);
    pool.getConnection.mockResolvedValue(connection);

    const result = await cancelOrderAndRefund(8, { initiatedBy: 'admin' });

    expect(ran(connection, "SET status = 'cancelled', payment_status = ?")[0][1]).toEqual(['failed', 8]);
    expect(ran(connection, 'p.stock + oi.quantity')).toHaveLength(1);
    expect(ran(connection, 'used_count - 1')).toHaveLength(0);
    expect(refundOrder).not.toHaveBeenCalled();
    expect(result.refund).toBeNull();
  });

  it('keeps the cancellation if the refund fails, reporting the problem', async () => {
    pool.getConnection.mockResolvedValue(connectionFor({ ...pendingOrder, status: 'processing', payment_status: 'paid' }));
    refundOrder.mockRejectedValue(new Error('Razorpay is down'));

    const result = await cancelOrderAndRefund(8, { initiatedBy: 'admin' });

    expect(result.order.status).toBe('cancelled');
    expect(result.refundError).toBe('Razorpay is down');
  });

  it('refuses orders that have shipped', async () => {
    const connection = connectionFor({ ...pendingOrder, status: 'shipped', payment_status: 'paid' });
    pool.getConnection.mockResolvedValue(connection);
    await expect(cancelOrderAndRefund(8, { initiatedBy: 'admin' })).rejects.toMatchObject({ statusCode: 400 });
    expect(connection.rollback).toHaveBeenCalled();
    expect(refundOrder).not.toHaveBeenCalled();
  });
});

describe('requestOrderCancellation', () => {
  it.each(['cod', 'paid', 'pending'])('holds stock, coupons and payment for a %s order', async (payment_status) => {
    const connection = connectionFor({ ...pendingOrder, status: payment_status === 'pending' ? 'pending_payment' : 'placed', payment_status });
    pool.getConnection.mockResolvedValue(connection);
    const result = await requestOrderCancellation(8, 1);
    expect(result.order.cancellation_status).toBe('requested');
    expect(result.alreadyRequested).toBe(false);
    expect(connection.query.mock.calls[0][1]).toEqual([8, 1]);
    expect(updates(connection)).toHaveLength(1);
    expect(updates(connection)[0][0]).toContain("SET cancellation_status = 'requested'");
    expect(refundOrder).not.toHaveBeenCalled();
  });

  it('makes a duplicate request a no-op', async () => {
    const connection = connectionFor({ ...pendingOrder, cancellation_status: 'requested' });
    pool.getConnection.mockResolvedValue(connection);
    expect((await requestOrderCancellation(8, 1)).alreadyRequested).toBe(true);
    expect(updates(connection)).toHaveLength(0);
  });

  it.each(['shipped', 'delivered', 'cancelled'])('rejects requests for %s orders', async (status) => {
    const connection = connectionFor({ ...pendingOrder, status });
    pool.getConnection.mockResolvedValue(connection);
    await expect(requestOrderCancellation(8, 1)).rejects.toMatchObject({ statusCode: 400 });
    expect(updates(connection)).toHaveLength(0);
  });
});

it('does not expire an unpaid order with a cancellation request awaiting approval', async () => {
  pool.query.mockResolvedValueOnce([[{ id: 8 }]]);
  const connection = connectionFor({ ...pendingOrder, cancellation_status: 'requested' });
  pool.getConnection.mockResolvedValue(connection);
  expect(await expireStalePendingOrders()).toBe(0);
  expect(updates(connection)).toHaveLength(0);
});

it('expires online orders left unpaid for 30 minutes and puts their stock back', async () => {
  pool.query.mockResolvedValueOnce([[{ id: 8 }, { id: 9 }]]);
  const stillPending = connectionFor({ status: 'pending_payment', payment_status: 'pending' });
  const paidMeanwhile = connectionFor({ status: 'placed', payment_status: 'paid' });
  pool.getConnection.mockResolvedValueOnce(stillPending).mockResolvedValueOnce(paidMeanwhile);

  const expired = await expireStalePendingOrders();

  expect(pool.query.mock.calls[0][1]).toEqual([30]);
  expect(expired).toBe(1);
  expect(ran(stillPending, 'p.stock + oi.quantity')).toHaveLength(1);
  expect(updates(paidMeanwhile)).toHaveLength(0);
});
