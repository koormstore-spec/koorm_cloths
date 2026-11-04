const jwt = require('jsonwebtoken');
const { generateToken, generateAdminToken } = require('../utils/generateToken');

describe('generateToken', () => {
  it('produces a JWT that carries the given user id and verifies with JWT_SECRET', () => {
    const token = generateToken(42);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    expect(decoded.id).toBe(42);
  });

  it('sets an expiry roughly 30 days out', () => {
    const token = generateToken(1);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const days = (decoded.exp - decoded.iat) / (60 * 60 * 24);
    expect(days).toBeCloseTo(30, 0);
  });

  it('does NOT verify against the admin secret (customer/admin token isolation)', () => {
    const token = generateToken(1);
    expect(() => jwt.verify(token, process.env.ADMIN_JWT_SECRET)).toThrow();
  });
});

describe('generateAdminToken', () => {
  it('produces a JWT that carries the given admin id and verifies with ADMIN_JWT_SECRET', () => {
    const token = generateAdminToken(7);
    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    expect(decoded.id).toBe(7);
  });

  it('sets an expiry roughly 7 days out', () => {
    const token = generateAdminToken(1);
    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    const days = (decoded.exp - decoded.iat) / (60 * 60 * 24);
    expect(days).toBeCloseTo(7, 0);
  });

  it('does NOT verify against the customer secret (customer/admin token isolation)', () => {
    const token = generateAdminToken(1);
    expect(() => jwt.verify(token, process.env.JWT_SECRET)).toThrow();
  });
});
