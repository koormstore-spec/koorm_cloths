const { pool } = require('../config/db');
const {
  verifyPaymentSignature, verifyWebhookSignature, createGatewayOrder, checkoutOptions, confirmGatewayPayment,
} = require('../utils/razorpay');
const { markOrderPaid } = require('../utils/orderLifecycle');
const { applyRefundWebhook } = require('../utils/refunds');
const { recordPaymentDetails } = require('../utils/paymentDetails');

// The browser reports a successful payment here. Its signature proves the
// message came from Razorpay, so a customer can't mark an order paid by hand.
const verifyPayment = async (req, res) => {
  try {
    const { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const [[order]] = await pool.query('SELECT id, razorpay_order_id, total_amount FROM orders WHERE id = ? AND user_id = ?', [order_id, req.user.id]);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!razorpay_order_id || order.razorpay_order_id !== razorpay_order_id) {
      return res.status(400).json({ message: 'This payment does not belong to this order.' });
    }
    if (!verifyPaymentSignature({ razorpayOrderId: razorpay_order_id, razorpayPaymentId: razorpay_payment_id, signature: razorpay_signature })) {
      return res.status(400).json({ message: 'We could not confirm this payment. If money was taken, contact us and we will sort it out.' });
    }
    // The signature proves who sent it; Razorpay itself confirms the amount
    // and captures the money before the order counts as paid.
    let payment;
    try {
      payment = await confirmGatewayPayment({ paymentId: razorpay_payment_id, razorpayOrderId: razorpay_order_id, amount: order.total_amount });
    } catch (err) {
      if (err.statusCode >= 500) {
        // Razorpay is unreachable; its webhook will confirm the order shortly.
        return res.status(502).json({ message: 'Your payment was received and is being confirmed. This page will update in a minute.', confirming: true });
      }
      throw err;
    }
    const result = await markOrderPaid({ razorpayOrderId: razorpay_order_id, razorpayPaymentId: razorpay_payment_id });
    await recordPaymentDetails(payment);
    res.json({
      id: order.id,
      status: result.order?.status,
      payment_status: result.order?.payment_status,
      refunded_late_payment: Boolean(result.refundedLatePayment),
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

// Reopens payment for an order that's still waiting (e.g. the customer closed
// the payment window).
const retryPayment = async (req, res) => {
  try {
    const [[order]] = await pool.query('SELECT * FROM orders WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.cancellation_status === 'requested') {
      return res.status(409).json({ message: 'Your cancellation request is awaiting admin approval.' });
    }
    if (order.status !== 'pending_payment' || order.payment_status !== 'pending') {
      return res.status(400).json({ message: 'This order is not waiting for payment.' });
    }
    let gatewayOrderId = order.razorpay_order_id;
    if (!gatewayOrderId) {
      const gatewayOrder = await createGatewayOrder({
        amount: order.total_amount,
        receipt: order.order_number,
        notes: { order_id: String(order.id), order_number: order.order_number },
      });
      gatewayOrderId = gatewayOrder.id;
      await pool.query('UPDATE orders SET razorpay_order_id = ? WHERE id = ?', [gatewayOrderId, order.id]);
    }
    res.json(checkoutOptions(order, gatewayOrderId, req.user));
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

// Razorpay's server-to-server notifications. They confirm payments even if the
// customer closed the browser before /verify ran, and report refund outcomes.
// Mounted with express.raw() because the signature covers the exact body.
const handleWebhook = async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (!verifyWebhookSignature(rawBody, req.get('x-razorpay-signature'))) {
    return res.status(400).json({ message: 'Invalid signature' });
  }
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ message: 'Invalid payload' });
  }

  try {
    switch (event.event) {
      case 'payment.authorized': {
        // Only reached when auto-capture is off in the Razorpay dashboard.
        const payment = event.payload?.payment?.entity;
        if (!payment?.order_id || !payment.id) break;
        const [[order]] = await pool.query('SELECT total_amount FROM orders WHERE razorpay_order_id = ?', [payment.order_id]);
        if (!order) break;
        const captured = await confirmGatewayPayment({ paymentId: payment.id, razorpayOrderId: payment.order_id, amount: order.total_amount });
        await markOrderPaid({ razorpayOrderId: payment.order_id, razorpayPaymentId: payment.id });
        await recordPaymentDetails(captured);
        break;
      }
      case 'payment.captured':
      case 'order.paid': {
        const payment = event.payload?.payment?.entity;
        if (payment?.order_id && payment.id) {
          await markOrderPaid({ razorpayOrderId: payment.order_id, razorpayPaymentId: payment.id });
          // Webhook payloads leave out card details, so fetch the full record.
          await recordPaymentDetails(payment.id);
        }
        break;
      }
      case 'refund.processed':
      case 'refund.failed':
        await applyRefundWebhook(event.event, event.payload?.refund?.entity);
        break;
      default:
        // e.g. payment.failed: the order stays open for a retry until it expires.
        break;
    }
    res.json({ received: true });
  } catch (err) {
    // A non-2xx response makes Razorpay retry the webhook later.
    console.error(`Razorpay webhook ${event.event} failed:`, err.message);
    res.status(500).json({ message: 'Webhook processing failed' });
  }
};

module.exports = { verifyPayment, retryPayment, handleWebhook };
