const jwt = require('jsonwebtoken');

jest.mock('../config/db', () => ({
  pool: { query: jest.fn() },
  adminPool: { query: jest.fn() },
}));

const { pool, adminPool } = require('../config/db');
const { protect, attachUser, protectAdmin } = require('../middleware/auth');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('protect (customer auth)', () => {
  it('rejects a request with no Authorization header', async () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    await protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Not authorized, no token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a malformed/invalid token', async () => {
    const req = { headers: { authorization: 'Bearer not-a-real-token' } };
    const res = mockRes();
    const next = jest.fn();

    await protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a token signed with the ADMIN secret (cross-secret should fail)', async () => {
    const adminSignedToken = jwt.sign({ id: 1 }, process.env.ADMIN_JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${adminSignedToken}` } };
    const res = mockRes();
    const next = jest.fn();

    await protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a valid token when the user no longer exists', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const token = jwt.sign({ id: 99 }, process.env.JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    await protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Not authorized, user not found' });
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches req.user and calls next() for a valid token', async () => {
    const user = { id: 5, name: 'Jane', email: 'jane@example.com', phone: '9990001111' };
    pool.query.mockResolvedValueOnce([[user]]);
    const token = jwt.sign({ id: 5 }, process.env.JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    await protect(req, res, next);

    expect(req.user).toEqual(user);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('attachUser (optional auth — never rejects the request)', () => {
  it('calls next() with no req.user when there is no Authorization header', async () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    await attachUser(req, res, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next() with no req.user for an invalid token, instead of rejecting', async () => {
    const req = { headers: { authorization: 'Bearer not-a-real-token' } };
    const res = mockRes();
    const next = jest.fn();

    await attachUser(req, res, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next() with no req.user when the token is valid but the user no longer exists', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const token = jwt.sign({ id: 99 }, process.env.JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    await attachUser(req, res, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('attaches req.user and calls next() for a valid token', async () => {
    const user = { id: 5, name: 'Jane', email: 'jane@example.com', phone: '9990001111' };
    pool.query.mockResolvedValueOnce([[user]]);
    const token = jwt.sign({ id: 5 }, process.env.JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    await attachUser(req, res, next);

    expect(req.user).toEqual(user);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('protectAdmin (admin auth — separate token flow from protect)', () => {
  it('rejects a request with no Authorization header', async () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    await protectAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Not authorized, no admin token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a token signed with the CUSTOMER secret (cross-secret should fail)', async () => {
    const customerSignedToken = jwt.sign({ id: 1 }, process.env.JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${customerSignedToken}` } };
    const res = mockRes();
    const next = jest.fn();

    await protectAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(adminPool.query).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a valid admin token when no matching admin row exists', async () => {
    adminPool.query.mockResolvedValueOnce([[]]);
    const token = jwt.sign({ id: 3 }, process.env.ADMIN_JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    await protectAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Not authorized, admin not found' });
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches req.admin and calls next() for a valid admin token', async () => {
    const admin = { id: 1, name: 'Koorm Admin', email: 'admin@koorm.com' };
    adminPool.query.mockResolvedValueOnce([[admin]]);
    const token = jwt.sign({ id: 1 }, process.env.ADMIN_JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    await protectAdmin(req, res, next);

    expect(req.admin).toEqual(admin);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('queries only the admin database, never the customer pool', async () => {
    const admin = { id: 1, name: 'Koorm Admin', email: 'admin@koorm.com' };
    adminPool.query.mockResolvedValueOnce([[admin]]);
    const token = jwt.sign({ id: 1 }, process.env.ADMIN_JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    await protectAdmin(req, res, next);

    expect(pool.query).not.toHaveBeenCalled();
  });
});
