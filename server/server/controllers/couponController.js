const { pool } = require('../config/db');
const { couponModel } = require('../models');
const { FIRST_ORDER_CODE, firstOrderError } = require('../utils/firstOrderOffer');

const getFirstOrderEligibility = async (req, res) => {
  try {
    const error = await firstOrderError(pool, req.user.id, FIRST_ORDER_CODE);
    if (error) return res.json({ eligible: false });

    const [coupons] = await pool.query('SELECT * FROM coupons WHERE code = ?', [FIRST_ORDER_CODE]);
    if (!coupons.length) return res.json({ eligible: false });

    const [cartRows] = await pool.query(
      `SELECT ci.quantity, COALESCE(p.discount_price, p.price) AS price
       FROM cart_items ci JOIN products p ON ci.product_id = p.id
       WHERE ci.user_id = ?`,
      [req.user.id]
    );
    if (!cartRows.length) return res.json({ eligible: false });
    const itemsTotal = cartRows.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
    res.json({ eligible: !evaluateCoupon(coupons[0], itemsTotal).error });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Shared by validateCoupon (checkout preview) and createOrder (final,
// authoritative check) so the two can never disagree about whether a coupon
// applies or how much it's worth.
const evaluateCoupon = (coupon, itemsTotal) => {
  if (!coupon.is_active) {
    return { error: 'This coupon is no longer active' };
  }
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return { error: 'This coupon has expired' };
  }
  if (coupon.usage_limit != null && coupon.used_count >= coupon.usage_limit) {
    return { error: 'This coupon has reached its usage limit' };
  }
  const minOrderAmount = Number(coupon.min_order_amount);
  if (itemsTotal < minOrderAmount) {
    return { error: `Add items worth ₹${(minOrderAmount - itemsTotal).toFixed(0)} more to use this coupon` };
  }

  let discountAmount =
    coupon.discount_type === 'percent'
      ? (itemsTotal * Number(coupon.discount_value)) / 100
      : Number(coupon.discount_value);

  if (coupon.max_discount_amount != null) {
    discountAmount = Math.min(discountAmount, Number(coupon.max_discount_amount));
  }
  discountAmount = Math.min(discountAmount, itemsTotal);
  discountAmount = Math.round(discountAmount * 100) / 100;

  return { discountAmount };
};

const validateCoupon = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ message: 'Coupon code is required' });
    }

    const [cartRows] = await pool.query(
      `SELECT ci.quantity, COALESCE(p.discount_price, p.price) AS price
       FROM cart_items ci JOIN products p ON ci.product_id = p.id
       WHERE ci.user_id = ?`,
      [req.user.id]
    );
    if (cartRows.length === 0) {
      return res.status(400).json({ message: 'Your cart is empty' });
    }
    const itemsTotal = cartRows.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);

    const [coupons] = await pool.query('SELECT * FROM coupons WHERE code = ?', [code.trim().toUpperCase()]);
    if (coupons.length === 0) {
      return res.status(404).json({ message: 'Invalid coupon code' });
    }

    const result = evaluateCoupon(coupons[0], itemsTotal);
    if (result.error) {
      return res.status(400).json({ message: result.error });
    }

    const eligibilityError = await firstOrderError(pool, req.user.id, coupons[0].code);
    if (eligibilityError) return res.status(400).json({ message: eligibilityError });

    res.json({
      code: coupons[0].code,
      discount_type: coupons[0].discount_type,
      discount_value: Number(coupons[0].discount_value),
      discount_amount: result.discountAmount,
      items_total: itemsTotal,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ---- Admin ----

const listCoupons = async (req, res) => {
  try {
    const [coupons] = await pool.query('SELECT * FROM coupons ORDER BY created_at DESC');
    res.json(coupons);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getCouponById = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM coupons WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Coupon not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createCoupon = async (req, res) => {
  try {
    const { code, discount_type, discount_value, min_order_amount, max_discount_amount, usage_limit, expires_at, is_active } = req.body;
    if (!code?.trim() || !discount_type || discount_value === undefined || discount_value === '') {
      return res.status(400).json({ message: 'Code, discount type and discount value are required' });
    }
    if (!['percent', 'flat'].includes(discount_type)) {
      return res.status(400).json({ message: 'Discount type must be percent or flat' });
    }
    if (!Number.isFinite(Number(discount_value)) || Number(discount_value) <= 0 || (discount_type === 'percent' && Number(discount_value) > 100)) {
      return res.status(400).json({ message: 'Discount value must be valid and within the selected type' });
    }
    if (min_order_amount != null && Number(min_order_amount) < 0) {
      return res.status(400).json({ message: 'Minimum order amount cannot be negative' });
    }
    if (max_discount_amount != null && Number(max_discount_amount) <= 0) {
      return res.status(400).json({ message: 'Maximum discount must be greater than zero' });
    }
    if (usage_limit != null && (!Number.isInteger(Number(usage_limit)) || Number(usage_limit) < 1)) {
      return res.status(400).json({ message: 'Redemption limit must be a positive whole number' });
    }

    const normalizedCode = code.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(normalizedCode)) {
      return res.status(400).json({ message: 'Coupon code must be 3-40 letters, numbers, underscores, or hyphens' });
    }
    const existing = await couponModel.findByCode(normalizedCode);
    if (existing) {
      return res.status(400).json({ message: 'A coupon with this code already exists' });
    }

    const coupon = await couponModel.create({
      code: normalizedCode,
      discount_type,
      discount_value: Number(discount_value),
      min_order_amount: min_order_amount || 0,
      max_discount_amount: max_discount_amount || null,
      usage_limit: usage_limit || null,
      expires_at: expires_at || null,
      is_active: is_active === undefined || is_active ? 1 : 0,
    });
    res.status(201).json(coupon);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateCoupon = async (req, res) => {
  try {
    const current = await couponModel.findById(req.params.id);
    if (!current) {
      return res.status(404).json({ message: 'Coupon not found' });
    }
    const { code, discount_type, discount_value, min_order_amount, max_discount_amount, usage_limit, expires_at, is_active } = req.body;

    const normalizedCode = code ? code.trim().toUpperCase() : current.code;
    if (normalizedCode !== current.code) {
      const duplicate = await couponModel.findByCode(normalizedCode);
      if (duplicate && String(duplicate.id) !== String(req.params.id)) {
        return res.status(400).json({ message: 'A coupon with this code already exists' });
      }
    }
    if (discount_type && !['percent', 'flat'].includes(discount_type)) {
      return res.status(400).json({ message: 'Discount type must be percent or flat' });
    }

    const updated = await couponModel.update(req.params.id, {
      code: normalizedCode,
      discount_type: discount_type || current.discount_type,
      discount_value: discount_value !== undefined ? discount_value : current.discount_value,
      min_order_amount: min_order_amount !== undefined ? min_order_amount : current.min_order_amount,
      max_discount_amount: max_discount_amount !== undefined ? max_discount_amount : current.max_discount_amount,
      usage_limit: usage_limit !== undefined ? usage_limit : current.usage_limit,
      expires_at: expires_at !== undefined ? expires_at : current.expires_at,
      is_active: is_active !== undefined ? (is_active ? 1 : 0) : current.is_active,
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteCoupon = async (req, res) => {
  try {
    await couponModel.remove(req.params.id);
    res.json({ message: 'Coupon deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getFirstOrderEligibility,
  evaluateCoupon,
  validateCoupon,
  listCoupons,
  getCouponById,
  createCoupon,
  updateCoupon,
  deleteCoupon,
};
