/* Uses only connection-scoped TEMPORARY tables on the configured LOCAL MySQL.
 * No persistent application rows or schema are changed; closing the connection
 * removes the temporary tables. Run: node scripts/qa/reproduce-restock.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const serverRoot = path.resolve(__dirname, '../../server/server');
const serverRequire = createRequire(path.join(serverRoot, 'package.json'));
const env = serverRequire('dotenv').parse(fs.readFileSync(path.join(serverRoot, '.env')));
const host = env.DB_HOST || 'localhost';
if (!['localhost', '127.0.0.1', '::1'].includes(host.toLowerCase())) {
  console.error('SKIPPED: configured MySQL host is not local.');
  process.exitCode = 2;
} else {
  // Stub external dependencies before loading the real restockItems function.
  for (const [relative, exports] of Object.entries({ './config/db': { pool: {} }, './utils/email': {}, './utils/refunds': {} })) {
    const id = serverRequire.resolve(relative);
    require.cache[id] = { id, filename: id, loaded: true, exports };
  }
  const { restockItems } = serverRequire('./utils/orderLifecycle');
  (async () => {
    let connection;
    try {
      connection = await serverRequire('mysql2/promise').createConnection({
        host, port: Number(env.DB_PORT || 3306), user: env.DB_USER || 'root',
        password: env.DB_PASSWORD || '', database: env.DB_NAME || 'koorm_db', connectTimeout: 5000,
      });
      await connection.query('CREATE TEMPORARY TABLE products (id INT PRIMARY KEY, stock INT NOT NULL)');
      await connection.query('CREATE TEMPORARY TABLE order_items (id INT PRIMARY KEY, order_id INT, product_id INT, size VARCHAR(20), quantity INT)');
      await connection.query('INSERT INTO products VALUES (9, 6)');
      await connection.query("INSERT INTO order_items VALUES (1, 101, 9, 'M', 1), (2, 101, 9, 'L', 3)");
      await restockItems(connection, 101);
      const [[row]] = await connection.query('SELECT stock FROM products WHERE id = 9');
      assert.ok([7, 9].includes(row.stock), `Bug no longer reproduced: actual=${row.stock}`);
      console.log(`REPRODUCED B01: Restocking sizes M x1 and L x3 of the same product should restore stock 6 -> 10; actual stock=${row.stock}.`);
      console.log('Executed the real restockItems SQL on local MySQL, using temporary tables only.');
    } finally {
      if (connection) await connection.end();
    }
  })().catch(err => { console.error(`Restock reproduction failed: ${err.code || err.message}`); process.exitCode = 1; });
}
