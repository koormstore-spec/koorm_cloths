jest.mock('../config/db', () => ({ pool: { query: jest.fn() } }));
const { pool } = require('../config/db');
const { getFirstOrderEligibility } = require('../controllers/couponController');

const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });

beforeEach(() => jest.resetAllMocks());

const coupon = {
  code: 'FIRST30', is_active: 1, discount_type: 'percent', discount_value: 30,
  min_order_amount: 500, max_discount_amount: null, usage_limit: null,
  used_count: 0, expires_at: null,
};

it.each([
  [[], true],
  [[{ id: 12 }], false],
])('checks existing orders for the authenticated customer: %j', async (orders, eligible) => {
  pool.query.mockResolvedValueOnce([orders])
    .mockResolvedValueOnce([[coupon]])
    .mockResolvedValueOnce([[{ price: 1000, quantity: 1 }]]);
  const res = response();
  await getFirstOrderEligibility({ user: { id: 7 } }, res);
  expect(pool.query).toHaveBeenCalledWith("SELECT id FROM orders WHERE user_id = ? AND payment_status <> 'failed' LIMIT 1", [7]);
  expect(res.json).toHaveBeenCalledWith({ eligible });
});

it.each([
  ['missing', null],
  ['inactive', { ...coupon, is_active: 0 }],
  ['expired', { ...coupon, expires_at: '2000-01-01' }],
  ['exhausted', { ...coupon, usage_limit: 1, used_count: 1 }],
  ['below minimum spend', { ...coupon, min_order_amount: 2000 }],
])('does not suggest a coupon that is %s', async (_, candidate) => {
  pool.query.mockResolvedValueOnce([[]])
    .mockResolvedValueOnce([candidate ? [candidate] : []])
    .mockResolvedValueOnce([[{ price: 1000, quantity: 1 }]]);
  const res = response();
  await getFirstOrderEligibility({ user: { id: 7 } }, res);
  expect(res.json).toHaveBeenCalledWith({ eligible: false });
});

it('does not suggest a coupon for an empty bag', async () => {
  pool.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[coupon]]).mockResolvedValueOnce([[]]);
  const res = response();
  await getFirstOrderEligibility({ user: { id: 7 } }, res);
  expect(res.json).toHaveBeenCalledWith({ eligible: false });
});

it('uses item quantities when checking minimum spend', async () => {
  pool.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[coupon]])
    .mockResolvedValueOnce([[{ price: '250.00', quantity: 2 }]]);
  const res = response();
  await getFirstOrderEligibility({ user: { id: 7 } }, res);
  expect(pool.query).toHaveBeenLastCalledWith(expect.stringContaining('WHERE ci.user_id = ?'), [7]);
  expect(res.json).toHaveBeenCalledWith({ eligible: true });
});

it('does not claim eligibility when the database is unavailable', async () => {
  pool.query.mockRejectedValue(new Error('Database unavailable'));
  const res = response();
  await getFirstOrderEligibility({ user: { id: 7 } }, res);
  expect(res.status).toHaveBeenCalledWith(500);
});
