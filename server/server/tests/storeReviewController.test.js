jest.mock('../config/db', () => ({ pool: { query: jest.fn(), getConnection: jest.fn() } }));
jest.mock('../utils/logger', () => ({ logError: jest.fn() }));
const { pool } = require('../config/db');
const { logError } = require('../utils/logger');
const { getStoreReviews, addStoreReview, deleteStoreReview, adminReplyToStoreReview } = require('../controllers/storeReviewController');
const response = () => ({ json: jest.fn(), status: jest.fn().mockReturnThis() });
const review = { id: 1, rating: 5, comment: 'Great experience', user_name: 'Test Customer' };
let connection;
beforeEach(() => {
  jest.resetAllMocks();
  connection = {
    query: jest.fn(), beginTransaction: jest.fn(), commit: jest.fn(),
    rollback: jest.fn(), release: jest.fn(),
  };
  pool.getConnection.mockResolvedValue(connection);
});

test('saves a general review without a product and uses the signed-in customer', async () => {
  connection.query.mockResolvedValueOnce([{ affectedRows: 1, insertId: 1 }]).mockResolvedValueOnce([[review]]);
  const res = response();
  await addStoreReview({ body: { rating: 5, comment: ' Great experience ', user_id: 999 }, user: { id: 3 } }, res);
  expect(connection.query.mock.calls[0][1]).toEqual([3, 5, 'Great experience']);
  expect(connection.query.mock.calls[0][0]).not.toContain('UPDATE');
  expect(connection.query.mock.calls[1][1]).toEqual([1]);
  expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
  expect(connection.commit).toHaveBeenCalledTimes(1);
  expect(connection.rollback).not.toHaveBeenCalled();
  expect(connection.release).toHaveBeenCalledTimes(1);
  expect(res.status).toHaveBeenCalledWith(201);
  expect(res.json).toHaveBeenCalledWith({ message: 'Review submitted', review: { ...review, user_name: 'Test C.' } });
});

test.each([{ rating: 0 }, { rating: 2.5 }, { rating: 6 }, { comment: '  ' }, { comment: {} }, { comment: 'a'.repeat(1001) }])('rejects invalid review %p', async invalid => {
  const res = response();
  await addStoreReview({ body: { rating: 5, comment: 'Great experience', ...invalid }, user: { id: 3 } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(pool.query).not.toHaveBeenCalled();
  expect(pool.getConnection).not.toHaveBeenCalled();
});

test('returns saved reviews with pagination and abbreviated names', async () => {
  pool.query.mockResolvedValueOnce([[review]]).mockResolvedValueOnce([[{ total: 7 }]]);
  const res = response();
  await getStoreReviews({ query: { page: 2, limit: 6 } }, res);
  expect(pool.query.mock.calls[0][1]).toEqual([6, 6]);
  expect(res.json).toHaveBeenCalledWith({ reviews: [{ ...review, user_name: 'Test C.' }], page: 2, pages: 2, total: 7 });
});

test('reports a save failure without claiming success', async () => {
  pool.getConnection.mockRejectedValue(new Error('offline'));
  const res = response();
  await addStoreReview({ body: { rating: 5, comment: 'Great experience' }, user: { id: 3 } }, res);
  expect(res.status).toHaveBeenCalledWith(500);
  expect(connection.commit).not.toHaveBeenCalled();
});

test('rolls back the insert if reading the saved review fails', async () => {
  const error = new Error('Unknown column admin_reply');
  connection.query.mockResolvedValueOnce([{ insertId: 1 }]).mockRejectedValueOnce(error);
  const req = { body: { rating: 2, comment: 'good' }, user: { id: 3 } };
  const res = response();
  await addStoreReview(req, res);
  expect(connection.rollback).toHaveBeenCalledTimes(1);
  expect(connection.commit).not.toHaveBeenCalled();
  expect(connection.release).toHaveBeenCalledTimes(1);
  expect(logError).toHaveBeenCalledWith(error, req, { source: 'addStoreReview' });
  expect(res.status).toHaveBeenCalledWith(500);
  expect(res.json).toHaveBeenCalledWith({ message: 'Could not save your review. Please try again.' });
});

test('returns a save error and releases the connection even if rollback fails', async () => {
  connection.query.mockRejectedValueOnce(new Error('Connection lost'));
  connection.rollback.mockRejectedValueOnce(new Error('Rollback failed'));
  const res = response();
  await addStoreReview({ body: { rating: 2, comment: 'good' }, user: { id: 3 } }, res);
  expect(connection.release).toHaveBeenCalledTimes(1);
  expect(res.status).toHaveBeenCalledWith(500);
});

describe('deleteStoreReview (admin-only — no customer route ever calls this)', () => {
  test('deletes the review by id, with no author restriction', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = response();
    await deleteStoreReview({ params: { id: 1 } }, res); // no req.user — admins aren't review authors
    expect(pool.query).toHaveBeenCalledWith('DELETE FROM store_reviews WHERE id = ?', [1]);
    expect(res.json).toHaveBeenCalledWith({ message: 'Review deleted' });
  });

  test('reports a review that no longer exists', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
    const res = response();
    await deleteStoreReview({ params: { id: 999 } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('adminReplyToStoreReview (admin moderation — a public reply, visible to everyone)', () => {
  test('rejects a non-string reply', async () => {
    const res = response();
    await adminReplyToStoreReview({ params: { id: 1 }, body: { reply: null } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('rejects a reply longer than 1,000 characters', async () => {
    const res = response();
    await adminReplyToStoreReview({ params: { id: 1 }, body: { reply: 'a'.repeat(1001) } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('reports a review that does not exist', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const res = response();
    await adminReplyToStoreReview({ params: { id: 999 }, body: { reply: 'Thank you!' } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('posts a trimmed reply and returns the updated review with it included', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 1 }]]) // existence check
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE
      .mockResolvedValueOnce([[{ ...review, admin_reply: 'Thank you!' }]]); // re-select
    const res = response();
    await adminReplyToStoreReview({ params: { id: 1 }, body: { reply: '  Thank you!  ' } }, res);
    expect(pool.query.mock.calls[1][1][0]).toBe('Thank you!');
    expect(pool.query.mock.calls[1][1][2]).toBe(1);
    expect(res.json).toHaveBeenCalledWith({ message: 'Reply posted', review: expect.objectContaining({ admin_reply: 'Thank you!' }) });
  });

  test('clears an existing reply when sent an empty string', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 1 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ ...review, admin_reply: null }]]);
    const res = response();
    await adminReplyToStoreReview({ params: { id: 1 }, body: { reply: '' } }, res);
    expect(pool.query.mock.calls[1][1]).toEqual([null, null, 1]);
    expect(res.json).toHaveBeenCalledWith({ message: 'Reply removed', review: expect.objectContaining({ admin_reply: null }) });
  });
});
