jest.mock('../models', () => ({
  adminModel: {
    findByEmail: jest.fn(),
    findByVerificationCode: jest.fn(),
    updateVerificationCode: jest.fn(),
    createPending: jest.fn(),
    setPassword: jest.fn(),
  },
}));
jest.mock('../utils/email', () => ({
  sendAdminVerificationCodeEmail: jest.fn().mockResolvedValue({ sent: true }),
}));

const bcrypt = require('bcryptjs');
const { adminModel } = require('../models');
const { sendAdminVerificationCodeEmail } = require('../utils/email');
const {
  requestAdminPasswordReset,
  resetAdminPassword,
  requestAdminSetupCode,
} = require('../controllers/adminAuthController');

const EMAIL = 'admin-test@example.com';
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const admin = { id: 1, name: 'Koorm Admin', email: EMAIL, password: 'hashed' };

beforeEach(() => jest.clearAllMocks());

describe('requestAdminPasswordReset', () => {
  it('emails a reset code to the admin address when a password already exists', async () => {
    adminModel.findByEmail.mockResolvedValue(admin);
    const res = mockRes();
    await requestAdminPasswordReset({ body: { email: ` ${EMAIL.toUpperCase()} ` } }, res);
    expect(adminModel.updateVerificationCode).toHaveBeenCalledWith(1, expect.stringMatching(/^[a-f0-9]{64}$/), expect.any(Date));
    expect(sendAdminVerificationCodeEmail).toHaveBeenCalledWith(expect.objectContaining({ email: EMAIL, purpose: 'reset', code: expect.stringMatching(/^\d{6}$/) }));
    expect(res.json).toHaveBeenCalledWith({ message: expect.stringContaining('reset code') });
  });

  it('refuses an address that is not the configured admin email', async () => {
    const res = mockRes();
    await requestAdminPasswordReset({ body: { email: 'someone@else.com' } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(sendAdminVerificationCodeEmail).not.toHaveBeenCalled();
  });

  it('points a not-yet-set-up account to first-time setup instead', async () => {
    adminModel.findByEmail.mockResolvedValue({ ...admin, password: null });
    const res = mockRes();
    await requestAdminPasswordReset({ body: { email: EMAIL } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sendAdminVerificationCodeEmail).not.toHaveBeenCalled();
  });

  it('is still refused by the first-time setup request once a password exists', async () => {
    adminModel.findByEmail.mockResolvedValue(admin);
    const res = mockRes();
    await requestAdminSetupCode({ body: { email: EMAIL } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('resetAdminPassword', () => {
  it('saves a new hashed password for a valid code and signs the admin in', async () => {
    adminModel.findByVerificationCode.mockResolvedValue(admin);
    const res = mockRes();
    await resetAdminPassword({ body: { email: EMAIL, code: '123456', password: 'new-password-1' } }, res);
    const savedHash = adminModel.setPassword.mock.calls[0][1];
    expect(adminModel.setPassword).toHaveBeenCalledWith(1, expect.any(String));
    expect(await bcrypt.compare('new-password-1', savedHash)).toBe(true);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ email: EMAIL, token: expect.any(String) }));
  });

  it('rejects a wrong code without changing the password', async () => {
    adminModel.findByVerificationCode.mockResolvedValue(null);
    const res = mockRes();
    await resetAdminPassword({ body: { email: EMAIL, code: '000000', password: 'new-password-1' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(adminModel.setPassword).not.toHaveBeenCalled();
  });

  it('rejects a password shorter than 8 characters', async () => {
    const res = mockRes();
    await resetAdminPassword({ body: { email: EMAIL, code: '123456', password: 'short' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(adminModel.setPassword).not.toHaveBeenCalled();
  });

  it('cancels the code after 5 wrong guesses', async () => {
    adminModel.findByVerificationCode.mockResolvedValue(null);
    adminModel.findByEmail.mockResolvedValue(admin);
    await requestAdminPasswordReset({ body: { email: EMAIL } }, mockRes()); // a new code starts a fresh count
    adminModel.updateVerificationCode.mockClear();
    let res;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      res = mockRes();
      await resetAdminPassword({ body: { email: EMAIL, code: String(attempt).padStart(6, '0'), password: 'new-password-1' } }, res);
    }
    expect(res.status).toHaveBeenCalledWith(429);
    expect(adminModel.updateVerificationCode).toHaveBeenCalledWith(1, null, null);
    expect(adminModel.setPassword).not.toHaveBeenCalled();
  });
});
