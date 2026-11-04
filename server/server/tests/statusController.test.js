jest.mock('../config/db', () => ({ pool: { query: jest.fn() } }));

const { pool } = require('../config/db');
const { getStatus } = require('../controllers/statusController');

const mockRes = () => {
  const res = {};
  for (const method of ['status', 'set', 'type', 'send']) res[method] = jest.fn().mockReturnValue(res);
  return res;
};
const bodyOf = (res) => JSON.parse(res.send.mock.calls[0][0]);

beforeEach(() => {
  jest.clearAllMocks();
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
  process.env.RAZORPAY_KEY_SECRET = 'super_secret_value';
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
});

it('reports ok with the database, payment mode and uptime', async () => {
  pool.query.mockResolvedValue([[{ 1: 1 }]]);
  const res = mockRes();
  await getStatus({}, res);
  expect(res.status).toHaveBeenCalledWith(200);
  const body = bodyOf(res);
  expect(body).toMatchObject({ name: 'Koorm API', status: 'ok', checks: { database: { status: 'connected' }, payments: { status: 'enabled', mode: 'test', webhooks: 'not_configured' } } });
  expect(typeof body.uptime_seconds).toBe('number');
  expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
});

it('answers 503 when the database is down, without leaking connection details', async () => {
  pool.query.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:3306 user root'));
  const res = mockRes();
  await getStatus({}, res);
  expect(res.status).toHaveBeenCalledWith(503);
  const text = res.send.mock.calls[0][0];
  expect(JSON.parse(text)).toMatchObject({ status: 'degraded', checks: { database: { status: 'unreachable', error: 'Connection failed' } } });
  expect(text).not.toMatch(/10\.0\.0\.5|root|super_secret_value|rzp_test_key/);
});
