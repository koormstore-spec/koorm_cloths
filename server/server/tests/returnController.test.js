jest.mock('../config/db', () => ({ pool: { query: jest.fn(), getConnection: jest.fn() } }));
jest.mock('../utils/email', () => ({
  sendReturnUpdateToCustomer: jest.fn().mockResolvedValue({}),
  sendReturnRequestToAdmin: jest.fn().mockResolvedValue({}),
}));
jest.mock('../utils/refunds', () => ({
  refundOrder: jest.fn(),
  refundableBalance: (order) => Number(order.total_amount) - Number(order.refunded_amount || 0),
}));
jest.mock('../utils/orderLifecycle', () => ({ restockItems: jest.fn() }));

const { pool } = require('../config/db');
const { refundOrder } = require('../utils/refunds');
const { restockItems } = require('../utils/orderLifecycle');
const { sendReturnRequestToAdmin } = require('../utils/email');
const { createReturnRequest, updateReturn, getPendingReturnCount, getReturnImage, listReturns } = require('../controllers/returnController');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const user = { id: 1, name: 'Jane', email: 'jane@example.com' };
const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const delivered = { id: 8, user_id: 1, order_number: 'KRM8', status: 'delivered', delivered_at: daysAgo(3), total_amount: 1400, refunded_amount: 0 };
const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

beforeEach(() => {
  jest.clearAllMocks();
  pool.getConnection.mockResolvedValue({
    query: pool.query, beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
  });
});

describe('createReturnRequest', () => {
  const request = (body) => ({ user, body: { order_id: 8, reason: 'Size or fit issue', ...body } });

  it.each(['return', 'exchange'])('requires damage photos for a %s even when the client bypasses validation', async request_type => {
    const res = mockRes();
    await createReturnRequest(request({ reason: 'Damaged or defective', request_type, exchange_details: 'Size M' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Upload at least one photo showing the damaged or defective clothing.' });
    expect(pool.getConnection).not.toHaveBeenCalled();
    expect(sendReturnRequestToAdmin).not.toHaveBeenCalled();
  });

  it.each(['return', 'exchange'])('stores a damaged %s and its evidence together before notifying admin', async request_type => {
    pool.query.mockResolvedValueOnce([[delivered]]).mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ insertId: 4 }]).mockResolvedValueOnce([{ insertId: 12 }]).mockResolvedValue([[]]);
    const res = mockRes();
    await createReturnRequest(request({ reason: 'Damaged or defective', request_type, exchange_details: 'Size M', images: [photo] }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(pool.query.mock.calls[3][1]).toEqual([4, 'image/png', Buffer.from(photo.split(',')[1], 'base64')]);
    expect(sendReturnRequestToAdmin).toHaveBeenCalledWith(expect.objectContaining({ image_count: 1 }));
    const connection = await pool.getConnection.mock.results[0].value;
    expect(connection.commit).toHaveBeenCalled();
  });

  it('rolls back the request when storing the evidence fails', async () => {
    pool.query.mockResolvedValueOnce([[delivered]]).mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ insertId: 4 }]).mockRejectedValueOnce(new Error('Unable to save photo'));
    const res = mockRes();
    await createReturnRequest(request({ reason: 'Damaged or defective', images: [photo] }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    const connection = await pool.getConnection.mock.results[0].value;
    expect(connection.rollback).toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(sendReturnRequestToAdmin).not.toHaveBeenCalled();
  });

  it('opens a return for a delivered order within 30 days and tells the admin', async () => {
    pool.query
      .mockResolvedValueOnce([[delivered]])
      .mockResolvedValueOnce([[]]) // no open return
      .mockResolvedValueOnce([{ insertId: 4 }])
      .mockResolvedValue([[]]);
    const res = mockRes();

    await createReturnRequest(request({ note: 'Too tight' }), res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(pool.query.mock.calls[2][1]).toEqual([8, 1, 'Size or fit issue', 'Too tight', 'return', null]);
    expect(sendReturnRequestToAdmin).toHaveBeenCalledWith(expect.objectContaining({ order_number: 'KRM8', reason: 'Size or fit issue' }));
  });

  it.each([
    ['not delivered yet', { ...delivered, status: 'shipped' }, 'once the order has been delivered'],
    ['past the 30-day window', { ...delivered, delivered_at: daysAgo(31) }, 'return window for this order has closed'],
    ['already fully refunded', { ...delivered, refunded_amount: 1400 }, 'already been refunded'],
  ])('refuses an order that is %s', async (_, order, message) => {
    pool.query.mockResolvedValueOnce([[order]]);
    const res = mockRes();
    await createReturnRequest(request(), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toContain(message);
  });

  it('refuses a second return while one is in progress', async () => {
    pool.query.mockResolvedValueOnce([[delivered]]).mockResolvedValueOnce([[{ id: 3 }]]);
    const res = mockRes();
    await createReturnRequest(request(), res);
    expect(res.json).toHaveBeenCalledWith({ message: 'A return or exchange for this order is already in progress.' });
  });

  it.each(['return', 'exchange'])('uses delivery rather than purchase date for the %s window', async request_type => {
    pool.query.mockResolvedValueOnce([[{ ...delivered, created_at: daysAgo(60), delivered_at: daysAgo(29) }]])
      .mockResolvedValueOnce([[]]).mockResolvedValueOnce([{ insertId: 10 }]).mockResolvedValue([[]]);
    const res = mockRes();
    await createReturnRequest(request({ request_type, exchange_details: 'Size L' }), res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it.each([null, 'invalid', daysAgo(-1)])('requires a valid recorded delivery date (%s)', async delivered_at => {
    pool.query.mockResolvedValueOnce([[{ ...delivered, created_at: daysAgo(2), delivered_at }]]);
    const res = mockRes();
    await createReturnRequest(request({ request_type: 'exchange', exchange_details: 'Size L' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toContain('confirm the delivery date');
    expect(sendReturnRequestToAdmin).not.toHaveBeenCalled();
  });

  it.each([['return', 30, 201], ['exchange', 30, 201], ['return', 30.001, 400], ['exchange', 30.001, 400]])('enforces the %s deadline at %s days', async (request_type, age, statusCode) => {
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    try {
      pool.query.mockResolvedValueOnce([[{ ...delivered, delivered_at: new Date(now - age * 86400000) }]])
        .mockResolvedValueOnce([[]]).mockResolvedValueOnce([{ insertId: 10 }]).mockResolvedValue([[]]);
      const res = mockRes();
      await createReturnRequest(request({ request_type, exchange_details: 'Size L' }), res);
      expect(res.status).toHaveBeenCalledWith(statusCode);
    } finally {
      clock.mockRestore();
      pool.query.mockReset();
    }
  });

  it('requires one of the listed reasons', async () => {
    const res = mockRes();
    await createReturnRequest(request({ reason: 'whatever' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("can't open a return on someone else's order", async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const res = mockRes();
    await createReturnRequest(request(), res);
    expect(pool.query.mock.calls[0][1]).toEqual([8, 1]);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('saves an exchange as pending approval and notifies the admin with replacement details', async () => {
    pool.query.mockResolvedValueOnce([[delivered]]).mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ insertId: 9 }]).mockResolvedValue([[]]);
    const res = mockRes();
    await createReturnRequest(request({ request_type: 'exchange', exchange_details: 'Same shirt in size L' }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ request_type: 'exchange', status: 'requested' }));
    expect(pool.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(pool.query.mock.calls[2][1]).toEqual([8, 1, 'Size or fit issue', null, 'exchange', 'Same shirt in size L']);
    expect(sendReturnRequestToAdmin).toHaveBeenCalledWith(expect.objectContaining({ request_type: 'exchange', exchange_details: 'Same shirt in size L' }));
    expect(refundOrder).not.toHaveBeenCalled();
    expect(restockItems).not.toHaveBeenCalled();
  });

  it.each([
    { request_type: 'invalid' },
    { request_type: 'exchange', exchange_details: '  ' },
    { request_type: 'exchange', exchange_details: 'x'.repeat(1001) },
  ])('validates request type and replacement details before creating a request', async body => {
    const res = mockRes();
    await createReturnRequest(request(body), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('private clothing photos', () => {
  it('returns 404 when a customer asks for another customer’s photo', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const res = mockRes();
    await getReturnImage({ user, params: { id: '4', imageId: '12' } }, res);
    expect(pool.query.mock.calls[0][0]).toContain('AND rr.user_id = ?');
    expect(pool.query.mock.calls[0][1]).toEqual(['12', '4', 1]);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it.each(['user', 'admin'])('serves the image privately to the authorized %s', async role => {
    const bytes = Buffer.from(photo.split(',')[1], 'base64');
    pool.query.mockResolvedValueOnce([[{ content_type: 'image/png', image_data: bytes }]]);
    const res = { ...mockRes(), set: jest.fn(), send: jest.fn() };
    await getReturnImage({ [role]: { id: 1 }, params: { id: '4', imageId: '12' } }, res);
    expect(res.set).toHaveBeenCalledWith(expect.objectContaining({ 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }));
    expect(res.send).toHaveBeenCalledWith(bytes);
  });

  it('includes photo identifiers in the admin request list', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 4, order_id: 8 }]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ id: 12 }]]);
    const res = mockRes();
    await listReturns({}, res);
    expect(res.json).toHaveBeenCalledWith([{ id: 4, order_id: 8, items: [], images: [{ id: 12 }] }]);
  });
});

describe('updateReturn (admin)', () => {
  const connectionFor = (returnRequest) => ({
    beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
    query: jest.fn(async (sql) => (sql.startsWith('SELECT') ? [returnRequest ? [returnRequest] : []] : [{}])),
  });
  const returnRequest = { id: 4, order_id: 8, reason: 'Size or fit issue', status: 'received' };

  beforeEach(() => pool.query.mockResolvedValue([[]]));

  it('refunds a received return and marks it refunded', async () => {
    const connection = connectionFor(returnRequest);
    pool.getConnection.mockResolvedValue(connection);
    refundOrder.mockResolvedValue({ amount: 1400 });
    const res = mockRes();

    await updateReturn({ params: { id: 4 }, body: { action: 'refund' } }, res);

    expect(connection.query.mock.calls[1][1]).toEqual(['refunded', null, 4]);
    expect(refundOrder).toHaveBeenCalledWith(expect.objectContaining({ orderId: 8, returnRequestId: 4, reason: 'Return: Size or fit issue', initiatedBy: 'admin' }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'refunded' }));
  });

  it('puts the return back to its previous status if the refund fails', async () => {
    pool.getConnection.mockResolvedValue(connectionFor(returnRequest));
    refundOrder.mockRejectedValue(Object.assign(new Error('Add the bank or UPI reference of the refund you sent.'), { statusCode: 400 }));
    const res = mockRes();

    await updateReturn({ params: { id: 4 }, body: { action: 'refund' } }, res);

    expect(pool.query).toHaveBeenCalledWith('UPDATE return_requests SET status = ? WHERE id = ?', ['received', 4]);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('can restock the items when the return arrives', async () => {
    const connection = connectionFor({ ...returnRequest, status: 'approved' });
    pool.getConnection.mockResolvedValue(connection);
    await updateReturn({ params: { id: 4 }, body: { action: 'receive', restock: true } }, mockRes());
    expect(restockItems).toHaveBeenCalledWith(connection, 8);
  });

  it('refuses an action that does not fit the current status (no double refunds)', async () => {
    const connection = connectionFor({ ...returnRequest, status: 'refunded' });
    pool.getConnection.mockResolvedValue(connection);
    const res = mockRes();
    await updateReturn({ params: { id: 4 }, body: { action: 'refund' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(refundOrder).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalled();
  });

  it.each(['return', 'exchange'])('requires admin approval before receiving a %s', async requestType => {
    const connection = connectionFor({ ...returnRequest, request_type: requestType, status: 'requested' });
    pool.getConnection.mockResolvedValue(connection);
    const res = mockRes();
    await updateReturn({ params: { id: 4 }, body: { action: 'receive', restock: true } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(restockItems).not.toHaveBeenCalled();
  });

  it.each(['approve', 'reject'])('allows the admin to %s an exchange', async action => {
    const connection = connectionFor({ ...returnRequest, request_type: 'exchange', status: 'requested' });
    pool.getConnection.mockResolvedValue(connection);
    const res = mockRes();
    await updateReturn({ params: { id: 4 }, body: { action } }, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: action === 'approve' ? 'approved' : 'rejected' }));
    expect(refundOrder).not.toHaveBeenCalled();
  });

  it('completes an exchange after the items are received without issuing a refund', async () => {
    pool.getConnection.mockResolvedValue(connectionFor({ ...returnRequest, request_type: 'exchange' }));
    const res = mockRes();
    await updateReturn({ params: { id: 4 }, body: { action: 'exchange' } }, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'exchanged' }));
    expect(refundOrder).not.toHaveBeenCalled();
  });

  it.each([
    ['exchange', 'requested', 'exchange'],
    ['exchange', 'received', 'refund'],
    ['return', 'received', 'exchange'],
  ])('rejects %s in %s when action is %s', async (request_type, status, action) => {
    pool.getConnection.mockResolvedValue(connectionFor({ ...returnRequest, request_type, status }));
    const res = mockRes();
    await updateReturn({ params: { id: 4 }, body: { action } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(refundOrder).not.toHaveBeenCalled();
  });
});

it('counts only requests awaiting approval across returns and exchanges', async () => {
  pool.query.mockResolvedValueOnce([[{ count: '3' }]]);
  const res = mockRes();
  await getPendingReturnCount({}, res);
  expect(pool.query).toHaveBeenCalledWith("SELECT COUNT(*) AS count FROM return_requests WHERE status = 'requested'");
  expect(res.json).toHaveBeenCalledWith({ count: 3 });
});
