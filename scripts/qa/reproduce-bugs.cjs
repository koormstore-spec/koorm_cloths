/* Targeted audit reproductions. These assert the observed BUGGY behavior,
 * not correct behavior. All DB, mail and payment operations are isolated.
 * Run from the repository root: node scripts/qa/reproduce-bugs.cjs
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const serverRequire = createRequire(path.resolve(__dirname, '../../server/server/package.json'));
const pool = {};
function stub(relative, exports) {
  const id = serverRequire.resolve(relative);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
stub('./config/db', { pool, adminPool: pool });
stub('./utils/email', new Proxy({}, { get: () => async () => ({ sent: true }) }));
stub('./utils/razorpay', { isConfigured: () => false });
stub('./utils/refunds', {
  refundOrder: async () => ({}), refundableBalance: () => 0,
  httpError: (statusCode, message) => Object.assign(new Error(message), { statusCode }),
});
stub('./utils/generateToken', { generateToken: () => 'isolated-test-session' });
const products = serverRequire('./controllers/productController');
const coupons = serverRequire('./controllers/couponController');
const cart = serverRequire('./controllers/cartController');
const orders = serverRequire('./controllers/orderController');
const auth = serverRequire('./controllers/authController');

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } });
const cleanSql = sql => sql.replace(/\s+/g, ' ').trim();
const shipping = { shipping_name: 'QA', shipping_phone: '9876543210', shipping_address_line1: '1 Test Road', shipping_city: 'Pune', shipping_state: 'Maharashtra', shipping_pincode: '411001' };
const findings = [];
async function reproduce(id, title, check) {
  try {
    const evidence = await check();
    findings.push({ id, title, reproduced: true, evidence });
    console.log(`REPRODUCED ${id}: ${title}\n  ${evidence}`);
  } catch (err) {
    findings.push({ id, title, reproduced: false });
    console.error(`NOT REPRODUCED ${id}: ${err.stack}`);
    process.exitCode = 1;
  }
}

// In-memory row locking and cart state model. Two controllers run concurrently;
// writes are serialized, as they would be by the existing SELECT FOR UPDATE.
function checkoutFixture({ coupon = false } = {}) {
  const state = { stock: 10, orders: [], carts: new Map([[1, true], [2, true]]), used: 0, reads: 0 };
  let lockTail = Promise.resolve();
  pool.getConnection = async () => {
    let unlock;
    const releaseLock = () => { if (unlock) { unlock(); unlock = null; } };
    return {
      beginTransaction: async () => {}, commit: async () => releaseLock(),
      rollback: async () => releaseLock(), release: releaseLock,
      query: async (raw, args) => {
        const sql = cleanSql(raw);
        if (sql.startsWith('SELECT ci.id')) {
          state.reads += 1;
          return [state.carts.get(args[0]) ? [{ id: 1, product_id: 9, name: 'QA Shirt', size: 'M', quantity: 1, price: 2500, stock: state.stock, images: '[]' }] : []];
        }
        if (sql.startsWith('SELECT * FROM coupons')) return [[{ id: 1, code: 'LIMITONE', is_active: 1, discount_type: 'flat', discount_value: 100, min_order_amount: 0, used_count: state.used, usage_limit: 1 }]];
        if (sql.startsWith('SELECT id FROM users')) {
          const previous = lockTail;
          lockTail = new Promise(resolve => { unlock = resolve; });
          await previous;
          return [[{ id: args[0] }]];
        }
        if (sql.startsWith('SELECT id, stock')) return [[{ id: 9, stock: state.stock }]];
        if (sql.startsWith('INSERT INTO orders')) {
          const id = state.orders.length + 1;
          state.orders.push({ id, userId: args[0], total: args[6] });
          return [{ insertId: id }];
        }
        if (sql.startsWith('INSERT INTO order_items')) return [{ affectedRows: 1 }];
        if (sql.startsWith('UPDATE products SET stock')) { state.stock -= args[0]; return [{ affectedRows: 1 }]; }
        if (sql.startsWith('DELETE FROM cart_items')) { state.carts.set(args[0], false); return [{ affectedRows: 1 }]; }
        if (sql.startsWith('UPDATE coupons SET used_count')) { state.used += 1; return [{ affectedRows: 1 }]; }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    };
  };
  state.request = userId => ({ user: { id: userId, name: 'QA', email: 'qa@example.invalid' }, body: { ...shipping, ...(coupon ? { coupon_code: 'LIMITONE' } : {}) } });
  return state;
}

(async () => {
  await reproduce('B02', 'Concurrent COD checkout creates two orders from one cart', async () => {
    const state = checkoutFixture();
    const a = response(), b = response();
    await Promise.all([orders.createOrder(state.request(1), a), orders.createOrder(state.request(1), b)]);
    assert.deepEqual([a.statusCode, b.statusCode], [201, 201]);
    assert.equal(state.orders.length, 2);
    assert.equal(state.stock, 8);
    return 'Two requests both returned 201; one cart item generated two orders and deducted two stock units (10 -> 8).';
  });
  await reproduce('B03', 'Coupon redemption limit can be exceeded by concurrent checkouts', async () => {
    const state = checkoutFixture({ coupon: true });
    const a = response(), b = response();
    await Promise.all([orders.createOrder(state.request(1), a), orders.createOrder(state.request(2), b)]);
    assert.deepEqual([a.statusCode, b.statusCode], [201, 201]);
    assert.equal(state.used, 2);
    assert.deepEqual(state.orders.map(order => order.total), [2400, 2400]);
    return 'A coupon limited to one redemption discounted both orders; used_count became 2.';
  });
  await reproduce('B04', 'Customer login OTP remains valid after repeated wrong guesses', async () => {
    const crypto = require('node:crypto');
    const expected = crypto.createHash('sha256').update('123456').digest('hex');
    let cleared = 0;
    pool.query = async (raw, args) => {
      const sql = cleanSql(raw);
      if (sql.startsWith('SELECT id, name, phone, is_verified')) return [args[1] === expected && !cleared ? [{ id: 1, name: 'QA', is_verified: 1 }] : []];
      if (sql.startsWith('UPDATE users SET verification_code = NULL')) { cleared += 1; return [{}]; }
      throw new Error(`Unexpected SQL: ${sql}`);
    };
    for (let i = 0; i < 20; i += 1) {
      const res = response();
      await auth.verifyLoginCode({ body: { email: 'qa@example.invalid', code: '000000' } }, res);
      assert.equal(res.statusCode, 401);
    }
    assert.equal(cleared, 0);
    const res = response();
    await auth.verifyLoginCode({ body: { email: 'qa@example.invalid', code: '123456' } }, res);
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.token);
    return '20 incorrect attempts neither invalidated the code nor triggered a lockout; the correct code still issued a session.';
  });
  await reproduce('B05', 'Clearing a sale price retains the old discount', async () => {
    let row = { id: 9, name: 'QA Shirt', price: 2500, discount_price: 1800, sizes: '[]', colors: '[]', images: '[]' };
    pool.query = async (raw, args) => {
      const sql = cleanSql(raw);
      if (sql.startsWith('SELECT * FROM products')) return [[{ ...row }]];
      if (sql.startsWith('UPDATE products SET')) { row.discount_price = args[4]; return [{}]; }
      throw new Error(`Unexpected SQL: ${sql}`);
    };
    const res = response();
    await products.updateProduct({ params: { id: 9 }, body: { discount_price: null } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.discount_price, 1800);
    return 'PUT with discount_price:null returned 200 but kept the old 1800 sale price.';
  });
  await reproduce('B06', 'Different sizes can exceed a product\'s shared stock in the cart', async () => {
    let inserted = false;
    pool.query = async raw => {
      const sql = cleanSql(raw);
      if (sql.startsWith('SELECT name, stock')) return [[{ name: 'QA Shirt', stock: 1 }]];
      if (sql.startsWith('SELECT * FROM cart_items')) return [[]];
      if (sql.startsWith('SELECT COALESCE(SUM')) return [[{ totalInCart: '1' }]];
      if (sql.startsWith('INSERT INTO cart_items')) { inserted = true; return [{}]; }
      throw new Error(`Unexpected SQL: ${sql}`);
    };
    const res = response();
    await cart.addToCart({ user: { id: 1 }, body: { product_id: 9, size: 'L', quantity: 1 } }, res);
    assert.equal(res.statusCode, 201);
    assert.ok(inserted);
    assert.match(orders.stockProblem([{ product_id: 9, name: 'QA Shirt', quantity: 1 }, { product_id: 9, name: 'QA Shirt', quantity: 1 }], new Map([[9, 1]])), /Only 1 left/);
    return 'With stock=1 and size M already in the bag, size L was accepted (201); checkout rejects the resulting two-unit cart.';
  });
  await reproduce('B07', 'Cart accepts a size that the product does not offer', async () => {
    let insertedSize;
    pool.query = async (raw, args) => {
      const sql = cleanSql(raw);
      if (sql.startsWith('SELECT name, stock')) return [[{ name: 'QA Shirt', stock: 10, sizes: '["M","L"]' }]];
      if (sql.startsWith('SELECT * FROM cart_items')) return [[]];
      if (sql.startsWith('SELECT COALESCE(SUM')) return [[{ totalInCart: '0' }]];
      if (sql.startsWith('INSERT INTO cart_items')) { insertedSize = args[2]; return [{}]; }
      throw new Error(`Unexpected SQL: ${sql}`);
    };
    const res = response();
    await cart.addToCart({ user: { id: 1 }, body: { product_id: 9, size: 'NOT-A-SIZE', quantity: 1 } }, res);
    assert.equal(res.statusCode, 201);
    assert.equal(insertedSize, 'NOT-A-SIZE');
    return 'A product offering M/L accepted NOT-A-SIZE and inserted that size into the cart.';
  });
  await reproduce('B08', 'Coupon updates accept negative discounts and increase the order total', async () => {
    let coupon = { id: 1, code: 'SAVE100', discount_type: 'flat', discount_value: 100, min_order_amount: 0, is_active: 1, used_count: 0 };
    pool.query = async (raw, args) => {
      const sql = cleanSql(raw);
      if (sql.startsWith('SELECT * FROM coupons WHERE id')) return [[{ ...coupon }]];
      if (sql.startsWith('UPDATE coupons SET')) { coupon.discount_value = args[2]; return [{}]; }
      throw new Error(`Unexpected SQL: ${sql}`);
    };
    const res = response();
    await coupons.updateCoupon({ params: { id: 1 }, body: { discount_value: -100 } }, res);
    assert.equal(res.statusCode, 200);
    const result = coupons.evaluateCoupon(res.body, 2500);
    assert.equal(result.discountAmount, -100);
    return 'PUT discount_value:-100 returned 200; coupon evaluation produced -100 discount, so a 2500 order becomes 2600.';
  });
  console.log(`\n${findings.filter(item => item.reproduced).length}/${findings.length} targeted defects reproduced. No real DB, mail or payment calls were made.`);
})();
