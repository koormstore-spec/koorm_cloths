import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/axios';

export default function useCoupon(cartItems, cartTotal, initialCode = '', userId = null) {
  const hasItems = cartItems.length > 0;
  const cartKey = JSON.stringify([cartTotal, cartItems.map(item => [item.id, item.quantity, item.price, item.discount_price])]);
  const requestVersion = useRef(0);
  const couponEdited = useRef(false);
  // Keep a FIRST30 coupon already applied in the bag valid at checkout.
  const autoApplied = useRef(false);
  const [state, setState] = useState({ cartKey, code: initialCode, applied: null, error: '', applying: Boolean(initialCode) });
  const previousUserId = useRef(userId);

  useEffect(() => {
    if (previousUserId.current === userId) return;
    previousUserId.current = userId;
    requestVersion.current += 1;
    couponEdited.current = false;
    autoApplied.current = false;
    setState({ cartKey, code: '', applied: null, error: '', applying: false });
  }, [userId, cartKey]);

  const validateCoupon = useCallback(async (code, { quiet = false } = {}) => {
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) return;
    const version = ++requestVersion.current;
    setState(current => ({ ...current, code: normalizedCode, applied: null, error: '', applying: true }));
    try {
      const { data } = await api.post('/coupons/validate', { code: normalizedCode });
      if (version === requestVersion.current) {
        setState(current => ({ ...current, applied: data, applying: false }));
      }
    } catch (err) {
      if (version === requestVersion.current) {
        // An automatic attempt fails silently, leaving the code ready to apply.
        setState(current => ({ ...current, error: quiet ? '' : err.response?.data?.message || 'Could not apply this coupon. Please try again.', applying: false }));
      }
    }
  }, []);

  // Suggest a valid first-order code in the input; applying it remains explicit.
  useEffect(() => {
    if (!userId || initialCode || !hasItems) return;
    const controller = new AbortController();
    const prefillFirstOrderCoupon = async () => {
      try {
        const { data } = await api.get('/coupons/first-order-eligibility', { signal: controller.signal });
        if (controller.signal.aborted || couponEdited.current) return;
        setState(current => ({ ...current, code: data.eligible ? 'FIRST30' : '' }));
      } catch {
        // The optional suggestion must not prevent entering a coupon manually.
      }
    };
    prefillFirstOrderCoupon();
    return () => controller.abort();
  }, [userId, initialCode, hasItems, cartKey]);

  useEffect(() => {
    setState(current => current.cartKey === cartKey ? current : {
      ...current,
      cartKey,
      applied: null,
      applying: false,
      error: current.applied || current.applying ? 'Your bag changed — please re-apply your coupon.' : '',
    });
    // Ignore validation responses for a previous bag or an unmounted page.
    return () => { requestVersion.current += 1; };
  }, [cartKey]);

  // Keep an automatically applied FIRST30 in step with bag changes.
  const firstCartKey = useRef(cartKey);
  const previousHasItems = useRef(hasItems);
  useEffect(() => {
    if (cartKey === firstCartKey.current) return;
    firstCartKey.current = cartKey;
    const hadItems = previousHasItems.current;
    previousHasItems.current = hasItems;
    // Loading or refilling an empty bag is handled by the initial effects.
    if (hadItems && hasItems && autoApplied.current && !couponEdited.current) validateCoupon('FIRST30', { quiet: true });
  }, [cartKey, hasItems, validateCoupon]);


  // Revalidate a code carried over from the bag before using it at checkout.
  useEffect(() => {
    if (initialCode && hasItems && !couponEdited.current) {
      autoApplied.current = initialCode.trim().toUpperCase() === 'FIRST30';
      validateCoupon(initialCode);
    }
  }, [initialCode, hasItems, validateCoupon]);

  const appliedCoupon = state.cartKey === cartKey ? state.applied : null;
  return {
    couponCode: state.code,
    appliedCoupon,
    couponError: state.error,
    applyingCoupon: state.applying,
    discountAmount: appliedCoupon?.discount_amount || 0,
    setCouponCode: code => {
      couponEdited.current = true;
      setState(current => ({ ...current, code: code.toUpperCase(), error: '' }));
    },
    applyCoupon: event => {
      event.preventDefault();
      couponEdited.current = true;
      validateCoupon(state.code);
    },
    removeCoupon: () => {
      couponEdited.current = true;
      requestVersion.current += 1;
      setState(current => ({ ...current, code: '', applied: null, error: '', applying: false }));
    },
  };
}
