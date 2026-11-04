const { pool } = require('../config/db');
const { getMode, isConfigured } = require('../utils/razorpay');
const { syncPaymentDetails, parsePaymentDetails } = require('../utils/paymentDetails');

const COLLECTED = ['paid', 'partially_refunded', 'refunded'];

// Every online order with how it was paid, for the admin payments page.
const getPayments = async (req, res) => {
  try {
    const [orders] = await pool.query(
      `SELECT o.id, o.order_number, o.status, o.payment_status, o.total_amount, o.refunded_amount,
              o.razorpay_order_id, o.razorpay_payment_id, o.paid_at, o.created_at, o.payment_details,
              o.shipping_name, o.shipping_phone, o.shipping_city, o.shipping_state,
              u.name AS customer_name, u.email AS customer_email
       FROM orders o JOIN users u ON o.user_id = u.id
       WHERE o.payment_method = 'ONLINE'
       ORDER BY COALESCE(o.paid_at, o.created_at) DESC`
    );
    const [refunds] = await pool.query(
      `SELECT r.id, r.order_id, r.amount, r.status, r.reason, r.reference, r.initiated_by, r.created_at
       FROM refunds r JOIN orders o ON o.id = r.order_id
       WHERE o.payment_method = 'ONLINE' ORDER BY r.created_at`
    );
    const refundsByOrder = new Map();
    for (const refund of refunds) {
      if (!refundsByOrder.has(refund.order_id)) refundsByOrder.set(refund.order_id, []);
      refundsByOrder.get(refund.order_id).push(refund);
    }

    const payments = orders.map((order) => ({
      ...order,
      payment_details: parsePaymentDetails(order.payment_details),
      refunds: refundsByOrder.get(order.id) || [],
    }));
    const collected = payments.filter((payment) => COLLECTED.includes(payment.payment_status));
    const sum = (rows, pick) => Math.round(rows.reduce((total, row) => total + Number(pick(row) || 0), 0) * 100) / 100;
    const summary = {
      count: collected.length,
      collected: sum(collected, (row) => row.total_amount),
      refunded: sum(collected, (row) => row.refunded_amount),
      fees: sum(collected, (row) => row.payment_details?.fee),
    };
    summary.net = Math.round((summary.collected - summary.refunded - summary.fees) * 100) / 100;

    res.json({ mode: getMode(), online: isConfigured(), summary, payments });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Re-reads one payment from Razorpay, e.g. to pick up the fee after settlement
// or details for a payment made before they were recorded.
const refreshPayment = async (req, res) => {
  try {
    const [[order]] = await pool.query(
      "SELECT id, razorpay_payment_id FROM orders WHERE id = ? AND payment_method = 'ONLINE'",
      [req.params.id]
    );
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!order.razorpay_payment_id) return res.status(400).json({ message: 'This order has no completed payment yet.' });
    const details = await syncPaymentDetails(order.razorpay_payment_id);
    res.json({ id: order.id, payment_details: details });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

module.exports = { getPayments, refreshPayment };
