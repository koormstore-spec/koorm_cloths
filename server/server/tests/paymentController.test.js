jest.mock('../config/db', () => ({ pool: { query: jest.fn(), getConnection: jest.fn() } }));
jest.mock('../utils/orderLifecycle', () => ({ markOrderPaid: jest.fn() }));
jest.mock('../utils/refunds', () => ({ applyRefundWebhook: jest.fn() }));
jest.mock('../utils/paymentDetails', () => ({ recordPaymentDetails: jest.fn() }));
jest.mock('../utils/razorpay', () => ({ ...jest.requireActual('../utils/razorpay'), confirmGatewayPayment: jest.fn() }));

const crypto = require('crypto');
const { pool } = require('../config/db');
const { markOrderPaid } = require('../utils/orderLifecycle');
const { applyRefundWebhook } = require('../utils/refunds');
const { confirmGatewayPayment } = require('../utils/razorpay');
const { recordPaymentDetails } = require('../utils/paymentDetails');
const { verifyPayment, retryPayment, handleWebhook } = require('../controllers/paymentController');

const sign = (payload, secret) => crypto.createHmac('sha256', secret).update(payload).digest('hex');
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const user = { id: 1, name: 'Jane', email: 'jane@example.com' };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
  process.env.RAZORPAY_KEY_SECRET = 'test_secret';
  process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook_secret';
  confirmGatewayPayment.mockResolvedValue({ status: 'captured' });
});

describe('verifyPayment', () => {
  const body = (overrides = {}) => ({
    order_id: 8, razorpay_order_id: 'order_8', razorpay_payment_id: 'pay_8',
    razorpay_signature: sign('order_8|pay_8', 'test_secret'), ...overrides,
  });

  it('marks the order paid when the signature is genuine', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 8, razorpay_order_id: 'order_8', total_amount: 1400 }]]);
    markOrderPaid.mockResolvedValue({ order: { status: 'placed', payment_status: 'paid' } });
    const res = mockRes();

    await verifyPayment({ user, body: body() }, res);

    expect(confirmGatewayPayment).toHaveBeenCalledWith({ paymentId: 'pay_8', razorpayOrderId: 'order_8', amount: 1400 });

    expect(pool.query.mock.calls[0][1]).toEqual([8, 1]); // only the customer's own order
    expect(markOrderPaid).toHaveBeenCalledWith({ razorpayOrderId: 'order_8', razorpayPaymentId: 'pay_8' });
    expect(res.json).toHaveBeenCalledWith({ id: 8, status: 'placed', payment_status: 'paid', refunded_late_payment: false });
    expect(recordPaymentDetails).toHaveBeenCalledWith({ status: 'captured' });
  });

  it('rejects a forged signature without marking anything paid', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 8, razorpay_order_id: 'order_8' }]]);
    const res = mockRes();
    await verifyPayment({ user, body: body({ razorpay_signature: sign('order_8|pay_8', 'guess') }) }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(markOrderPaid).not.toHaveBeenCalled();
  });

  it("rejects a payment for a different order (e.g. paying a cheap order to unlock another)", async () => {
    pool.query.mockResolvedValueOnce([[{ id: 8, razorpay_order_id: 'order_8' }]]);
    const res = mockRes();
    await verifyPayment({ user, body: body({ razorpay_order_id: 'order_cheap', razorpay_signature: sign('order_cheap|pay_8', 'test_secret') }) }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(markOrderPaid).not.toHaveBeenCalled();
  });

  it('does not mark the order paid when Razorpay reports a different amount', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 8, razorpay_order_id: 'order_8', total_amount: 1400 }]]);
    confirmGatewayPayment.mockRejectedValue(Object.assign(new Error('This payment does not match the order.'), { statusCode: 400 }));
    const res = mockRes();
    await verifyPayment({ user, body: body() }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(markOrderPaid).not.toHaveBeenCalled();
  });

  it('tells the browser the payment is being confirmed when Razorpay is unreachable', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 8, razorpay_order_id: 'order_8', total_amount: 1400 }]]);
    confirmGatewayPayment.mockRejectedValue(Object.assign(new Error('timeout'), { statusCode: 502 }));
    const res = mockRes();
    await verifyPayment({ user, body: body() }, res);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ confirming: true }));
    expect(markOrderPaid).not.toHaveBeenCalled();
  });
});

describe('retryPayment', () => {
  it('blocks a new payment attempt while cancellation awaits approval', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 8, status: 'pending_payment', payment_status: 'pending', cancellation_status: 'requested' }]]);
    const res = mockRes();
    await retryPayment({ user, params: { id: 8 } }, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
  it('reopens payment for an order still waiting for it', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 8, order_number: 'KRM8', status: 'pending_payment', payment_status: 'pending', razorpay_order_id: 'order_8', total_amount: 1400, shipping_phone: '999' }]]);
    const res = mockRes();
    await retryPayment({ user, params: { id: 8 } }, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ razorpay_order_id: 'order_8', amount: 140000, key_id: 'rzp_test_key' }));
  });

  it('refuses an order that is already paid or cancelled', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 8, status: 'cancelled', payment_status: 'failed' }]]);
    const res = mockRes();
    await retryPayment({ user, params: { id: 8 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('handleWebhook', () => {
  const deliver = async (event, signature) => {
    const raw = JSON.stringify(event);
    const res = mockRes();
    await handleWebhook({ body: Buffer.from(raw), get: () => signature ?? sign(raw, 'webhook_secret') }, res);
    return res;
  };

  it('rejects a webhook with a bad signature', async () => {
    const res = await deliver({ event: 'payment.captured' }, 'bad');
    expect(res.status).toHaveBeenCalledWith(400);
    expect(markOrderPaid).not.toHaveBeenCalled();
  });

  it('confirms a captured payment even if the customer closed the browser', async () => {
    markOrderPaid.mockResolvedValue({ order: {} });
    const res = await deliver({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_8', order_id: 'order_8' } } } });
    expect(markOrderPaid).toHaveBeenCalledWith({ razorpayOrderId: 'order_8', razorpayPaymentId: 'pay_8' });
    expect(recordPaymentDetails).toHaveBeenCalledWith('pay_8');
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it('captures an authorized-only payment before confirming the order', async () => {
    pool.query.mockResolvedValueOnce([[{ total_amount: 1400 }]]);
    markOrderPaid.mockResolvedValue({ order: {} });
    const res = await deliver({ event: 'payment.authorized', payload: { payment: { entity: { id: 'pay_8', order_id: 'order_8' } } } });
    expect(confirmGatewayPayment).toHaveBeenCalledWith({ paymentId: 'pay_8', razorpayOrderId: 'order_8', amount: 1400 });
    expect(markOrderPaid).toHaveBeenCalledWith({ razorpayOrderId: 'order_8', razorpayPaymentId: 'pay_8' });
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it('passes refund outcomes to the refund service', async () => {
    await deliver({ event: 'refund.failed', payload: { refund: { entity: { id: 'rfnd_1' } } } });
    expect(applyRefundWebhook).toHaveBeenCalledWith('refund.failed', { id: 'rfnd_1' });
  });

  it('asks Razorpay to retry when processing fails', async () => {
    markOrderPaid.mockRejectedValue(new Error('db down'));
    const res = await deliver({ event: 'order.paid', payload: { payment: { entity: { id: 'pay_8', order_id: 'order_8' } } } });
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
