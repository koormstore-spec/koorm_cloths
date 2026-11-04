const { pool } = require('../config/db');
const {
  sendOrderConfirmationToCustomer,
  sendOrderNotificationToAdmin,
} = require('./email');
const { refundOrder, refundableBalance, httpError } = require('./refunds');

// An online order holds its stock while the customer pays. If payment doesn't
// arrive in time the order is cancelled and the stock goes back on sale.
const PENDING_PAYMENT_MINUTES = 30;

const restockItems = (connection, orderId) => connection.query(
  `UPDATE products p JOIN order_items oi ON oi.product_id = p.id
   SET p.stock = p.stock + oi.quantity WHERE oi.order_id = ?`,
  [orderId]
);

// A coupon is counted when a COD order is placed or an online order is paid,
// so it's handed back only in those cases.
const releaseCoupon = (connection, order) => {
  if (!order.coupon_code || ['pending', 'failed'].includes(order.payment_status)) return null;
  return connection.query('UPDATE coupons SET used_count = GREATEST(used_count - 1, 0) WHERE code = ?', [order.coupon_code]);
};

const loadOrderForEmail = async (orderId) => {
  const [[order]] = await pool.query(
    `SELECT o.*, u.name AS customer_name, u.email AS customer_email
     FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = ?`,
    [orderId]
  );
  if (!order) return null;
  const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
  return { ...order, customerName: order.customer_name, customerEmail: order.customer_email, items };
};

const sendConfirmationEmails = async (orderId) => {
  try {
    const order = await loadOrderForEmail(orderId);
    if (!order) return;
    await Promise.all([sendOrderConfirmationToCustomer(order), sendOrderNotificationToAdmin(order)]);
  } catch (err) {
    console.error('Order email dispatch failed:', err.message);
  }
};

// Called by both the browser's verify request and Razorpay's webhook, so it
// must be safe to run twice for the same payment.
const markOrderPaid = async ({ razorpayOrderId, razorpayPaymentId }) => {
  const connection = await pool.getConnection();
  let order;
  let paidAfterCancellation = false;
  try {
    await connection.beginTransaction();
    [[order]] = await connection.query('SELECT * FROM orders WHERE razorpay_order_id = ? FOR UPDATE', [razorpayOrderId]);
    if (!order || !['pending', 'failed'].includes(order.payment_status)) {
      await connection.rollback();
      return { order: order || null, alreadyHandled: Boolean(order) };
    }

    if (order.status === 'cancelled') {
      // The payment arrived after the order expired or was cancelled, so its
      // stock is no longer held. Record the payment, then refund it below.
      paidAfterCancellation = true;
      await connection.query(
        "UPDATE orders SET payment_status = 'paid', razorpay_payment_id = ?, paid_at = NOW() WHERE id = ?",
        [razorpayPaymentId, order.id]
      );
    } else {
      await connection.query(
        "UPDATE orders SET status = 'placed', payment_status = 'paid', razorpay_payment_id = ?, paid_at = NOW() WHERE id = ?",
        [razorpayPaymentId, order.id]
      );
      // Only the purchased items leave the bag; anything added since stays.
      await connection.query(
        `DELETE ci FROM cart_items ci
         JOIN order_items oi ON oi.product_id = ci.product_id AND oi.size = ci.size
         WHERE ci.user_id = ? AND oi.order_id = ?`,
        [order.user_id, order.id]
      );
      if (order.coupon_code) {
        await connection.query('UPDATE coupons SET used_count = used_count + 1 WHERE code = ?', [order.coupon_code]);
      }
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  if (paidAfterCancellation) {
    refundOrder({ orderId: order.id, reason: 'Payment received after the order was cancelled', initiatedBy: 'system' })
      .catch((err) => console.error(`Automatic refund for order ${order.order_number} failed:`, err.message));
    return { order: { ...order, payment_status: 'paid' }, refundedLatePayment: true };
  }

  sendConfirmationEmails(order.id);
  return { order: { ...order, status: 'placed', payment_status: 'paid', razorpay_payment_id: razorpayPaymentId } };
};

// A customer request holds the order for admin review without releasing stock
// or starting a refund. The row lock serializes requests with admin approval.
const requestOrderCancellation = async (orderId, userId) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[order]] = await connection.query('SELECT * FROM orders WHERE id = ? AND user_id = ? FOR UPDATE', [orderId, userId]);
    if (!order) throw httpError(404, 'Order not found');
    if (!['pending_payment', 'placed', 'processing'].includes(order.status)) {
      throw httpError(400, `Cannot cancel an order that is ${order.status}`);
    }
    const alreadyRequested = order.cancellation_status === 'requested';
    if (!alreadyRequested) {
      await connection.query("UPDATE orders SET cancellation_status = 'requested', cancellation_requested_at = NOW() WHERE id = ?", [order.id]);
    }
    await connection.commit();
    return { order: { ...order, cancellation_status: 'requested' }, alreadyRequested };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

// Cancels an order that hasn't shipped: restocks it, hands back its coupon,
// and refunds whatever was paid online. `userId` limits it to the customer's
// own orders.
const cancelOrderAndRefund = async (orderId, { userId = null, initiatedBy }) => {
  const connection = await pool.getConnection();
  let order;
  try {
    await connection.beginTransaction();
    const ownerFilter = userId ? ' AND user_id = ?' : '';
    [[order]] = await connection.query(`SELECT * FROM orders WHERE id = ?${ownerFilter} FOR UPDATE`, userId ? [orderId, userId] : [orderId]);
    if (!order) throw httpError(404, 'Order not found');
    if (initiatedBy === 'customer' || (order.cancellation_status === 'requested' && initiatedBy !== 'admin')) {
      throw httpError(400, 'Cancellation requires admin approval.');
    }
    if (['shipped', 'delivered', 'cancelled'].includes(order.status)) {
      throw httpError(400, `Cannot cancel an order that is ${order.status}`);
    }
    const paymentStatus = order.payment_status === 'pending' ? 'failed' : order.payment_status;
    await connection.query("UPDATE orders SET status = 'cancelled', payment_status = ?, cancellation_status = IF(cancellation_status = 'requested', 'approved', cancellation_status) WHERE id = ?", [paymentStatus, order.id]);
    await restockItems(connection, order.id);
    await releaseCoupon(connection, order);
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  let refund = null;
  let refundError = null;
  if (['paid', 'partially_refunded'].includes(order.payment_status) && refundableBalance(order) > 0) {
    try {
      refund = await refundOrder({ orderId: order.id, reason: 'Order cancelled before shipping', initiatedBy });
    } catch (err) {
      // The cancellation stands; the admin can retry the refund from the panel.
      refundError = err.message;
      console.error(`Refund for cancelled order ${order.order_number} failed:`, err.message);
    }
  }
  return { order: { ...order, status: 'cancelled' }, refund, refundError };
};

const expireStalePendingOrders = async () => {
  const [stale] = await pool.query(
    "SELECT id FROM orders WHERE status = 'pending_payment' AND cancellation_status <> 'requested' AND created_at < NOW() - INTERVAL ? MINUTE",
    [PENDING_PAYMENT_MINUTES]
  );
  let expired = 0;
  for (const { id } of stale) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [[order]] = await connection.query('SELECT status, payment_status, cancellation_status FROM orders WHERE id = ? FOR UPDATE', [id]);
      if (order?.status === 'pending_payment' && order.payment_status === 'pending' && order.cancellation_status !== 'requested') {
        await connection.query("UPDATE orders SET status = 'cancelled', payment_status = 'failed' WHERE id = ?", [id]);
        await restockItems(connection, id);
        expired += 1;
      }
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      console.error(`Could not expire unpaid order ${id}:`, err.message);
    } finally {
      connection.release();
    }
  }
  return expired;
};

const startPendingOrderSweeper = (intervalMs = 5 * 60 * 1000) => {
  const sweep = () => expireStalePendingOrders().catch((err) => console.error('Unpaid order sweep failed:', err.message));
  sweep();
  const timer = setInterval(sweep, intervalMs);
  timer.unref();
  return timer;
};

module.exports = {
  PENDING_PAYMENT_MINUTES,
  restockItems,
  markOrderPaid,
  cancelOrderAndRefund,
  requestOrderCancellation,
  expireStalePendingOrders,
  startPendingOrderSweeper,
  sendConfirmationEmails,
  loadOrderForEmail,
};
