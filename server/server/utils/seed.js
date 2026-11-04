// Creates a default admin account in the separate admin database. Run with: npm run seed
require('dotenv').config();
const { adminPool } = require('../config/db');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'koormstore@gmail.com').split(',')[0].trim();

(async () => {
  try {
    const [existing] = await adminPool.query('SELECT id FROM admins WHERE email = ?', [ADMIN_EMAIL]);
    if (existing.length > 0) {
      console.log('Admin account already exists:', ADMIN_EMAIL);
      process.exit(0);
    }
    await adminPool.query(
      'INSERT INTO admins (name, email, password) VALUES (?, ?, NULL)',
      ['Koorm Admin', ADMIN_EMAIL]
    );
    console.log(`Admin email provisioned in shared ${process.env.DB_NAME || 'koorm_db'}. Complete setup from /admin/login:`);
    console.log('  email:', ADMIN_EMAIL);
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
})();
