const mockPayments = { fetch: jest.fn(), capture: jest.fn() };
jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({ payments: mockPayments, orders: {} })));

const crypto = require('crypto');
const {
  verifyPaymentSignature,
  verifyWebhookSignature,
  checkoutOptions,
  isConfigured,
  getMode,
  confirmGatewayPayment,
  summarizePayment,
} = require('../utils/razorpay');

const sign = (payload, secret) => crypto.createHmac('sha256', secret).update(payload).digest('hex');

beforeEach(() => {
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
  process.env.RAZORPAY_KEY_SECRET = 'test_secret';
  process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook_secret';
});
afterAll(() => {
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
});

describe('verifyPaymentSignature', () => {
  const ids = { razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1' };

  it('accepts the signature Razorpay produces for this order and payment', () => {
    expect(verifyPaymentSignature({ ...ids, signature: sign('order_1|pay_1', 'test_secret') })).toBe(true);
  });

  it('rejects a tampered payment id, a wrong secret, or a missing signature', () => {
    const signature = sign('order_1|pay_1', 'test_secret');
    expect(verifyPaymentSignature({ ...ids, razorpayPaymentId: 'pay_2', signature })).toBe(false);
    expect(verifyPaymentSignature({ ...ids, signature: sign('order_1|pay_1', 'other') })).toBe(false);
    expect(verifyPaymentSignature({ ...ids, signature: undefined })).toBe(false);
  });
});

describe('verifyWebhookSignature', () => {
  it('checks the signature over the exact raw body', () => {
    const body = '{"event":"payment.captured"}';
    expect(verifyWebhookSignature(body, sign(body, 'webhook_secret'))).toBe(true);
    expect(verifyWebhookSignature(`${body} `, sign(body, 'webhook_secret'))).toBe(false);
  });

  it('rejects every webhook when no webhook secret is configured', () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    expect(verifyWebhookSignature('{}', sign('{}', ''))).toBe(false);
  });
});

it('builds the popup options with the amount in paise and the public key only', () => {
  const options = checkoutOptions({ total_amount: 1099.5, order_number: 'KRM1', shipping_phone: '999' }, 'order_9', { name: 'Jane', email: 'j@example.com' });
  expect(options).toMatchObject({ key_id: 'rzp_test_key', razorpay_order_id: 'order_9', amount: 109950, currency: 'INR' });
  expect(JSON.stringify(options)).not.toContain('test_secret');
});

it('reports online payments as unavailable without keys', () => {
  delete process.env.RAZORPAY_KEY_SECRET;
  expect(isConfigured()).toBe(false);
});

it('reports test or live mode from the key prefix', () => {
  expect(getMode()).toBe('test');
  process.env.RAZORPAY_KEY_ID = 'rzp_live_abc';
  expect(getMode()).toBe('live');
  delete process.env.RAZORPAY_KEY_SECRET;
  expect(getMode()).toBeNull();
});

describe('confirmGatewayPayment', () => {
  const args = { paymentId: 'pay_1', razorpayOrderId: 'order_1', amount: 1400 };
  const payment = (overrides) => ({ id: 'pay_1', order_id: 'order_1', amount: 140000, currency: 'INR', status: 'captured', ...overrides });
  beforeEach(() => { mockPayments.fetch.mockReset(); mockPayments.capture.mockReset(); });

  it('accepts a captured payment for the full amount', async () => {
    mockPayments.fetch.mockResolvedValue(payment());
    await expect(confirmGatewayPayment(args)).resolves.toMatchObject({ status: 'captured' });
    expect(mockPayments.capture).not.toHaveBeenCalled();
  });

  it('captures a payment that is only authorized', async () => {
    mockPayments.fetch.mockResolvedValue(payment({ status: 'authorized' }));
    mockPayments.capture.mockResolvedValue(payment());
    await confirmGatewayPayment(args);
    expect(mockPayments.capture).toHaveBeenCalledWith('pay_1', 140000, 'INR');
  });

  it('rejects a payment for the wrong amount or another order', async () => {
    mockPayments.fetch.mockResolvedValue(payment({ amount: 100 }));
    await expect(confirmGatewayPayment(args)).rejects.toMatchObject({ statusCode: 400 });
    mockPayments.fetch.mockResolvedValue(payment({ order_id: 'order_2' }));
    await expect(confirmGatewayPayment(args)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a payment that has not gone through', async () => {
    mockPayments.fetch.mockResolvedValue(payment({ status: 'failed' }));
    await expect(confirmGatewayPayment(args)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('summarizePayment', () => {
  it('keeps how the customer paid, in rupees, without any full card or account number', () => {
    const details = summarizePayment({
      id: 'pay_1', order_id: 'order_1', status: 'captured', method: 'card', amount: 140000, currency: 'INR', fee: 3304, tax: 504,
      email: 'jane@example.com', contact: '+919876543210', created_at: 1700000000,
      card: { id: 'card_1', name: 'Jane', network: 'Visa', type: 'credit', issuer: 'HDFC', last4: '4242', international: false },
      acquirer_data: { auth_code: '123456', rrn: '330012345678' },
    });
    expect(details).toMatchObject({
      id: 'pay_1', method: 'card', amount: 1400, fee: 33.04, tax: 5.04, contact: '+919876543210',
      card: { network: 'Visa', type: 'credit', issuer: 'HDFC', last4: '4242' },
      reference: { rrn: '330012345678', auth_code: '123456' },
      created_at: '2023-11-14T22:13:20.000Z',
    });
    expect(details.card).not.toHaveProperty('id');
  });

  it('records the UPI ID and bank for UPI and net banking payments', () => {
    expect(summarizePayment({ id: 'pay_2', method: 'upi', vpa: 'jane@okhdfcbank', amount: 100, acquirer_data: { upi_transaction_id: 'UPI9' } }))
      .toMatchObject({ vpa: 'jane@okhdfcbank', card: null, reference: { upi_transaction_id: 'UPI9' } });
    expect(summarizePayment({ id: 'pay_3', method: 'netbanking', bank: 'SBIN', amount: 100 })).toMatchObject({ bank: 'SBIN' });
    expect(summarizePayment(null)).toBeNull();
  });
});
