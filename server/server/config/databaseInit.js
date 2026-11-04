const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const databaseName = process.env.DB_NAME || 'koorm_db';
const quotedDatabaseName = `\`${databaseName.replace(/`/g, '``')}\``;

const connectionConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '@#123punjaBB',
  port: process.env.DB_PORT || 3306,
  multipleStatements: true,
};

const readSql = (fileName) => fs.readFileSync(path.join(__dirname, '..', fileName), 'utf8');

const schemaDefinitions = () => {
  const schema = readSql('schema.sql');
  return schema.split('-- SEED DATA')[0].replace(/^.*?USE koorm_db;\s*/s, '');
};

const addColumnIfMissing = async (connection, tableName, columnName, definition) => {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS columnCount
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [tableName, columnName]
  );

  if (rows[0].columnCount === 0) {
    await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
  }
};

const dropColumnIfPresent = async (connection, tableName, columnName) => {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS columnCount
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [tableName, columnName]
  );

  if (rows[0].columnCount > 0) {
    await connection.query(`ALTER TABLE \`${tableName}\` DROP COLUMN \`${columnName}\``);
  }
};

const initializeDatabase = async () => {
  const connection = await mysql.createConnection(connectionConfig);

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS ${quotedDatabaseName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await connection.query(`USE ${quotedDatabaseName}`);
    await connection.query(schemaDefinitions());
    await connection.query(`INSERT IGNORE INTO coupons
      (code, discount_type, discount_value, min_order_amount, is_active)
      VALUES ('FIRST30', 'percent', 30, 0, 1)`);
    // Keep existing reviews while allowing each submission to create its own card.
    const [reviewIndexes] = await connection.query('SHOW INDEX FROM store_reviews');
    if (reviewIndexes.some(index => index.Key_name === 'user_id' && Number(index.Non_unique) === 0)) {
      await connection.query('ALTER TABLE store_reviews ADD INDEX store_review_user (user_id), DROP INDEX user_id');
    }
    await connection.query(readSql('admin_schema.sql').replace(/^.*?USE koorm_db;\s*/s, ''));

    await addColumnIfMissing(connection, 'users', 'is_verified', 'TINYINT(1) NOT NULL DEFAULT 0');
    await addColumnIfMissing(connection, 'users', 'verification_code', 'VARCHAR(255) NULL');
    await addColumnIfMissing(connection, 'users', 'verification_code_expiry', 'DATETIME NULL');
    await addColumnIfMissing(connection, 'orders', 'coupon_code', 'VARCHAR(40) NULL');
    await addColumnIfMissing(connection, 'orders', 'discount_amount', 'DECIMAL(10,2) NOT NULL DEFAULT 0');
    // Online payments: existing orders are all cash on delivery.
    await connection.query("ALTER TABLE orders MODIFY COLUMN status ENUM('pending_payment','placed','processing','shipped','delivered','cancelled') NOT NULL DEFAULT 'placed'");
    await addColumnIfMissing(connection, 'orders', 'payment_status', "ENUM('cod','pending','paid','failed','partially_refunded','refunded') NOT NULL DEFAULT 'cod'");
    await addColumnIfMissing(connection, 'orders', 'razorpay_order_id', 'VARCHAR(64) NULL');
    await addColumnIfMissing(connection, 'orders', 'razorpay_payment_id', 'VARCHAR(64) NULL');
    await addColumnIfMissing(connection, 'orders', 'paid_at', 'DATETIME NULL');
    // Snapshot of how the customer paid (method, UPI ID, card last 4, bank...), for the admin panel.
    await addColumnIfMissing(connection, 'orders', 'payment_details', 'TEXT NULL');
    await addColumnIfMissing(connection, 'orders', 'refunded_amount', 'DECIMAL(10,2) NOT NULL DEFAULT 0');
    await addColumnIfMissing(connection, 'orders', 'delivered_at', 'DATETIME NULL');
    await addColumnIfMissing(connection, 'orders', 'cancellation_status', "ENUM('none','requested','approved') NOT NULL DEFAULT 'none'");
    await addColumnIfMissing(connection, 'orders', 'cancellation_requested_at', 'DATETIME NULL');
    await addColumnIfMissing(connection, 'return_requests', 'request_type', "ENUM('return','exchange') NOT NULL DEFAULT 'return'");
    await addColumnIfMissing(connection, 'return_requests', 'exchange_details', 'VARCHAR(1000) NULL');
    await connection.query("ALTER TABLE return_requests MODIFY COLUMN status ENUM('requested','approved','rejected','received','refunded','exchanged') NOT NULL DEFAULT 'requested'");
    await addColumnIfMissing(connection, 'admins', 'verification_code', 'VARCHAR(64) NULL');
    await addColumnIfMissing(connection, 'admins', 'verification_code_expiry', 'DATETIME NULL');

    // CREATE TABLE IF NOT EXISTS does not upgrade existing review tables.
    // Review reads (including the response after saving) require these columns.
    for (const table of ['reviews', 'store_reviews']) {
      await addColumnIfMissing(connection, table, 'admin_reply', 'TEXT NULL');
      await addColumnIfMissing(connection, table, 'admin_reply_at', 'TIMESTAMP NULL');
    }

    await dropColumnIfPresent(connection, 'users', 'password');
    await dropColumnIfPresent(connection, 'users', 'reset_token');
    await dropColumnIfPresent(connection, 'users', 'reset_token_expiry');

    await connection.query('ALTER TABLE admins MODIFY COLUMN password VARCHAR(255) NULL');
    console.log(`Database structure ready (${databaseName})`);
  } finally {
    await connection.end();
  }
};

module.exports = { initializeDatabase };
