const { pool } = require('../config/db');
const { fetchPayment, summarizePayment } = require('./razorpay');

// Stores how the customer paid on the order the payment belongs to. Only the
// payment that actually paid the order is recorded.
const savePaymentDetails = async (payment) => {
  const details = summarizePayment(payment);
  if (!details?.order_id) return null;
  await pool.query(
    'UPDATE orders SET payment_details = ? WHERE razorpay_order_id = ? AND razorpay_payment_id = ?',
    [JSON.stringify(details), details.order_id, details.id]
  );
  return details;
};

// Pulls the latest payment record from Razorpay (fees appear once settled).
const syncPaymentDetails = async (paymentId) => savePaymentDetails(await fetchPayment(paymentId));

// Runs after a payment is confirmed without holding up the customer.
const recordPaymentDetails = (payment) => {
  const work = typeof payment === 'string' ? syncPaymentDetails(payment) : savePaymentDetails(payment);
  return work.catch((err) => console.error('Could not save payment details:', err.message));
};

const parsePaymentDetails = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

module.exports = { savePaymentDetails, syncPaymentDetails, recordPaymentDetails, parsePaymentDetails };
