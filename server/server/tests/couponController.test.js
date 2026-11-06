jest.mock('../config/db', () => ({
  pool: { query: jest.fn() },
}));

const { pool } = require('../config/db');
const {
  evaluateCoupon,
  validateCoupon,
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
} = require('../controllers/couponController');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('evaluateCoupon', () => {
  const baseCoupon = {
    id: 1,
    code: 'SAVE10',
    discount_type: 'percent',
    discount_value: 10,
    min_order_amount: 500,
    max_discount_amount: null,
    usage_limit: null,
    used_count: 0,
    expires_at: null,
    is_active: 1,
  };

  it('rejects an inactive coupon', () => {
    expect(evaluateCoupon({ ...baseCoupon, is_active: 0 }, 1000)).toEqual({
      error: 'This coupon is no longer active',
    });
  });

  it('rejects an expired coupon', () => {
    expect(evaluateCoupon({ ...baseCoupon, expires_at: '2000-01-01' }, 1000).error).toMatch(/expired/);
  });

  it('rejects a coupon that has hit its usage limit', () => {
    expect(evaluateCoupon({ ...baseCoupon, usage_limit: 5, used_count: 5 }, 1000).error).toMatch(/usage limit/);
  });

  it('rejects an order below the minimum amount', () => {
    expect(evaluateCoupon(baseCoupon, 100).error).toBeDefined();
  });

  it('computes a percentage discount', () => {
    expect(evaluateCoupon(baseCoupon, 1000)).toEqual({ discountAmount: 100 });
  });

  it('caps a percentage discount at max_discount_amount', () => {
    expect(evaluateCoupon({ ...baseCoupon, max_discount_amount: 50 }, 1000)).toEqual({ discountAmount: 50 });
  });

  it('computes a flat discount and never exceeds the order total', () => {
    expect(evaluateCoupon({ ...baseCoupon, discount_type: 'flat', discount_value: 2000 }, 1000)).toEqual({
      discountAmount: 1000,
    });
  });
});

describe('evaluateCoupon with invalid saved values', () => {
  const coupon = { is_active: 1, discount_type: 'flat', discount_value: 100, min_order_amount: 0, max_discount_amount: null, usage_limit: null, used_count: 0, expires_at: null };

  it.each([
    ['a negative flat value', { discount_value: -500 }],
    ['a zero value', { discount_value: 0 }],
    ['a value that is not a number', { discount_value: 'abc' }],
    ['a negative percent', { discount_type: 'percent', discount_value: -10 }],
    ['a percent over 100', { discount_type: 'percent', discount_value: 150 }],
    ['a negative maximum discount', { max_discount_amount: -50 }],
  ])('rejects %s', (_, fields) => {
    expect(evaluateCoupon({ ...coupon, ...fields }, 1000)).toEqual({ error: 'This coupon is not valid' });
  });
});

describe('updateCoupon validation', () => {
  const current = { id: 1, code: 'SAVE10', discount_type: 'percent', discount_value: '10.00', min_order_amount: '0.00', max_discount_amount: null, usage_limit: null, expires_at: null, is_active: 1 };

  beforeEach(() => pool.query.mockReset());

  it.each([
    ['a negative discount', { discount_value: -500 }],
    ['a zero discount', { discount_value: 0 }],
    ['a percent over 100', { discount_value: 150 }],
    ['a flat-to-percent change that breaks the limit', { discount_type: 'percent', discount_value: 101 }],
    ['a negative minimum order', { min_order_amount: -1 }],
    ['a negative maximum discount', { max_discount_amount: -1 }],
    ['an unusable redemption limit', { usage_limit: 0.5 }],
  ])('refuses %s and saves nothing', async (_, body) => {
    pool.query.mockResolvedValueOnce([[current]]);
    const res = mockRes();
    await updateCoupon({ params: { id: 1 }, body }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.query.mock.calls.some(([sql]) => sql.includes('UPDATE coupons'))).toBe(false);
  });

  it('still saves a valid edit and leaves the other fields as they were', async () => {
    pool.query.mockResolvedValueOnce([[current]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[{ ...current, discount_value: '20.00' }]]);
    const res = mockRes();
    await updateCoupon({ params: { id: 1 }, body: { discount_value: 20 } }, res);
    expect(res.status).not.toHaveBeenCalled();
    const update = pool.query.mock.calls.find(([sql]) => sql.includes('UPDATE coupons'));
    expect(update[1].slice(0, 3)).toEqual(['SAVE10', 'percent', 20]);
  });
});

describe('validateCoupon', () => {
  it('rejects a missing code', async () => {
    const req = { user: { id: 1 }, body: {} };
    const res = mockRes();

    await validateCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects when the cart is empty', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const req = { user: { id: 1 }, body: { code: 'SAVE10' } };
    const res = mockRes();

    await validateCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Your cart is empty' });
  });

  it('rejects an unknown code', async () => {
    pool.query
      .mockResolvedValueOnce([[{ quantity: 1, price: 1000 }]]) // cart
      .mockResolvedValueOnce([[]]); // coupon lookup
    const req = { user: { id: 1 }, body: { code: 'NOPE' } };
    const res = mockRes();

    await validateCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns the computed discount for a valid code', async () => {
    pool.query
      .mockResolvedValueOnce([[{ quantity: 2, price: 500 }]]) // cart -> itemsTotal 1000
      .mockResolvedValueOnce([[{
        id: 1, code: 'SAVE10', discount_type: 'percent', discount_value: 10,
        min_order_amount: 0, max_discount_amount: null, usage_limit: null,
        used_count: 0, expires_at: null, is_active: 1,
      }]]);
    const req = { user: { id: 1 }, body: { code: 'save10' } };
    const res = mockRes();

    await validateCoupon(req, res);

    expect(res.json).toHaveBeenCalledWith({
      code: 'SAVE10',
      discount_type: 'percent',
      discount_value: 10,
      discount_amount: 100,
      items_total: 1000,
    });
  });
});

describe('admin coupon CRUD', () => {
  it('lists coupons', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 1, code: 'SAVE10' }]]);
    const req = {};
    const res = mockRes();

    await listCoupons(req, res);

    expect(res.json).toHaveBeenCalledWith([{ id: 1, code: 'SAVE10' }]);
  });

  it('rejects creating a coupon with a duplicate code', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 1 }]]); // existing code lookup
    const req = { body: { code: 'SAVE10', discount_type: 'percent', discount_value: 10 } };
    const res = mockRes();

    await createCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'A coupon with this code already exists' });
  });

  it('creates a coupon and normalizes the code to uppercase', async () => {
    pool.query
      .mockResolvedValueOnce([[]]) // no existing coupon
      .mockResolvedValueOnce([{ insertId: 5 }]) // insert
      .mockResolvedValueOnce([[{ id: 5, code: 'WELCOME20' }]]); // select back
    const req = { body: { code: 'welcome20', discount_type: 'percent', discount_value: 20 } };
    const res = mockRes();

    await createCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const insertCall = pool.query.mock.calls[1];
    expect(insertCall[1][0]).toBe('WELCOME20');
  });

  it('rejects updating a coupon that does not exist', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const req = { params: { id: 99 }, body: {} };
    const res = mockRes();

    await updateCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('deletes a coupon', async () => {
    pool.query.mockResolvedValueOnce([{}]);
    const req = { params: { id: 1 } };
    const res = mockRes();

    await deleteCoupon(req, res);

    expect(res.json).toHaveBeenCalledWith({ message: 'Coupon deleted' });
  });
});
