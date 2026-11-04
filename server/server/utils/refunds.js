const { pool } = require('../config/db');
const { createGatewayRefund } = require('./razorpay');
const { sendRefundInitiatedToCustomer } = require('./email');

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const roundMoney = (value) => Math.round(Number(value) * 100) / 100;
const formatRupees = (value) => `₹${roundMoney(value).toLocaleString('en-IN')}`;

const refundableBalance = (order) => roundMoney(Number(order.total_amount) - Number(order.refunded_amount || 0));

const paymentStatusAfterRefund = (order, refundedAmount) => {
  if (refundedAmount >= Number(order.total_amount) - 0.001) return 'refunded';
  if (refundedAmount > 0) return 'partially_refunded';
  return order.payment_method === 'ONLINE' ? 'paid' : 'cod';
};

// Online orders are refunded through Razorpay to the original payment method.
// Cash-on-delivery orders have nothing to refund online, so the admin records
// the bank/UPI transfer they made (with its reference) once the money was
// actually collected, i.e. after delivery.
const checkRefundable = (order, method) => {
  if (method === 'razorpay') {
    if (!order.razorpay_payment_id || !['paid', 'partially_refunded'].includes(order.payment_status)) {
      throw httpError(400, 'This order has no online payment to refund.');
    }
  } else if (order.payment_method !== 'COD' || order.status !== 'delivered') {
    throw httpError(400, 'Manual refunds are for delivered cash-on-delivery orders.');
  }
};

// Step 1, in a transaction: lock the order, check the amount, and count it as
// refunded straight away. Two refund requests at once therefore can't both
// pass the balance check.
const reserveRefund = async ({ orderId, amount, reason, reference, returnRequestId, initiatedBy }) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[order]] = await connection.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    if (!order) throw httpError(404, 'Order not found');

    const method = order.payment_method === 'ONLINE' ? 'razorpay' : 'manual';
    checkRefundable(order, method);
    if (method === 'manual' && !String(reference || '').trim()) {
      throw httpError(400, 'Add the bank or UPI reference of the refund you sent.');
    }

    const balance = refundableBalance(order);
    const refundAmount = roundMoney(amount ?? balance);
    if (!(refundAmount > 0)) throw httpError(400, 'Enter a refund amount greater than zero.');
    if (refundAmount > balance) {
      throw httpError(400, balance > 0 ? `You can refund at most ${formatRupees(balance)} on this order.` : 'This order has already been fully refunded.');
    }

    const refundedAmount = roundMoney(Number(order.refunded_amount || 0) + refundAmount);
    await connection.query('UPDATE orders SET refunded_amount = ?, payment_status = ? WHERE id = ?', [
      refundedAmount, paymentStatusAfterRefund(order, refundedAmount), orderId,
    ]);
    const [result] = await connection.query(
      `INSERT INTO refunds (order_id, return_request_id, amount, reason, method, reference, status, initiated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderId, returnRequestId || null, refundAmount, reason || null, method, String(reference || '').trim() || null,
        method === 'manual' ? 'processed' : 'pending', initiatedBy]
    );
    await connection.commit();
    return { order, method, refundId: result.insertId, amount: refundAmount };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

// Puts the amount back when Razorpay refuses or later fails a refund.
const releaseRefund = async (refundId) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[refund]] = await connection.query('SELECT * FROM refunds WHERE id = ? FOR UPDATE', [refundId]);
    if (!refund || refund.status === 'failed') {
      await connection.rollback();
      return;
    }
    const [[order]] = await connection.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [refund.order_id]);
    const refundedAmount = Math.max(0, roundMoney(Number(order.refunded_amount) - Number(refund.amount)));
    await connection.query('UPDATE orders SET refunded_amount = ?, payment_status = ? WHERE id = ?', [
      refundedAmount, paymentStatusAfterRefund(order, refundedAmount), order.id,
    ]);
    await connection.query("UPDATE refunds SET status = 'failed' WHERE id = ?", [refundId]);
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

const notifyCustomer = async (order, refund) => {
  try {
    const [[customer]] = await pool.query('SELECT name, email FROM users WHERE id = ?', [order.user_id]);
    if (!customer) return;
    await sendRefundInitiatedToCustomer({
      customerName: customer.name,
      customerEmail: customer.email,
      order_number: order.order_number,
      ...refund,
    });
  } catch (err) {
    console.error('Refund email dispatch failed:', err.message);
  }
};

// Refunds an order (amount defaults to everything not yet refunded). Online
// orders go back to the original payment; COD orders need `reference`.
const refundOrder = async ({ orderId, amount, reason, reference, returnRequestId = null, initiatedBy }) => {
  const reserved = await reserveRefund({ orderId, amount, reason, reference, returnRequestId, initiatedBy });
  const { order, method, refundId } = reserved;
  let status = 'processed';

  if (method === 'razorpay') {
    try {
      const gatewayRefund = await createGatewayRefund(order.razorpay_payment_id, reserved.amount, {
        order_number: order.order_number,
        reason: String(reason || '').slice(0, 250),
      });
      status = gatewayRefund.status === 'processed' ? 'processed' : 'pending';
      await pool.query('UPDATE refunds SET razorpay_refund_id = ?, status = ? WHERE id = ?', [gatewayRefund.id, status, refundId]);
    } catch (err) {
      await releaseRefund(refundId);
      throw err;
    }
  }

  const refund = { id: refundId, amount: reserved.amount, method, status, reason, reference: reference || null };
  notifyCustomer(order, refund);
  return refund;
};

// Razorpay reports the final outcome of a refund through webhooks.
const applyRefundWebhook = async (event, refundEntity) => {
  const [[refund]] = await pool.query('SELECT id, status FROM refunds WHERE razorpay_refund_id = ?', [refundEntity?.id]);
  if (!refund) return;
  if (event === 'refund.processed' && refund.status !== 'processed') {
    await pool.query("UPDATE refunds SET status = 'processed' WHERE id = ?", [refund.id]);
  } else if (event === 'refund.failed') {
    await releaseRefund(refund.id);
  }
};

module.exports = { refundOrder, applyRefundWebhook, refundableBalance, paymentStatusAfterRefund, httpError };
