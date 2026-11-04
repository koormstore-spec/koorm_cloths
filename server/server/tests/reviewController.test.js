jest.mock('../config/db', () => ({ pool: { query: jest.fn(), getConnection: jest.fn() } }));
const { pool } = require('../config/db');
const { getReviews, addReview, deleteReview, adminDeleteReview, adminReplyToReview } = require('../controllers/reviewController');
const response = () => ({ json: jest.fn(), status: jest.fn().mockReturnThis() });
const row = { id: 8, product_id: 2, rating: 4, comment: 'Comfortable shirt', created_at: '2026-09-30', user_name: 'Test Customer', product_name: 'Linen shirt', product_slug: 'linen-shirt', images: '["/shirt.jpg"]' };
let connection;
beforeEach(() => {
  jest.resetAllMocks();
  connection = { beginTransaction: jest.fn(), query: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn() };
  pool.getConnection.mockResolvedValue(connection);
});

test('lists persisted reviews with pagination, a product image and abbreviated reviewer names', async () => {
  pool.query.mockResolvedValueOnce([[row]]).mockResolvedValueOnce([[{ total: 7 }]]);
  const res = response();
  await getReviews({ query: { page: '2', limit: '6' } }, res);
  expect(pool.query.mock.calls[0][1]).toEqual([6, 6]);
  expect(res.json).toHaveBeenCalledWith({ reviews: [expect.objectContaining({ id: 8, user_name: 'Test C.', product_image: '/shirt.jpg' })], page: 2, pages: 2, total: 7 });
  expect(res.json.mock.calls[0][0].reviews[0]).not.toHaveProperty('images');
});

test.each([{ page: '-1' }, { limit: '1000' }, { page: '1.5' }, { page: 'abc' }])('rejects invalid pagination %p', async query => {
  const res = response();
  await getReviews({ query }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(pool.query).not.toHaveBeenCalled();
});

test.each([{ rating: 0 }, { rating: 6 }, { rating: 3.5 }, { rating: '5' }, { product_id: -2 }, { comment: {} }, { comment: 'a'.repeat(1001) }])('rejects invalid input before writing %p', async invalid => {
  const res = response();
  await addReview({ body: { product_id: 2, rating: 4, comment: 'Nice fit', ...invalid }, user: { id: 3 } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(pool.getConnection).not.toHaveBeenCalled();
});

test('rejects a review from a user who never ordered the product, without opening a transaction', async () => {
  pool.query.mockResolvedValueOnce([[]]); // hasPurchasedProduct -> no matching order item
  const res = response();
  await addReview({ body: { product_id: 2, rating: 4, comment: 'Nice fit' }, user: { id: 3 } }, res);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(res.json).toHaveBeenCalledWith({ message: 'You can only review products you have ordered.' });
  expect(pool.getConnection).not.toHaveBeenCalled();
});

test('upserts the signed-in customer review and commits the updated product rating atomically', async () => {
  pool.query.mockResolvedValueOnce([[{ id: 55 }]]); // hasPurchasedProduct -> ordered
  connection.query.mockResolvedValueOnce([[{ id: 2 }]]).mockResolvedValueOnce([{ affectedRows: 1 }])
    .mockResolvedValueOnce([[{ avgRating: 4.5, count: 2 }]]).mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([[row]]);
  const res = response();
  await addReview({ body: { product_id: 2, rating: 4, comment: '  Comfortable shirt  ', user_id: 999 }, user: { id: 3 } }, res);
  expect(connection.query.mock.calls[1][0]).toContain('ON DUPLICATE KEY UPDATE');
  expect(connection.query.mock.calls[1][1]).toEqual([2, 3, 4, 'Comfortable shirt']);
  expect(connection.query.mock.calls[3][1]).toEqual(['4.5', 2, 2]);
  expect(connection.commit).toHaveBeenCalledTimes(1);
  expect(connection.rollback).not.toHaveBeenCalled();
  expect(connection.release).toHaveBeenCalledTimes(1);
  expect(res.json).toHaveBeenCalledWith({ message: 'Review submitted', review: expect.objectContaining({ id: 8, user_name: 'Test C.' }) });
});

test('rejects a missing product and releases the transaction', async () => {
  pool.query.mockResolvedValueOnce([[{ id: 55 }]]); // hasPurchasedProduct -> ordered
  connection.query.mockResolvedValueOnce([[]]);
  const res = response();
  await addReview({ body: { product_id: 2, rating: 4 }, user: { id: 3 } }, res);
  expect(res.status).toHaveBeenCalledWith(404);
  expect(connection.rollback).toHaveBeenCalled();
  expect(connection.commit).not.toHaveBeenCalled();
  expect(connection.release).toHaveBeenCalled();
});

test('rolls back a database failure without claiming the review was saved', async () => {
  pool.query.mockResolvedValueOnce([[{ id: 55 }]]); // hasPurchasedProduct -> ordered
  connection.query.mockResolvedValueOnce([[{ id: 2 }]]).mockRejectedValueOnce(new Error('database offline'));
  const res = response();
  await addReview({ body: { product_id: 2, rating: 4 }, user: { id: 3 } }, res);
  expect(res.status).toHaveBeenCalledWith(500);
  expect(connection.rollback).toHaveBeenCalled();
  expect(connection.commit).not.toHaveBeenCalled();
  expect(connection.release).toHaveBeenCalled();
});

describe('deleteReview (self-service — only the review\'s own author)', () => {
  test('refuses to delete a review belonging to someone else', async () => {
    pool.query.mockResolvedValueOnce([[]]); // WHERE id = ? AND user_id = ? finds nothing for a foreign review
    const res = response();
    await deleteReview({ params: { id: 8 }, user: { id: 999 } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('deletes the caller\'s own review and recomputes the product rating', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 8, product_id: 2 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ avgRating: 4.2, count: 3 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = response();
    await deleteReview({ params: { id: 8 }, user: { id: 3 } }, res);
    expect(res.json).toHaveBeenCalledWith({ message: 'Review deleted' });
    expect(pool.query.mock.calls[3][1]).toEqual(['4.2', 3, 2]);
  });
});

describe('adminDeleteReview (admin moderation — any customer\'s review)', () => {
  test('deletes a review belonging to a different customer, unlike the self-service route', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 8, product_id: 2, user_id: 3 }]]) // no user_id filter in the lookup
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ avgRating: 0, count: 0 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = response();
    await adminDeleteReview({ params: { id: 8 } }, res); // no req.user at all — the admin isn't the author
    expect(pool.query.mock.calls[0]).toEqual(['SELECT * FROM reviews WHERE id = ?', [8]]);
    expect(res.json).toHaveBeenCalledWith({ message: 'Review deleted' });
    expect(pool.query.mock.calls[3][1]).toEqual([0, 0, 2]);
  });

  test('reports a review that no longer exists', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const res = response();
    await adminDeleteReview({ params: { id: 999 } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('adminReplyToReview (admin moderation — a public reply, visible to everyone)', () => {
  test('rejects a non-string reply', async () => {
    const res = response();
    await adminReplyToReview({ params: { id: 8 }, body: { reply: 42 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('rejects a reply longer than 1,000 characters', async () => {
    const res = response();
    await adminReplyToReview({ params: { id: 8 }, body: { reply: 'a'.repeat(1001) } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('reports a review that does not exist', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const res = response();
    await adminReplyToReview({ params: { id: 999 }, body: { reply: 'Thanks for the feedback!' } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('posts a reply and returns the updated review with it included', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 8 }]]) // existence check
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE
      .mockResolvedValueOnce([[{ ...row, admin_reply: 'Thanks for the feedback!' }]]); // re-select
    const res = response();
    await adminReplyToReview({ params: { id: 8 }, body: { reply: '  Thanks for the feedback!  ' } }, res);
    expect(pool.query.mock.calls[1][1][0]).toBe('Thanks for the feedback!'); // trimmed
    expect(pool.query.mock.calls[1][1][2]).toBe(8);
    expect(res.json).toHaveBeenCalledWith({ message: 'Reply posted', review: expect.objectContaining({ admin_reply: 'Thanks for the feedback!' }) });
  });

  test('clears an existing reply when sent an empty string', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 8 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ ...row, admin_reply: null }]]);
    const res = response();
    await adminReplyToReview({ params: { id: 8 }, body: { reply: '   ' } }, res);
    expect(pool.query.mock.calls[1][1]).toEqual([null, null, 8]);
    expect(res.json).toHaveBeenCalledWith({ message: 'Reply removed', review: expect.objectContaining({ admin_reply: null }) });
  });
});
