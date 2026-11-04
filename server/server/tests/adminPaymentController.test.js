jest.mock('../config/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../utils/paymentDetails', () => ({
  ...jest.requireActual('../utils/paymentDetails'),
  syncPaymentDetails: jest.fn(),
}));

const { pool } = require('../config/db');
const { syncPaymentDetails } = require('../utils/paymentDetails');
const { getPayments, refreshPayment } = require('../controllers/adminPaymentController');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
  process.env.RAZORPAY_KEY_SECRET = 'test_secret';
});

describe('getPayments', () => {
  it('lists online payments with their details and totals what was collected', async () => {
    pool.query
      .mockResolvedValueOnce([[
        { id: 1, payment_status: 'paid', total_amount: '1400.00', refunded_amount: '0.00', payment_details: JSON.stringify({ method: 'upi', vpa: 'jane@okhdfcbank', fee: 33.04 }) },
        { id: 2, payment_status: 'partially_refunded', total_amount: '600.00', refunded_amount: '100.00', payment_details: null },
        { id: 3, payment_status: 'failed', total_amount: '900.00', refunded_amount: '0.00', payment_details: null },
      ]])
      .mockResolvedValueOnce([[{ id: 9, order_id: 2, amount: '100.00', status: 'processed' }]]);
    const res = mockRes();

    await getPayments({}, res);

    const body = res.json.mock.calls[0][0];
    expect(body.mode).toBe('test');
    expect(body.summary).toEqual({ count: 2, collected: 2000, refunded: 100, fees: 33.04, net: 1866.96 });
    expect(body.payments[0].payment_details).toEqual({ method: 'upi', vpa: 'jane@okhdfcbank', fee: 33.04 });
    expect(body.payments[1].refunds).toHaveLength(1);
    expect(pool.query.mock.calls[0][0]).toContain("payment_method = 'ONLINE'");
  });
});

describe('refreshPayment', () => {
  it('re-reads the payment from Razorpay', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 4, razorpay_payment_id: 'pay_4' }]]);
    syncPaymentDetails.mockResolvedValue({ id: 'pay_4', method: 'card' });
    const res = mockRes();
    await refreshPayment({ params: { id: 4 } }, res);
    expect(syncPaymentDetails).toHaveBeenCalledWith('pay_4');
    expect(res.json).toHaveBeenCalledWith({ id: 4, payment_details: { id: 'pay_4', method: 'card' } });
  });

  it('explains when the order has not been paid yet', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 4, razorpay_payment_id: null }]]);
    const res = mockRes();
    await refreshPayment({ params: { id: 4 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(syncPaymentDetails).not.toHaveBeenCalled();
  });
});
