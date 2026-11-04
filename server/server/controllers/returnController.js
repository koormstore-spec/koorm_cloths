const { pool } = require('../config/db');
const { sendReturnUpdateToCustomer, sendReturnRequestToAdmin } = require('../utils/email');
const { refundOrder, refundableBalance } = require('../utils/refunds');
const { restockItems } = require('../utils/orderLifecycle');
const { validateReturnImages } = require('../utils/returnImages');

const RETURN_WINDOW_DAYS = 30;
const RETURN_REASONS = ['Size or fit issue', 'Damaged or defective', 'Received the wrong item', 'Not as described', 'Changed my mind', 'Other'];
const OPEN_STATUSES = ['requested', 'approved', 'received'];
const DAY_MS = 24 * 60 * 60 * 1000;

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

const notifyCustomer = async (requestId) => {
  try {
    const [[request]] = await pool.query(
      `SELECT rr.status, rr.request_type, rr.admin_note, o.order_number, u.name AS customer_name, u.email AS customer_email
       FROM return_requests rr JOIN orders o ON rr.order_id = o.id JOIN users u ON rr.user_id = u.id
       WHERE rr.id = ?`,
      [requestId]
    );
    if (request) {
      await sendReturnUpdateToCustomer({ ...request, customerName: request.customer_name, customerEmail: request.customer_email });
    }
  } catch (err) {
    console.error('Return email dispatch failed:', err.message);
  }
};

// ---- Customer ----
const createReturnRequest = async (req, res) => {
  let connection;
  try {
    const orderId = Number(req.body.order_id);
    const requestType = req.body.request_type ?? 'return';
    const exchangeDetails = String(req.body.exchange_details || '').trim();
    const reason = String(req.body.reason || '').trim();
    const note = String(req.body.note || '').trim();
    if (!Number.isInteger(orderId) || orderId <= 0) throw httpError(400, 'Choose a valid order.');
    if (!['return', 'exchange'].includes(requestType)) throw httpError(400, 'Choose return or exchange.');
    if (requestType === 'exchange' && (!exchangeDetails || exchangeDetails.length > 1000)) {
      throw httpError(400, 'Describe the replacement you want in 1 to 1,000 characters.');
    }
    if (!RETURN_REASONS.includes(reason)) return res.status(400).json({ message: 'Choose a reason for the request.' });
    if (note.length > 1000) return res.status(400).json({ message: 'Keep the note under 1,000 characters.' });
    const images = validateReturnImages(req.body.images, reason);

    connection = await pool.getConnection();
    await connection.beginTransaction();
    // Serialize submissions for this order so two clicks cannot create two requests.
    const [[order]] = await connection.query('SELECT * FROM orders WHERE id = ? AND user_id = ? FOR UPDATE', [orderId, req.user.id]);
    if (!order) throw httpError(404, 'Order not found');
    if (order.status !== 'delivered') throw httpError(400, 'You can request a return or exchange once the order has been delivered.');
    const deliveredAt = order.delivered_at ? new Date(order.delivered_at).getTime() : NaN;
    const now = Date.now();
    if (!Number.isFinite(deliveredAt) || deliveredAt > now) {
      throw httpError(400, 'Please contact support to confirm the delivery date before requesting a return or exchange.');
    }
    if (now - deliveredAt > RETURN_WINDOW_DAYS * DAY_MS) {
      throw httpError(400, `The ${RETURN_WINDOW_DAYS}-day return window for this order has closed. Exchanges must also be requested within this window.`);
    }
    if (refundableBalance(order) <= 0) throw httpError(400, 'This order has already been refunded.');
    const [open] = await connection.query(
      `SELECT id FROM return_requests WHERE order_id = ? AND status IN (${OPEN_STATUSES.map(() => '?').join(', ')})`,
      [orderId, ...OPEN_STATUSES]
    );
    if (open.length) throw httpError(400, 'A return or exchange for this order is already in progress.');

    const [result] = await connection.query(
      'INSERT INTO return_requests (order_id, user_id, reason, note, request_type, exchange_details) VALUES (?, ?, ?, ?, ?, ?)',
      [orderId, req.user.id, reason, note || null, requestType, requestType === 'exchange' ? exchangeDetails : null]
    );
    for (const image of images) {
      await connection.query('INSERT INTO return_request_images (return_request_id, content_type, image_data) VALUES (?, ?, ?)', [result.insertId, image.contentType, image.data]);
    }
    await connection.commit();
    res.status(201).json({ id: result.insertId, order_id: orderId, request_type: requestType, exchange_details: requestType === 'exchange' ? exchangeDetails : null, reason, note: note || null, status: 'requested' });

    notifyCustomer(result.insertId);
    sendReturnRequestToAdmin({
      order_number: order.order_number, customerName: req.user.name, customerEmail: req.user.email, reason, note,
      request_type: requestType, exchange_details: requestType === 'exchange' ? exchangeDetails : null,
      image_count: images.length,
    }).catch((err) => console.error('Return request email dispatch failed:', err.message));
  } catch (err) {
    if (connection) await connection.rollback();
    res.status(err.statusCode || 500).json({ message: err.message });
  } finally {
    if (connection) connection.release();
  }
};

// ---- Admin ----
const getPendingReturnCount = async (req, res) => {
  try {
    const [[result]] = await pool.query("SELECT COUNT(*) AS count FROM return_requests WHERE status = 'requested'");
    res.json({ count: Number(result.count) || 0 });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const listReturns = async (req, res) => {
  try {
    const [requests] = await pool.query(
      `SELECT rr.*, o.order_number, o.total_amount, o.refunded_amount, o.payment_method, o.payment_status,
              o.delivered_at, u.name AS customer_name, u.email AS customer_email
       FROM return_requests rr JOIN orders o ON rr.order_id = o.id JOIN users u ON rr.user_id = u.id
       ORDER BY FIELD(rr.status, 'requested', 'approved', 'received', 'refunded', 'exchanged', 'rejected'), rr.created_at DESC`
    );
    for (const request of requests) {
      const [items] = await pool.query('SELECT product_name, size, quantity, price FROM order_items WHERE order_id = ?', [request.order_id]);
      request.items = items;
      const [images] = await pool.query('SELECT id FROM return_request_images WHERE return_request_id = ? ORDER BY id', [request.id]);
      request.images = images;
    }
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getReturnImage = async (req, res) => {
  try {
    const params = [req.params.imageId, req.params.id];
    if (!req.admin) params.push(req.user.id);
    const [[image]] = await pool.query(
      `SELECT ri.content_type, ri.image_data FROM return_request_images ri
       JOIN return_requests rr ON rr.id = ri.return_request_id
       WHERE ri.id = ? AND rr.id = ?${req.admin ? '' : ' AND rr.user_id = ?'}`, params
    );
    if (!image) return res.status(404).json({ message: 'Photo not found' });
    res.set({ 'Content-Type': image.content_type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    res.send(image.image_data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Which statuses each admin action may move a request from, and to.
const TRANSITIONS = {
  approve: { from: ['requested'], to: 'approved' },
  reject: { from: ['requested', 'approved'], to: 'rejected' },
  receive: { from: ['approved'], to: 'received' },
  refund: { from: ['approved', 'received'], to: 'refunded' },
  exchange: { from: ['received'], to: 'exchanged' },
};

// Moves the request to its next status under a row lock, so a double click
// can't refund twice. Returns the request as it was before the change.
const transitionRequest = async (id, action, adminNote, { restock = false } = {}) => {
  const transition = TRANSITIONS[action];
  if (!Object.hasOwn(TRANSITIONS, action)) throw httpError(400, 'Unknown action');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[request]] = await connection.query('SELECT * FROM return_requests WHERE id = ? FOR UPDATE', [id]);
    if (!request) throw httpError(404, 'Return request not found');
    if (action === 'refund' && request.request_type === 'exchange') throw httpError(400, 'Exchange requests cannot be refunded.');
    if (action === 'exchange' && request.request_type !== 'exchange') throw httpError(400, 'Only exchange requests can be marked exchanged.');
    if (!transition.from.includes(request.status)) throw httpError(400, `This return is already ${request.status}.`);
    await connection.query('UPDATE return_requests SET status = ?, admin_note = COALESCE(?, admin_note) WHERE id = ?', [
      transition.to, adminNote || null, id,
    ]);
    if (restock) await restockItems(connection, request.order_id);
    await connection.commit();
    return request;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

const updateReturn = async (req, res) => {
  try {
    const { action } = req.body;
    const adminNote = String(req.body.admin_note || '').trim().slice(0, 1000);
    const request = await transitionRequest(req.params.id, action, adminNote, { restock: action === 'receive' && Boolean(req.body.restock) });

    let refund = null;
    if (action === 'refund') {
      const amount = req.body.amount === undefined || req.body.amount === '' ? undefined : Number(req.body.amount);
      try {
        if (amount !== undefined && !Number.isFinite(amount)) throw httpError(400, 'Enter a valid refund amount.');
        refund = await refundOrder({
          orderId: request.order_id,
          amount,
          reason: `Return: ${request.reason}`,
          reference: req.body.reference,
          returnRequestId: request.id,
          initiatedBy: 'admin',
        });
      } catch (err) {
        // Put the request back so the admin can try the refund again.
        await pool.query('UPDATE return_requests SET status = ? WHERE id = ?', [request.status, request.id]);
        throw err;
      }
    }

    res.json({ message: 'Return updated', status: TRANSITIONS[action].to, refund });
    notifyCustomer(request.id);
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

module.exports = { createReturnRequest, listReturns, getPendingReturnCount, getReturnImage, updateReturn, RETURN_REASONS, RETURN_WINDOW_DAYS };
