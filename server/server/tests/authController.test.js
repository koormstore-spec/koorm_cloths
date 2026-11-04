jest.mock('../config/db', () => ({
  pool: { query: jest.fn() },
}));
jest.mock('../utils/email', () => ({
  sendWelcomeEmail: jest.fn().mockResolvedValue({ sent: true }),
  sendVerificationCodeEmail: jest.fn().mockResolvedValue({ sent: true }),
}));

const { pool } = require('../config/db');
const { sendWelcomeEmail, sendVerificationCodeEmail } = require('../utils/email');
const {
  register,
  verifyEmail,
  resendVerificationCode,
  requestLoginCode,
  verifyLoginCode,
} = require('../controllers/authController');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('register', () => {
  it('rejects when required fields are missing', async () => {
    const req = { body: { email: 'a@b.com' } };
    const res = mockRes();

    await register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects when the email already belongs to a verified account', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 1, is_verified: 1 }]]);
    const req = { body: { name: 'Jane', email: 'jane@example.com' } };
    const res = mockRes();

    await register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'An account with this email already exists' });
  });

  it('reuses an unverified account from a prior attempt and resends a code', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 1, is_verified: 0 }]]) // existing unverified lookup
      .mockResolvedValueOnce([{}]) // UPDATE name/phone
      .mockResolvedValueOnce([{}]); // UPDATE verification_code
    const req = { body: { name: 'Jane', email: 'jane@example.com', phone: '9998887777' } };
    const res = mockRes();

    await register(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(sendVerificationCodeEmail).toHaveBeenCalledTimes(1);
  });

  it('creates the user and emails a verification code', async () => {
    pool.query
      .mockResolvedValueOnce([[]]) // no existing user
      .mockResolvedValueOnce([{ insertId: 10 }]) // insert result
      .mockResolvedValueOnce([{}]); // UPDATE users SET verification_code...
    const req = { body: { name: 'Jane', email: 'jane@example.com', phone: '9998887777' } };
    const res = mockRes();

    await register(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toMatchObject({ email: 'jane@example.com' });
    expect(payload.token).toBeUndefined();

    expect(sendWelcomeEmail).not.toHaveBeenCalled();
    expect(sendVerificationCodeEmail).toHaveBeenCalledTimes(1);
    const verificationArg = sendVerificationCodeEmail.mock.calls[0][0];
    expect(verificationArg.email).toBe('jane@example.com');
    expect(verificationArg.code).toMatch(/^\d{6}$/);
  });
});

describe('verifyEmail', () => {
  it('rejects when email or code is missing', async () => {
    const req = { body: { email: 'jane@example.com' } };
    const res = mockRes();

    await verifyEmail(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects an invalid or expired code', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const req = { body: { email: 'jane@example.com', code: '000000' } };
    const res = mockRes();

    await verifyEmail(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid or expired verification code' });
  });

  it('rejects re-verifying an already-verified account', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 1, is_verified: 1 }]]);
    const req = { body: { email: 'jane@example.com', code: '123456' } };
    const res = mockRes();

    await verifyEmail(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'This account is already verified' });
  });

  it('marks the account verified, clears the code, and returns a login token', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 1, name: 'Jane', phone: '999', is_verified: 0 }]]) // code lookup
      .mockResolvedValueOnce([{}]); // UPDATE is_verified = 1
    const req = { body: { email: 'jane@example.com', code: '123456' } };
    const res = mockRes();

    await verifyEmail(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload).toMatchObject({ id: 1, name: 'Jane', email: 'jane@example.com', phone: '999' });
    expect(payload.token).toEqual(expect.any(String));

    const updateCall = pool.query.mock.calls[1];
    expect(updateCall[0]).toContain('is_verified = 1');
    expect(updateCall[1]).toEqual([1]);

    expect(sendWelcomeEmail).toHaveBeenCalledWith({ name: 'Jane', email: 'jane@example.com' });
  });
});

describe('resendVerificationCode', () => {
  it('returns 404 for an email with no account', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const req = { body: { email: 'nobody@example.com' } };
    const res = mockRes();

    await resendVerificationCode(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('refuses to resend a code for an already-verified account', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 1, name: 'Jane', is_verified: 1 }]]);
    const req = { body: { email: 'jane@example.com' } };
    const res = mockRes();

    await resendVerificationCode(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'This account is already verified' });
    expect(sendVerificationCodeEmail).not.toHaveBeenCalled();
  });

  it('issues a fresh code and emails it for an unverified account', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 1, name: 'Jane', is_verified: 0 }]])
      .mockResolvedValueOnce([{}]); // UPDATE verification_code
    const req = { body: { email: 'jane@example.com' } };
    const res = mockRes();

    await resendVerificationCode(req, res);

    expect(res.json).toHaveBeenCalledWith({
      message: 'A new verification code has been sent to your email.',
    });
    expect(sendVerificationCodeEmail).toHaveBeenCalledTimes(1);
    const arg = sendVerificationCodeEmail.mock.calls[0][0];
    expect(arg.email).toBe('jane@example.com');
    expect(arg.code).toMatch(/^\d{6}$/);
  });
});

describe('requestLoginCode', () => {
  it('rejects an unknown email', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const req = { body: { email: 'nobody@example.com' } };
    const res = mockRes();

    await requestLoginCode(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(sendVerificationCodeEmail).not.toHaveBeenCalled();
  });

  it('rejects an unverified account', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 1, name: 'Jane', is_verified: 0 }]]);
    const req = { body: { email: 'jane@example.com' } };
    const res = mockRes();

    await requestLoginCode(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(sendVerificationCodeEmail).not.toHaveBeenCalled();
  });

  it('emails a login code to a verified account', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 1, name: 'Jane', is_verified: 1 }]])
      .mockResolvedValueOnce([{}]); // UPDATE verification_code
    const req = { body: { email: 'jane@example.com' } };
    const res = mockRes();

    await requestLoginCode(req, res);

    expect(res.json).toHaveBeenCalledWith({ message: 'A login code has been sent to your email.' });
    expect(sendVerificationCodeEmail).toHaveBeenCalledTimes(1);
  });
});

describe('verifyLoginCode', () => {
  it('rejects an invalid or expired code', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const req = { body: { email: 'jane@example.com', code: '000000' } };
    const res = mockRes();

    await verifyLoginCode(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid or expired code' });
  });

  it('returns a token for a matching, unexpired code', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 1, name: 'Jane', phone: '999' }]]) // code lookup
      .mockResolvedValueOnce([{}]); // UPDATE clears code
    const req = { body: { email: 'jane@example.com', code: '123456' } };
    const res = mockRes();

    await verifyLoginCode(req, res);

    expect(res.status).not.toHaveBeenCalledWith(401);
    const payload = res.json.mock.calls[0][0];
    expect(payload.id).toBe(1);
    expect(payload.token).toEqual(expect.any(String));
  });
});
