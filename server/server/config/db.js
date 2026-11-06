const mysql = require('mysql2/promise');
require('dotenv').config();

const basePoolConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
};

const databaseName = process.env.DB_NAME || 'koorm_db';

// Shared database: users, products, orders, cart, wishlist, reviews, and admins.
const pool = mysql.createPool({
  ...basePoolConfig,
  database: databaseName,
});

// Admin queries use the same database connection as customer queries.
const adminPool = pool;

const testConnection = async () => {
  try {
    const conn = await pool.getConnection();
    console.log(`MySQL connected successfully (${databaseName})`);
    conn.release();

    console.log(`MySQL connected successfully (shared ${databaseName})`);
  } catch (err) {
    console.error('MySQL connection failed:', err.message);
    process.exit(1);
  }
};

module.exports = { pool, adminPool, testConnection };
