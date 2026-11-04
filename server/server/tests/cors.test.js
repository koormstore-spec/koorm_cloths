const { isAllowedOrigin } = require('../config/cors');

afterEach(() => {
  delete process.env.CORS_ORIGINS;
  delete process.env.ALLOW_LOCALHOST_ORIGINS;
});

it('allows the live storefront with and without www', () => {
  expect(isAllowedOrigin('https://koormcollection.com')).toBe(true);
  expect(isAllowedOrigin('https://www.koormcollection.com')).toBe(true);
});

it('allows a local frontend on any port so localhost:5173 works against production', () => {
  expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
  expect(isAllowedOrigin('http://127.0.0.1:5173')).toBe(true);
  expect(isAllowedOrigin('http://localhost:4173')).toBe(true);
});

it('blocks other sites, including look-alikes', () => {
  expect(isAllowedOrigin('https://evil.example')).toBe(false);
  expect(isAllowedOrigin('http://localhost.evil.example')).toBe(false);
  expect(isAllowedOrigin('https://koormcollection.com.evil.example')).toBe(false);
  expect(isAllowedOrigin('http://koormcollection.com')).toBe(false);
});

it('accepts extra origins from CORS_ORIGINS and can turn localhost off', () => {
  process.env.CORS_ORIGINS = 'https://staging.koormcollection.com/, https://preview.example';
  process.env.ALLOW_LOCALHOST_ORIGINS = 'false';
  expect(isAllowedOrigin('https://staging.koormcollection.com')).toBe(true);
  expect(isAllowedOrigin('https://preview.example')).toBe(true);
  expect(isAllowedOrigin('http://localhost:5173')).toBe(false);
});

it('lets requests without an Origin header through (webhooks, curl)', () => {
  expect(isAllowedOrigin(undefined)).toBe(true);
});
