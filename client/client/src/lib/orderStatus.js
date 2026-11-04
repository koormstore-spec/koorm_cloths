// Customer-facing wording for order, payment and return states, shared by the
// order page, the profile order list and the admin screens.

export const ORDER_STATUS_LABELS = {
  pending_payment: 'Awaiting payment',
  placed: 'Placed',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const ORDER_STATUS_COLORS = {
  pending_payment: 'bg-amber-100 text-amber-800',
  placed: 'bg-blue-100 text-blue-700',
  processing: 'bg-yellow-100 text-yellow-700',
  shipped: 'bg-purple-100 text-purple-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export const PAYMENT_STATUS_LABELS = {
  cod: 'Cash on delivery',
  pending: 'Awaiting payment',
  paid: 'Paid online',
  failed: 'Payment not completed',
  partially_refunded: 'Partly refunded',
  refunded: 'Refunded',
};

export const RETURN_REASONS = ['Size or fit issue', 'Damaged or defective', 'Received the wrong item', 'Not as described', 'Changed my mind', 'Other'];

export const RETURN_STATUS_LABELS = {
  requested: 'Return requested',
  approved: 'Return approved',
  rejected: 'Return declined',
  received: 'Return received',
  refunded: 'Return refunded',
};

export const EXCHANGE_STATUS_LABELS = {
  requested: 'Exchange requested',
  approved: 'Exchange approved',
  rejected: 'Exchange declined',
  received: 'Exchange items received',
  exchanged: 'Exchange completed',
};

export const RETURN_WINDOW_DAYS = 30;

export const rupees = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
