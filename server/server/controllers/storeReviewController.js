const { pool } = require('../config/db');
const { logError } = require('../utils/logger');

const selectReviews = `SELECT r.id, r.rating, r.comment, r.admin_reply, r.admin_reply_at, r.created_at,
  u.name AS user_name FROM store_reviews r JOIN users u ON u.id = r.user_id`;

const MAX_REPLY_LENGTH = 1000;
const publicReview = review => {
  const names = String(review.user_name || 'Customer').trim().split(/\s+/);
  return { ...review, user_name: names[0] + (names.length > 1 ? ` ${names[names.length - 1][0]}.` : '') };
};

const getStoreReviews = async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 6);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 24) {
    return res.status(400).json({ message: 'Invalid review pagination' });
  }
  try {
    const [rows] = await pool.query(`${selectReviews} ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`, [limit, (page - 1) * limit]);
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM store_reviews');
    res.json({ reviews: rows.map(publicReview), page, pages: Math.ceil(total / limit), total });
  } catch (err) {
    logError(err, req, { source: 'getStoreReviews' });
    res.status(500).json({ message: 'Could not load reviews. Please try again.' });
  }
};

const addStoreReview = async (req, res) => {
  const { rating, comment } = req.body;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'Choose a whole-number rating from 1 to 5.' });
  }
  if (typeof comment !== 'string' || !comment.trim() || comment.trim().length > 1000) {
    return res.status(400).json({ message: 'Write a review of 1 to 1,000 characters.' });
  }
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [result] = await connection.query('INSERT INTO store_reviews (user_id, rating, comment) VALUES (?, ?, ?)', [req.user.id, rating, comment.trim()]);
    const [[review]] = await connection.query(`${selectReviews} WHERE r.id = ?`, [result.insertId]);
    const savedReview = publicReview(review);
    await connection.commit();
    res.status(201).json({ message: 'Review submitted', review: savedReview });
  } catch (err) {
    if (connection) {
      try { await connection.rollback(); }
      catch (rollbackError) { logError(rollbackError, req, { source: 'addStoreReviewRollback' }); }
    }
    logError(err, req, { source: 'addStoreReview' });
    res.status(500).json({ message: 'Could not save your review. Please try again.' });
  } finally {
    if (connection) connection.release();
  }
};

// Admin-only moderation: no customer-facing route ever calls this — a
// customer cannot delete even their own store review, let alone someone
// else's.
const deleteStoreReview = async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM store_reviews WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Review not found' });
    }
    res.json({ message: 'Review deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Admin moderation: posts (or clears) a public reply under a customer's
// store review — visible to every homepage visitor. No customer-facing
// route can ever call this.
const adminReplyToStoreReview = async (req, res) => {
  try {
    const { reply } = req.body;
    if (typeof reply !== 'string') {
      return res.status(400).json({ message: 'Reply must be text.' });
    }
    const trimmed = reply.trim();
    if (trimmed.length > MAX_REPLY_LENGTH) {
      return res.status(400).json({ message: `Reply must be no more than ${MAX_REPLY_LENGTH} characters.` });
    }

    const [existing] = await pool.query('SELECT id FROM store_reviews WHERE id = ?', [req.params.id]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Review not found' });
    }

    await pool.query('UPDATE store_reviews SET admin_reply = ?, admin_reply_at = ? WHERE id = ?', [
      trimmed || null,
      trimmed ? new Date() : null,
      req.params.id,
    ]);

    const [[review]] = await pool.query(`${selectReviews} WHERE r.id = ?`, [req.params.id]);
    res.json({ message: trimmed ? 'Reply posted' : 'Reply removed', review: publicReview(review) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getStoreReviews, addStoreReview, deleteStoreReview, adminReplyToStoreReview };
