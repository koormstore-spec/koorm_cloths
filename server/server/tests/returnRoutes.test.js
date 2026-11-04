jest.mock('../middleware/auth', () => ({
  protect: (req, res, next) => {
    if (req.headers.authorization !== 'Bearer customer') return res.status(401).json({ message: 'Sign in' });
    req.user = { id: 1 }; next();
  },
  protectAdmin: (req, res, next) => {
    if (req.headers.authorization !== 'Bearer admin') return res.status(401).json({ message: 'Admin required' });
    req.admin = { id: 1 }; next();
  },
}));
jest.mock('../controllers/returnController', () => ({
  createReturnRequest: (req, res) => res.status(201).json({ size: req.body.images?.[0]?.length || 0 }),
  listReturns: (req, res) => res.json([]),
  getPendingReturnCount: (req, res) => res.json({ count: 0 }),
  getReturnImage: (req, res) => res.json({ id: req.params.imageId }),
  updateReturn: (req, res) => res.json({ action: req.body.action }),
}));
const express = require('express');
const router = require('../routes/returnRoutes');
let server;
let base;

beforeAll(async () => {
  const app = express();
  app.use((req, res, next) => { res.set('Connection', 'close'); next(); });
  app.use('/api/returns', router);
  app.use(express.json());
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}/api/returns`;
});
afterAll(async () => { await new Promise(resolve => server.close(resolve)); });

it('accepts authenticated photo payloads larger than the default JSON limit', async () => {
  const response = await fetch(base, { method: 'POST', headers: { Authorization: 'Bearer customer', 'Content-Type': 'application/json' }, body: JSON.stringify({ images: ['x'.repeat(200000)] }) });
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ size: 200000 });
});

it('rejects oversized payloads with a helpful 413 response', async () => {
  const response = await fetch(base, { method: 'POST', headers: { Authorization: 'Bearer customer', 'Content-Type': 'application/json' }, body: JSON.stringify({ images: ['x'.repeat(10 * 1024 * 1024)] }) });
  expect(response.status).toBe(413);
  expect((await response.json()).message).toContain('2 MB');
});

it.each([
  ['', '/4/images/12'],
  ['customer', '/admin/4/images/12'],
  ['', ''],
])('requires the correct credentials (%s) for %s', async (token, path) => {
  const response = await fetch(`${base}${path}`, { method: path ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}` } });
  expect(response.status).toBe(401);
});

it('still parses admin approval updates with the normal JSON limit', async () => {
  const response = await fetch(`${base}/admin/4`, { method: 'PUT', headers: { Authorization: 'Bearer admin', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve' }) });
  expect(await response.json()).toEqual({ action: 'approve' });
});
