const crypto = require('crypto');
const Razorpay = require('razorpay');

// Razorpay keys come from server/.env. The key id is public (the browser needs
// it to open the payment popup); the key secret and webhook secret never leave
// the server.
let client = null;

const isConfigured = () => Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

// 'test' for rzp_test_ keys, 'live' for rzp_live_ keys. Switching from trial to
// live is only a matter of replacing the keys in server/.env and restarting.
const getMode = () => {
  if (!isConfigured()) return null;
  if (process.env.RAZORPAY_KEY_ID.startsWith('rzp_live_')) return 'live';
  if (process.env.RAZORPAY_KEY_ID.startsWith('rzp_test_')) return 'test';
  return null;
};

// Customers can pay online only with live keys. Test keys stay switched off so
// shoppers never reach a sandbox checkout; set RAZORPAY_ALLOW_TEST=true in
// server/.env to try the test checkout locally. Checkout shows 'Pay now' as
// unavailable whenever this is false.
const isEnabled = () => {
  const mode = getMode();
  return mode === 'live' || (mode === 'test' && process.env.RAZORPAY_ALLOW_TEST === 'true');
};

// Logs the payment setup once at startup so a misconfigured key is caught
// before a customer hits it. Never prints the secrets themselves.
const logPaymentConfig = (log = console) => {
  if (!isConfigured()) {
    log.warn('Razorpay: no keys configured; checkout offers cash on delivery only.');
    return;
  }
  const mode = getMode();
  if (!mode) log.warn('Razorpay: RAZORPAY_KEY_ID should start with rzp_test_ or rzp_live_. Check server/.env.');
  else if (!isEnabled()) log.warn('Razorpay: test keys found; online payments stay off until live (rzp_live_) keys are set. Checkout offers cash on delivery only.');
  else log.log(`Razorpay: online payments enabled in ${mode.toUpperCase()} mode.`);
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
    log.warn('Razorpay: RAZORPAY_WEBHOOK_SECRET is not set, so webhooks are rejected. Payments still confirm from the browser, but orders paid by customers who close the tab early will not be confirmed.');
  }
};

const getClient = () => {
  if (!isConfigured()) {
    const err = new Error('Online payment is not available right now. Please choose cash on delivery.');
    err.statusCode = 503;
    throw err;
  }
  if (!client) {
    client = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
  }
  return client;
};

// Razorpay works in paise.
const toPaise = (rupees) => Math.round(Number(rupees) * 100);

// The SDK rejects with { statusCode, error: { description } } rather than an Error.
const gatewayError = (err, fallback) => {
  const wrapped = new Error(err?.error?.description || err?.message || fallback);
  wrapped.statusCode = err?.statusCode >= 400 && err?.statusCode < 500 ? 400 : 502;
  return wrapped;
};

const createGatewayOrder = async ({ amount, receipt, notes }) => {
  if (!isEnabled()) {
    const err = new Error('Online payment is not available right now. Please choose cash on delivery.');
    err.statusCode = 503;
    throw err;
  }
  try {
    return await getClient().orders.create({ amount: toPaise(amount), currency: 'INR', receipt, notes });
  } catch (err) {
    if (err.statusCode === 503) throw err;
    throw gatewayError(err, 'Could not start the payment. Please try again.');
  }
};

const createGatewayRefund = async (paymentId, amount, notes) => {
  try {
    return await getClient().payments.refund(paymentId, { amount: toPaise(amount), speed: 'normal', notes });
  } catch (err) {
    if (err.statusCode === 503) throw err;
    throw gatewayError(err, 'The refund could not be started with Razorpay.');
  }
};

// Confirms with Razorpay itself that a payment belongs to our order, is for the
// full amount, and has been captured. Payments that are only authorized are
// captured here; Razorpay would otherwise refund them automatically after a few
// days while the order showed as paid.
const fetchPayment = async (paymentId) => {
  try {
    // Expanding the card adds its network, issuer and last 4 digits.
    return await getClient().payments.fetch(paymentId, { 'expand[]': 'card' });
  } catch (err) {
    if (err.statusCode === 503) throw err;
    throw gatewayError(err, 'We could not confirm the payment with Razorpay.');
  }
};

const confirmGatewayPayment = async ({ paymentId, razorpayOrderId, amount }) => {
  let payment = await fetchPayment(paymentId);
  const expected = toPaise(amount);
  if (payment.order_id !== razorpayOrderId || payment.currency !== 'INR' || Number(payment.amount) !== expected) {
    const err = new Error('This payment does not match the order. If money was taken, contact us and we will sort it out.');
    err.statusCode = 400;
    throw err;
  }
  if (payment.status === 'authorized') {
    try {
      payment = { ...payment, ...(await getClient().payments.capture(paymentId, expected, 'INR')) };
    } catch (err) {
      // A webhook or a second verify may have captured it at the same moment.
      const latest = await fetchPayment(paymentId).catch(() => null);
      if (latest?.status !== 'captured') throw gatewayError(err, 'We could not complete the payment with Razorpay.');
      payment = latest;
    }
  }
  if (payment.status !== 'captured') {
    const err = new Error('The payment has not gone through yet.');
    err.statusCode = 409;
    throw err;
  }
  return payment;
};

const fromPaise = (paise) => (paise == null ? null : Number(paise) / 100);

// The parts of a Razorpay payment the store keeps for its records. Razorpay
// never shares full card or bank account numbers, only these identifiers.
const summarizePayment = (payment) => {
  if (!payment?.id) return null;
  const card = payment.card && typeof payment.card === 'object' ? payment.card : null;
  const acquirer = payment.acquirer_data || {};
  return {
    id: payment.id,
    order_id: payment.order_id || null,
    status: payment.status || null,
    method: payment.method || null,
    amount: fromPaise(payment.amount),
    currency: payment.currency || 'INR',
    fee: fromPaise(payment.fee),
    tax: fromPaise(payment.tax),
    email: payment.email || null,
    contact: payment.contact || null,
    vpa: payment.vpa || payment.upi?.vpa || null,
    bank: payment.bank || null,
    wallet: payment.wallet || null,
    card: card ? {
      name: card.name || null,
      network: card.network || null,
      type: card.type || null,
      issuer: card.issuer || null,
      last4: card.last4 || null,
      international: Boolean(card.international),
    } : null,
    reference: {
      rrn: acquirer.rrn || null,
      upi_transaction_id: acquirer.upi_transaction_id || null,
      bank_transaction_id: acquirer.bank_transaction_id || null,
      auth_code: acquirer.auth_code || null,
    },
    international: Boolean(payment.international),
    created_at: payment.created_at ? new Date(payment.created_at * 1000).toISOString() : null,
    synced_at: new Date().toISOString(),
  };
};

const hmacHex = (payload, secret) => crypto.createHmac('sha256', secret).update(payload).digest('hex');

const safeEqual = (expected, received) => {
  if (typeof received !== 'string' || received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
};

// Proves the browser's "payment succeeded" message really came from Razorpay.
const verifyPaymentSignature = ({ razorpayOrderId, razorpayPaymentId, signature }) => {
  if (!process.env.RAZORPAY_KEY_SECRET || !razorpayOrderId || !razorpayPaymentId) return false;
  return safeEqual(hmacHex(`${razorpayOrderId}|${razorpayPaymentId}`, process.env.RAZORPAY_KEY_SECRET), signature);
};

// Webhooks are signed over the exact raw request body.
const verifyWebhookSignature = (rawBody, signature) => {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET || !rawBody) return false;
  return safeEqual(hmacHex(rawBody, process.env.RAZORPAY_WEBHOOK_SECRET), signature);
};

// What the browser needs to open the Razorpay payment window for an order.
const checkoutOptions = (order, gatewayOrderId, customer) => ({
  key_id: process.env.RAZORPAY_KEY_ID,
  razorpay_order_id: gatewayOrderId,
  amount: toPaise(order.total_amount),
  currency: 'INR',
  name: 'Koorm',
  description: `Order ${order.order_number}`,
  prefill: { name: customer.name, email: customer.email, contact: order.shipping_phone },
});

module.exports = {
  isConfigured,
  isEnabled,
  getMode,
  logPaymentConfig,
  confirmGatewayPayment,
  fetchPayment,
  summarizePayment,
  checkoutOptions,
  toPaise,
  createGatewayOrder,
  createGatewayRefund,
  verifyPaymentSignature,
  verifyWebhookSignature,
};
