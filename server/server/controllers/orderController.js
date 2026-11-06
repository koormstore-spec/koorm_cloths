const { pool } = require('../config/db');
const { sendOrderConfirmationToCustomer, sendOrderNotificationToAdmin, sendOrderCancellationToAdmin, sendCancellationRequestToAdmin, sendOrderStatusUpdateToCustomer } = require('../utils/email');
const { evaluateCoupon } = require('./couponController');
const { firstOrderError } = require('../utils/firstOrderOffer');
const { isConfigured: onlinePaymentsEnabled, createGatewayOrder, checkoutOptions } = require('../utils/razorpay');
const { cancelOrderAndRefund, requestOrderCancellation, loadOrderForEmail } = require('../utils/orderLifecycle');
const { refundOrder } = require('../utils/refunds');
const { parsePaymentDetails } = require('../utils/paymentDetails');

const parseImages = (images) => {
  if (!images) return [];
  if (Array.isArray(images)) return images;
  try {
    return JSON.parse(images);
  } catch {
    return [];
  }
};

const generateOrderNumber = () => {
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `KRM${Date.now().toString().slice(-6)}${rand}`;
};

const FREE_SHIPPING_THRESHOLD = 1999;
const SHIPPING_FEE = 99;
const PAYMENT_METHODS = ['COD', 'ONLINE'];

// Checks the bag against stock. Different sizes of one product share its stock.
const stockProblem = (cartRows, stockByProduct) => {
  const needed = new Map();
  for (const item of cartRows) needed.set(item.product_id, (needed.get(item.product_id) || 0) + item.quantity);
  for (const item of cartRows) {
    const stock = Number(stockByProduct.get(item.product_id) ?? 0);
    if (stock <= 0) return `${item.name} is out of stock`;
    if (stock < needed.get(item.product_id)) return `Only ${stock} left in stock for ${item.name}`;
  }
  return null;
};

const createOrder = async (req, res) => {
  const connection = await pool.getConnection();
  let released = false;
  try {
    const { shipping_name, shipping_phone, shipping_address_line1, shipping_address_line2,
      shipping_city, shipping_state, shipping_pincode, coupon_code } = req.body;
    const paymentMethod = String(req.body.payment_method || 'COD').toUpperCase();

    if (!shipping_name || !shipping_phone || !shipping_address_line1 || !shipping_city || !shipping_state || !shipping_pincode) {
      connection.release();
      return res.status(400).json({ message: 'Complete shipping address is required' });
    }
    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      connection.release();
      return res.status(400).json({ message: 'Choose a valid payment method' });
    }
    if (paymentMethod === 'ONLINE' && !onlinePaymentsEnabled()) {
      connection.release();
      return res.status(503).json({ message: 'Online payment is not available right now. Please choose cash on delivery.' });
    }

    const couponCode = coupon_code ? String(coupon_code).trim().toUpperCase() : null;
    const orderNumber = generateOrderNumber();
    const isOnline = paymentMethod === 'ONLINE';
    const reject = async (status, message) => {
      await connection.rollback();
      connection.release();
      released = true;
      return res.status(status).json({ message });
    };

    await connection.beginTransaction();

    // Everything that decides this order is read under locks, always in this
    // sequence, so simultaneous checkouts wait for each other instead of acting
    // on the same bag, the last piece, or the last use of a coupon.
    // One checkout at a time per customer, then FIRST30 eligibility.
    await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [req.user.id]);
    const eligibilityError = await firstOrderError(connection, req.user.id, couponCode, true);
    if (eligibilityError) return await reject(400, eligibilityError);

    // Read after the customer lock: a checkout that was waiting finds the bag
    // already emptied rather than placing the same order again.
    const [bagRows] = await connection.query(
      'SELECT id, product_id, size, quantity FROM cart_items WHERE user_id = ? FOR UPDATE',
      [req.user.id]
    );
    if (bagRows.length === 0) return await reject(400, 'Your cart is empty');

    // Lock the products so two customers can't buy the last piece at once.
    const productIds = [...new Set(bagRows.map((item) => item.product_id))];
    const [lockedProducts] = await connection.query(
      `SELECT id, name, images, COALESCE(discount_price, price) AS price, stock
       FROM products WHERE id IN (?) ORDER BY id FOR UPDATE`,
      [productIds]
    );
    const productsById = new Map(lockedProducts.map((product) => [product.id, product]));
    const cartRows = bagRows.map((item) => {
      const product = productsById.get(item.product_id);
      return { ...item, name: product?.name, images: product?.images, price: product?.price };
    });
    const stockError = stockProblem(cartRows, new Map(lockedProducts.map((product) => [product.id, product.stock])));
    if (stockError) return await reject(400, stockError);

    const itemsTotal = cartRows.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
    const shippingFee = itemsTotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;

    // Re-validated here (not trusted from the client) so a coupon that
    // expired, hit its usage limit, or never existed can't be applied.
    let discountAmount = 0;
    let appliedCoupon = null;
    if (couponCode) {
      const [coupons] = await connection.query('SELECT * FROM coupons WHERE code = ? FOR UPDATE', [couponCode]);
      if (coupons.length === 0) return await reject(400, 'Invalid coupon code');

      // Online orders are only counted once paid, and a paid order can't be
      // turned away, so unpaid ones hold their use of a limited coupon.
      let unpaidOrders = 0;
      if (coupons[0].usage_limit != null) {
        const [[holds]] = await connection.query(
          "SELECT COUNT(*) AS total FROM orders WHERE coupon_code = ? AND status = 'pending_payment'",
          [couponCode]
        );
        unpaidOrders = Number(holds.total);
      }
      const result = evaluateCoupon({ ...coupons[0], used_count: Number(coupons[0].used_count) + unpaidOrders }, itemsTotal);
      if (result.error) return await reject(400, result.error);
      discountAmount = result.discountAmount;
      appliedCoupon = coupons[0];
    }

    const totalAmount = itemsTotal + shippingFee - discountAmount;

    const [orderResult] = await connection.query(
      `INSERT INTO orders
       (user_id, order_number, items_total, shipping_fee, coupon_code, discount_amount, total_amount, payment_method, status, payment_status,
        shipping_name, shipping_phone, shipping_address_line1, shipping_address_line2,
        shipping_city, shipping_state, shipping_pincode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, orderNumber, itemsTotal, shippingFee, appliedCoupon ? appliedCoupon.code : null, discountAmount, totalAmount,
        paymentMethod, isOnline ? 'pending_payment' : 'placed', isOnline ? 'pending' : 'cod',
        shipping_name, shipping_phone, shipping_address_line1, shipping_address_line2 || null,
        shipping_city, shipping_state, shipping_pincode]
    );
    const orderId = orderResult.insertId;

    // Stock is taken now for both methods; an unpaid online order gives it
    // back when it expires (see utils/orderLifecycle.js).
    for (const item of cartRows) {
      const images = parseImages(item.images);
      await connection.query(
        `INSERT INTO order_items (order_id, product_id, product_name, product_image, size, quantity, price)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [orderId, item.product_id, item.name, images[0] || null, item.size, item.quantity, item.price]
      );
      await connection.query('UPDATE products SET stock = stock - ? WHERE id = ?', [
        item.quantity,
        item.product_id,
      ]);
    }

    // Online orders keep the bag and the coupon count until payment succeeds.
    if (!isOnline) {
      await connection.query('DELETE FROM cart_items WHERE user_id = ?', [req.user.id]);
      if (appliedCoupon) {
        await connection.query('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?', [appliedCoupon.id]);
      }
    }

    await connection.commit();
    connection.release();
    released = true;

    const summary = {
      id: orderId,
      order_number: orderNumber,
      items_total: itemsTotal,
      shipping_fee: shippingFee,
      coupon_code: appliedCoupon ? appliedCoupon.code : null,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      status: isOnline ? 'pending_payment' : 'placed',
      payment_method: paymentMethod,
      payment_status: isOnline ? 'pending' : 'cod',
    };

    if (isOnline) {
      let gatewayOrder;
      try {
        gatewayOrder = await createGatewayOrder({
          amount: totalAmount,
          receipt: orderNumber,
          notes: { order_id: String(orderId), order_number: orderNumber },
        });
      } catch (err) {
        // No payment can be taken, so release the reserved stock straight away.
        await cancelOrderAndRefund(orderId, { initiatedBy: 'system' }).catch(() => {});
        return res.status(err.statusCode || 502).json({ message: err.message });
      }
      await pool.query('UPDATE orders SET razorpay_order_id = ? WHERE id = ?', [gatewayOrder.id, orderId]);
      return res.status(201).json({
        ...summary,
        payment: checkoutOptions({ ...summary, shipping_phone }, gatewayOrder.id, req.user),
      });
    }

    const orderForEmail = {
      id: orderId,
      customerEmail: req.user.email,
      customerName: req.user.name,
      order_number: orderNumber,
      payment_method: paymentMethod,
      items: cartRows.map((item) => ({
        product_name: item.name,
        product_image: parseImages(item.images)[0] || null,
        size: item.size,
        quantity: item.quantity,
        price: item.price,
      })),
      items_total: itemsTotal,
      shipping_fee: shippingFee,
      coupon_code: appliedCoupon ? appliedCoupon.code : null,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      shipping_name,
      shipping_phone,
      shipping_address_line1,
      shipping_address_line2,
      shipping_city,
      shipping_state,
      shipping_pincode,
    };

    // Fire-and-forget: email delivery must never block or fail an already-placed order.
    Promise.all([
      sendOrderConfirmationToCustomer(orderForEmail),
      sendOrderNotificationToAdmin(orderForEmail),
    ]).catch((err) => console.error('Order email dispatch failed:', err.message));

    res.status(201).json(summary);
  } catch (err) {
    if (!released) {
      await connection.rollback();
      connection.release();
    }
    res.status(500).json({ message: err.message });
  }
};

const getMyOrders = async (req, res) => {
  try {
    const [orders] = await pool.query(
      'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    for (const order of orders) {
      const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
      order.items = items;
      delete order.payment_details;
    }
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getOrderById = async (req, res) => {
  try {
    const [orders] = await pool.query('SELECT * FROM orders WHERE id = ? AND user_id = ?', [
      req.params.id,
      req.user.id,
    ]);
    if (orders.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }
    const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [req.params.id]);
    const [refunds] = await pool.query(
      "SELECT id, amount, method, status, reason, created_at FROM refunds WHERE order_id = ? AND status <> 'failed' ORDER BY created_at",
      [req.params.id]
    );
    const [returns] = await pool.query(
      'SELECT id, request_type, exchange_details, reason, note, status, admin_note, created_at, updated_at FROM return_requests WHERE order_id = ? ORDER BY created_at DESC',
      [req.params.id]
    );
    for (const request of returns) {
      const [images] = await pool.query('SELECT id FROM return_request_images WHERE return_request_id = ? ORDER BY id', [request.id]);
      request.images = images;
    }
    const { payment_details: _paymentDetails, ...order } = orders[0];
    res.json({ ...order, items, refunds, returns });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const cancellationMessage = ({ refund, refundError }) => {
  if (refund) return `Order cancelled. Your refund of ₹${Number(refund.amount).toLocaleString('en-IN')} has been started and usually arrives in 5–7 working days.`;
  if (refundError) return 'Order cancelled. We could not start your refund automatically; our team will process it shortly.';
  return 'Order cancelled';
};

const emailCancellation = async (orderId, refund, { notifyAdmin }) => {
  try {
    const order = await loadOrderForEmail(orderId);
    if (!order) return;
    const cancelledOrder = { ...order, status: 'cancelled', refund_amount: refund?.method === 'razorpay' ? refund.amount : 0 };
    await Promise.all([
      sendOrderStatusUpdateToCustomer(cancelledOrder),
      notifyAdmin ? sendOrderCancellationToAdmin(cancelledOrder) : null,
    ]);
  } catch (err) {
    console.error('Order cancellation email dispatch failed:', err.message);
  }
};

const cancelOrder = async (req, res) => {
  try {
    const result = await requestOrderCancellation(req.params.id, req.user.id);
    res.json({ message: 'Cancellation requested. Your order will be cancelled after admin approval.', cancellation_status: 'requested' });
    if (!result.alreadyRequested) {
      (async () => {
        try {
          const order = await loadOrderForEmail(result.order.id);
          if (order) await sendCancellationRequestToAdmin(order);
        } catch (err) {
          console.error('Cancellation request email dispatch failed:', err.message);
        }
      })();
    }
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

// ---- Admin ----
const getCancellationRequestCount = async (req, res) => {
  try {
    const [[result]] = await pool.query("SELECT COUNT(*) AS count FROM orders WHERE cancellation_status = 'requested'");
    res.json({ count: Number(result.count) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getAllOrders = async (req, res) => {
  try {
    const [orders] = await pool.query(
      `SELECT o.*, u.name AS customer_name, u.email AS customer_email
       FROM orders o JOIN users u ON o.user_id = u.id
       ORDER BY o.created_at DESC`
    );
    const [refunds] = await pool.query(
      'SELECT id, order_id, amount, method, status, reason, reference, initiated_by, created_at FROM refunds ORDER BY created_at'
    );
    const refundsByOrder = new Map();
    for (const refund of refunds || []) {
      if (!refundsByOrder.has(refund.order_id)) refundsByOrder.set(refund.order_id, []);
      refundsByOrder.get(refund.order_id).push(refund);
    }
    res.json(orders.map((order) => ({
      ...order,
      payment_details: parsePaymentDetails(order.payment_details),
      refunds: refundsByOrder.get(order.id) || [],
    })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const VALID_STATUSES = ['placed', 'processing', 'shipped', 'delivered', 'cancelled'];

const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    const [[current]] = await pool.query('SELECT id, status, cancellation_status FROM orders WHERE id = ?', [req.params.id]);
    if (!current) return res.status(404).json({ message: 'Order not found' });
    if (current.cancellation_status === 'requested' && status !== 'cancelled') {
      return res.status(409).json({ message: 'This order has a cancellation request awaiting approval.' });
    }
    if (current.status === status) return res.json({ message: 'Order status updated' });
    // Cancelling released the stock (and any refund has gone out), so a
    // cancelled order stays cancelled.
    if (current.status === 'cancelled') {
      return res.status(400).json({ message: 'A cancelled order cannot be reopened.' });
    }
    if (current.status === 'pending_payment' && status !== 'cancelled') {
      return res.status(400).json({ message: 'This order is still waiting for online payment.' });
    }

    if (status === 'cancelled') {
      const result = await cancelOrderAndRefund(current.id, { initiatedBy: 'admin' });
      res.json({ message: cancellationMessage(result), refund: result.refund, refundError: result.refundError });
      emailCancellation(current.id, result.refund, { notifyAdmin: false });
      return;
    }

    const [update] = await pool.query(
      `UPDATE orders SET status = ?${status === 'delivered' ? ', delivered_at = COALESCE(delivered_at, NOW())' : ''} WHERE id = ? AND status = ? AND cancellation_status <> 'requested'`,
      [status, req.params.id, current.status]
    );
    if (update.affectedRows === 0) return res.status(409).json({ message: 'The order changed. Refresh the orders before updating it.' });
    res.json({ message: 'Order status updated' });

    // Fire-and-forget, isolated from the response above: email delivery must
    // never block, fail, or double-respond to the status update request.
    (async () => {
      try {
        const order = await loadOrderForEmail(req.params.id);
        if (order) await sendOrderStatusUpdateToCustomer({ ...order, status });
      } catch (err) {
        console.error('Order status email dispatch failed:', err.message);
      }
    })();
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

// Admin refund for any paid order: full or partial. Online orders go back to
// the original payment; COD orders record the transfer reference.
const refundOrderByAdmin = async (req, res) => {
  try {
    const amount = req.body.amount === undefined || req.body.amount === '' ? undefined : Number(req.body.amount);
    if (amount !== undefined && !Number.isFinite(amount)) {
      return res.status(400).json({ message: 'Enter a valid refund amount.' });
    }
    const reason = String(req.body.reason || '').trim().slice(0, 255) || 'Refund by Koorm';
    const refund = await refundOrder({
      orderId: req.params.id,
      amount,
      reason,
      reference: req.body.reference,
      initiatedBy: 'admin',
    });
    res.status(201).json({ message: 'Refund started', refund });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

module.exports = {
  createOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  getAllOrders,
  getCancellationRequestCount,
  updateOrderStatus,
  refundOrderByAdmin,
  stockProblem,
};
