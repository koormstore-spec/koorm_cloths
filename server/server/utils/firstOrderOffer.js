const FIRST_ORDER_CODE = 'FIRST30';

// Any order counts except an online order whose payment never went through
// (expired or cancelled before paying), so a failed payment doesn't use up
// the offer. A payment still in progress does count, so FIRST30 can't be used
// on two orders at once.
const firstOrderError = async (database, userId, code, lock = false) => {
  if (String(code).toUpperCase() !== FIRST_ORDER_CODE) return null;
  const [orders] = await database.query(`SELECT id FROM orders WHERE user_id = ? AND payment_status <> 'failed' LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [userId]);
  return orders.length ? 'FIRST30 is available on your first order only.' : null;
};

module.exports = { FIRST_ORDER_CODE, firstOrderError };
