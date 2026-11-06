/* Retest the fixes using real local MySQL TEMPORARY tables, plus isolated
 * concurrent controller requests. Mail and gateway calls are always stubbed.
 * Run: node scripts/qa/verify-current.cjs
 * A nonzero exit reports a regression that still needs fixing.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const serverRoot = path.resolve(__dirname, '../../server/server');
const serverRequire = createRequire(path.join(serverRoot, 'package.json'));
const pool = {};
for (const [relative, exports] of Object.entries({
  './config/db': { pool, adminPool: pool },
  './utils/email': new Proxy({}, { get: () => async () => ({ sent: true }) }),
  './utils/razorpay': { isConfigured: () => false },
  './utils/refunds': { refundOrder: async () => ({}), refundableBalance: () => 0, httpError: (statusCode, message) => Object.assign(new Error(message), { statusCode }) },
  './utils/generateToken': { generateToken: () => 'audit-session' },
})) {
  const id = serverRequire.resolve(relative);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
const orders = serverRequire('./controllers/orderController');
const cart = serverRequire('./controllers/cartController');
const auth = serverRequire('./controllers/authController');
const products = serverRequire('./controllers/productController');
const coupons = serverRequire('./controllers/couponController');
const { restockItems } = serverRequire('./utils/orderLifecycle');
const res = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const shipping = { shipping_name: 'QA', shipping_phone: '9876543210', shipping_address_line1: '1 Test Road', shipping_city: 'Pune', shipping_state: 'Maharashtra', shipping_pincode: '411001' };
const request = (id = 1, extra = {}) => ({ user: { id, name: 'QA', email: `qa${id}@example.invalid` }, body: { ...shipping, ...extra } });
const results = [];
async function check(name, fn) {
  try { const detail = await fn(); results.push({ name, pass: true }); console.log(`PASS ${name}: ${detail}`); }
  catch (err) { results.push({ name, pass: false }); console.error(`FAIL ${name}: ${err.message}`); process.exitCode = 1; }
}

async function mysqlChecks() {
  const env = serverRequire('dotenv').parse(fs.readFileSync(path.join(serverRoot, '.env')));
  const host = env.DB_HOST || 'localhost';
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(host.toLowerCase()), 'Refusing a nonlocal MySQL host');
  const connection = await serverRequire('mysql2/promise').createConnection({ host, port: Number(env.DB_PORT || 3306), user: env.DB_USER || 'root', password: env.DB_PASSWORD || '', database: env.DB_NAME || 'koorm_db', connectTimeout: 5000 });
  try {
    // Only temporary tables shadow the application's table names on this
    // connection. Never run mutations unless every temporary table was created.
    const names = ['users', 'products', 'cart_items', 'coupons', 'orders', 'order_items'];
    const definitions = new Map([...fs.readFileSync(path.join(serverRoot, 'schema.sql'), 'utf8').matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \([\s\S]*?\);/g)].map(match => [match[1], match[0]]));
    for (const name of names) {
      assert.ok(definitions.has(name), `Missing schema definition: ${name}`);
      const sql = definitions.get(name).replace('CREATE TABLE IF NOT EXISTS', 'CREATE TEMPORARY TABLE').replace(/^\s*FOREIGN KEY[^\n]*\n/gm, '').replace(/,\s*\);$/, '\n);');
      await connection.query(sql);
    }
    pool.query = connection.query.bind(connection);
    pool.getConnection = async () => ({ query: pool.query, beginTransaction: connection.beginTransaction.bind(connection), commit: connection.commit.bind(connection), rollback: connection.rollback.bind(connection), release() {} });
    await connection.query("INSERT INTO users (id, name, email, is_verified) VALUES (1, 'QA', 'qa1@example.invalid', 1)");
    await connection.query("INSERT INTO products (id, name, slug, price, discount_price, sizes, images, colors, stock) VALUES (9, 'QA Shirt', 'qa-shirt', 2500, 1800, '[\"M\",\"L\"]', '[]', '[]', 6)");

    await check('B01 restocking', async () => {
      await connection.query("INSERT INTO order_items (order_id, product_id, product_name, size, quantity, price) VALUES (101,9,'QA Shirt','M',1,2500),(101,9,'QA Shirt','L',3,2500)");
      await restockItems(connection, 101);
      const [[row]] = await connection.query('SELECT stock FROM products WHERE id = 9');
      assert.equal(row.stock, 10);
      return 'stock restored from 6 to 10 for M x1 + L x3';
    });
    await check('B04 OTP attempt limit', async () => {
      const hash = crypto.createHash('sha256').update('123456').digest('hex');
      await connection.query('UPDATE users SET verification_code = ?, verification_code_expiry = NOW() + INTERVAL 10 MINUTE, verification_attempts = 0 WHERE id = 1', [hash]);
      const statuses = [];
      for (let i = 0; i < 5; i++) { const output = res(); await auth.verifyLoginCode({ body: { email: 'qa1@example.invalid', code: '000000' } }, output); statuses.push(output.statusCode); }
      assert.deepEqual(statuses, [401, 401, 401, 401, 429]);
      const output = res();
      await auth.verifyLoginCode({ body: { email: 'qa1@example.invalid', code: '123456' } }, output);
      assert.equal(output.statusCode, 401);
      const [[row]] = await connection.query('SELECT verification_code FROM users WHERE id = 1');
      assert.equal(row.verification_code, null);
      return 'fifth incorrect guess returned 429, cleared the code; original correct code was then rejected';
    });
    await check('B05 clear sale price', async () => {
      const output = res();
      await products.updateProduct({ params: { id: 9 }, body: { discount_price: null } }, output);
      assert.equal(output.statusCode, 200, JSON.stringify(output.body));
      const [[row]] = await connection.query('SELECT discount_price, sizes FROM products WHERE id = 9');
      assert.equal(row.discount_price, null);
      assert.deepEqual(row.sizes, ['M', 'L']);
      return 'sale price persisted as NULL; existing sizes preserved';
    });
    await check('B06 aggregate cart stock', async () => {
      await connection.query('UPDATE products SET stock = 1 WHERE id = 9');
      let output = res();
      await cart.addToCart({ user: { id: 1 }, body: { product_id: 9, size: 'M', quantity: 1 } }, output);
      assert.equal(output.statusCode, 201, JSON.stringify(output.body));
      output = res();
      await cart.addToCart({ user: { id: 1 }, body: { product_id: 9, size: 'L', quantity: 1 } }, output);
      assert.equal(output.statusCode, 400);
      assert.match(output.body.message, /Only 1 left/);
      return 'size L rejected when size M already consumed the single available unit';
    });
    await check('B07 reject unsupported add', async () => {
      const output = res();
      await cart.addToCart({ user: { id: 1 }, body: { product_id: 9, size: 'NOT-A-SIZE', quantity: 1 } }, output);
      assert.equal(output.statusCode, 400);
      assert.match(output.body.message, /not available/);
      return 'unsupported size rejected before cart insertion';
    });
    await check('B08 reject negative coupon edit', async () => {
      await connection.query("INSERT INTO coupons (id, code, discount_type, discount_value) VALUES (1, 'SAVE100', 'flat', 100)");
      const output = res();
      await coupons.updateCoupon({ params: { id: 1 }, body: { discount_value: -100 } }, output);
      assert.equal(output.statusCode, 400);
      const [[row]] = await connection.query('SELECT * FROM coupons WHERE id = 1');
      assert.equal(Number(row.discount_value), 100);
      assert.ok(coupons.evaluateCoupon({ ...row, discount_value: -100 }, 2500).error);
      return 'edit rejected; stored discount stayed 100; legacy negative coupon also rejected at evaluation';
    });
    await check('B07 checkout after size removed', async () => {
      // Size M was legitimately added in B06; admin now removes it.
      await connection.query("UPDATE products SET sizes = '[\"L\"]', stock = 10 WHERE id = 9");
      const output = res();
      await orders.createOrder(request(), output);
      const [items] = await connection.query('SELECT size FROM order_items WHERE order_id = ?', [output.body.id || 0]);
      assert.equal(output.statusCode, 400, `expected 400, got ${output.statusCode}; order_id=${output.body.id}; persisted sizes=${items.map(row => row.size).join(',')}`);
      return 'stale cart size rejected at checkout';
    });
  } finally { await connection.end(); }
}

// Simulates separate transactions and per-row FIFO locks. Every acquired lock
// remains held until commit/rollback. Different users use different products
// so coupon contention cannot be accidentally serialized by a product lock.
function concurrencyFixture() {
  const state = { carts: new Map([[1, true], [2, true]]), stock: new Map([[11, 10], [12, 10]]), used: 0, orders: [] };
  const tails = new Map();
  pool.getConnection = async () => {
    const releases = [];
    async function lock(key) {
      const previous = tails.get(key) || Promise.resolve();
      let release;
      tails.set(key, new Promise(resolve => { release = resolve; }));
      await previous;
      releases.push(release);
    }
    const releaseAll = () => { while (releases.length) releases.pop()(); };
    return {
      beginTransaction: async () => {}, commit: async () => releaseAll(), rollback: async () => releaseAll(), release: releaseAll,
      query: async (raw, args) => {
        const sql = raw.replace(/\s+/g, ' ').trim();
        if (sql.startsWith('SELECT id FROM users')) { await lock(`user:${args[0]}`); return [[{ id: args[0] }]]; }
        if (sql.startsWith('SELECT') && sql.includes('FROM cart_items')) {
          if (sql.endsWith('FOR UPDATE')) await lock(`cart:${args[0]}`);
          return [state.carts.get(args[0]) ? [{ id: args[0], product_id: 10 + args[0], size: 'M', quantity: 1 }] : []];
        }
        if (sql.startsWith('SELECT') && sql.includes('FROM products')) {
          for (const id of args[0]) if (sql.endsWith('FOR UPDATE')) await lock(`product:${id}`);
          return [args[0].map(id => ({ id, name: 'QA Shirt', images: '[]', price: 2500, stock: state.stock.get(id) }))];
        }
        if (sql.startsWith('SELECT * FROM coupons')) {
          if (sql.endsWith('FOR UPDATE')) await lock('coupon:1');
          return [[{ id: 1, code: 'LIMITONE', is_active: 1, discount_type: 'flat', discount_value: 100, min_order_amount: 0, usage_limit: 1, used_count: state.used }]];
        }
        if (sql.startsWith('SELECT COUNT(*)')) return [[{ total: 0 }]];
        if (sql.startsWith('INSERT INTO orders')) { const id = state.orders.length + 1; state.orders.push({ id, userId: args[0] }); return [{ insertId: id }]; }
        if (sql.startsWith('INSERT INTO order_items')) return [{}];
        if (sql.startsWith('UPDATE products SET stock')) { state.stock.set(args[1], state.stock.get(args[1]) - args[0]); return [{}]; }
        if (sql.startsWith('DELETE FROM cart_items')) { state.carts.set(args[0], false); return [{}]; }
        if (sql.startsWith('UPDATE coupons SET used_count')) { state.used++; return [{}]; }
        throw new Error(`Unhandled SQL: ${sql}`);
      },
    };
  };
  return state;
}

(async () => {
  await mysqlChecks();
  await check('B02 concurrent COD checkout', async () => {
    const state = concurrencyFixture(), a = res(), b = res();
    await Promise.all([orders.createOrder(request(1), a), orders.createOrder(request(1), b)]);
    assert.deepEqual([a.statusCode, b.statusCode].sort(), [201, 400]);
    assert.equal(state.orders.length, 1);
    assert.equal(state.stock.get(11), 9);
    return 'two overlapping requests produced one order; second returned 400 (empty cart)';
  });
  await check('B03 concurrent coupon redemption', async () => {
    const state = concurrencyFixture(), a = res(), b = res();
    await Promise.all([orders.createOrder(request(1, { coupon_code: 'LIMITONE' }), a), orders.createOrder(request(2, { coupon_code: 'LIMITONE' }), b)]);
    assert.deepEqual([a.statusCode, b.statusCode].sort(), [201, 400]);
    assert.equal(state.used, 1);
    assert.equal(state.orders.length, 1);
    return 'one redemption accepted; second rejected; used_count remained 1';
  });
  console.log(`\nRetest: ${results.filter(row => row.pass).length} passed, ${results.filter(row => !row.pass).length} failed. Temporary-table checks changed no persistent application data.`);
})().catch(err => { console.error(`Audit infrastructure error: ${err.code || err.message}`); process.exitCode = 1; });
