// Dummy env vars for tests — keeps tests hermetic and away from real
// credentials in .env (no real DB connection or email ever needs to happen).
process.env.JWT_SECRET = 'test_jwt_secret';
process.env.ADMIN_JWT_SECRET = 'test_admin_jwt_secret';
process.env.EMAIL_USER = 'test@example.com';
process.env.EMAIL_PASS = 'test-pass';
process.env.ADMIN_EMAIL = 'admin-test@example.com';
process.env.CLIENT_URL = 'http://localhost:5173';
