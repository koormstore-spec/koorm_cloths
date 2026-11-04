import { useId } from 'react';

export default function CouponCode({ coupon, disabled = false, showFirstOrderOffer = false }) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const { couponCode, setCouponCode, appliedCoupon, couponError, applyingCoupon, applyCoupon, removeCoupon } = coupon;
  const busy = disabled || applyingCoupon;

  return (
    <form onSubmit={applyCoupon} className="border-t border-cream/15 py-5" aria-label="Apply coupon code" aria-busy={applyingCoupon}>
      <label htmlFor={inputId} className="mb-3 block text-sm font-medium">Apply coupon code</label>
      {showFirstOrderOffer && appliedCoupon?.code !== 'FIRST30' && <p className="mb-3 text-xs leading-5 text-cream/80">First-time user? Use <strong className="first-offer-code">FIRST30</strong> for 30% off your first order.</p>}
      {appliedCoupon ? (
        <div className="flex items-center justify-between gap-3 rounded-sm border border-green-300/25 bg-green-300/10 px-3 py-2.5 text-xs">
          <span role="status" className="text-green-200">Coupon <strong className={`tracking-wide ${appliedCoupon.code === 'FIRST30' ? 'first-offer-code' : ''}`}>{appliedCoupon.code}</strong> applied</span>
          <button type="button" onClick={removeCoupon} disabled={disabled} className="min-h-7 shrink-0 font-semibold text-cream underline underline-offset-4 hover:text-white disabled:opacity-50">Remove</button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input id={inputId} name="coupon_code" value={couponCode} onChange={event => setCouponCode(event.target.value)} disabled={busy} aria-invalid={Boolean(couponError)} aria-describedby={couponError ? errorId : undefined} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="Coupon code" className="input-field min-h-12 min-w-0 flex-1 border-cream/25 bg-white/5 text-cream placeholder:text-cream/50 focus:border-cream/60 focus:ring-cream/20 disabled:opacity-50" />
          <button type="submit" disabled={busy || !couponCode.trim()} className="btn-primary shrink-0">{applyingCoupon ? 'Checking...' : 'Apply'}</button>
        </div>
      )}
      {couponError && <p id={errorId} role="alert" className="mt-2 text-xs leading-5 text-red-300">{couponError}</p>}
    </form>
  );
}
