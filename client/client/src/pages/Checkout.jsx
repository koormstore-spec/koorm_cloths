import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import api from '../api/axios';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import CouponCode from '../components/CouponCode';
import useCoupon from '../hooks/useCoupon';
import { payForOrder } from '../lib/razorpay';
import { BagIcon, CashIcon, CheckShieldIcon, MinusIcon, PlusIcon, TrashIcon } from '../components/Icons';

const ProgressStep = ({ number, label, active, done }) => (
  <span className={`progress-step ${active || done ? 'progress-step-active' : ''}`} aria-current={active ? 'step' : undefined}><span className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] ${active || done ? 'bg-ink text-white' : 'border border-sand'}`}>{done ? '✓' : number}</span> {label}</span>
);

const Progress = ({ step }) => (
  <div className="mb-9 flex items-center gap-2 overflow-hidden sm:gap-4"><ProgressStep number={1} label="Bag" done /><span className="h-px flex-1 bg-ink" /><ProgressStep number={2} label="Address" active={step === 'address'} done={step === 'payment'} /><span className={`h-px flex-1 ${step === 'payment' ? 'bg-ink' : 'bg-sand'}`} /><ProgressStep number={3} label="Payment" active={step === 'payment'} /></div>
);

export default function Checkout() {
  const { cartItems, cartTotal, refreshCart, updateQuantity, removeFromCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();
  const coupon = useCoupon(cartItems, cartTotal, state?.couponCode || '', user?.id);
  const { appliedCoupon, discountAmount, applyingCoupon } = coupon;
  const [form, setForm] = useState({ shipping_name: user?.name || '', shipping_phone: user?.phone || '', shipping_address_line1: '', shipping_address_line2: '', shipping_city: '', shipping_state: '', shipping_pincode: '' });
  const [editingItem, setEditingItem] = useState(null);
  const [itemError, setItemError] = useState('');
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');
  // null while we ask the server whether online payment is set up.
  const [onlineAvailable, setOnlineAvailable] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('COD');
  const [testMode, setTestMode] = useState(false);
  const [step, setStep] = useState('address');
  useEffect(() => {
    let active = true;
    api.get('/payments/config')
      .then(({ data }) => { if (!active) return; setOnlineAvailable(Boolean(data.online)); setTestMode(data.mode === 'test'); setPaymentMethod(data.online ? 'ONLINE' : 'COD'); })
      .catch(() => { if (active) setOnlineAvailable(false); });
    return () => { active = false; };
  }, []);
  const shippingFee = cartTotal >= 1999 ? 0 : 99;
  const orderTotal = cartTotal - discountAmount + shippingFee;

  if (cartItems.length === 0) return <div className="container-x py-24 text-center"><p className="page-kicker justify-center">Checkout</p><h1 className="section-title">Your bag is empty.</h1><p className="mt-3 text-sm text-muted">Add a piece before continuing to checkout.</p><Link to="/shop" className="btn-primary mt-7">Explore the collection</Link></div>;

  const handleChange = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  const editItem = async (item, quantity) => {
    if (editingItem !== null || placing || applyingCoupon) return;
    setEditingItem(item.id);
    setItemError('');
    try {
      if (quantity === null) await removeFromCart(item.id);
      else await updateQuantity(item.id, quantity);
    } catch (err) {
      setItemError(err.response?.data?.message || 'Could not update your bag. Please try again.');
    } finally {
      setEditingItem(null);
    }
  };

  const scrollToTop = () => window.scrollTo?.({ top: 0, behavior: 'smooth' });
  const continueToPayment = (event) => {
    event.preventDefault();
    setError('');
    setStep('payment');
    scrollToTop();
  };
  const editAddress = () => { setError(''); setStep('address'); scrollToTop(); };

  // Only the address, coupon and chosen method are sent. The server works out
  // the amount from the bag and creates the Razorpay order for exactly that sum.
  const placeOrder = async (event) => {
    event.preventDefault();
    if (editingItem !== null || applyingCoupon || placing) return;
    setError(''); setPlacing(true);
    let data;
    try {
      ({ data } = await api.post('/orders', { ...form, coupon_code: appliedCoupon?.code, payment_method: paymentMethod }));
    } catch (err) {
      setError(err.response?.data?.message || 'We could not place your order. Please try again.');
      setPlacing(false);
      return;
    }
    if (!data.payment) {
      await refreshCart();
      navigate(`/orders/${data.id}`, { state: { justPlaced: true } });
      return;
    }
    // The order now exists and holds its stock, so whatever happens in the
    // payment window, continue on the order page (where payment can be retried).
    try {
      await payForOrder(data.id, data.payment);
      await refreshCart();
      navigate(`/orders/${data.id}`, { state: { justPlaced: true } });
    } catch (err) {
      if (err.confirming) await refreshCart();
      navigate(`/orders/${data.id}`, { state: { paymentIssue: err.response?.data?.message || err.message, confirming: Boolean(err.confirming) } });
    }
  };

  return (
    <div className="container-x py-8 fade-in md:py-12">
      <Progress step={step} />
      {step === 'address'
        ? <div className="mb-8"><p className="page-kicker">Almost there</p><h1 className="section-title">Delivery details</h1><p className="mt-3 text-sm text-muted">Tell us where you would like your Koorm order delivered.</p></div>
        : <div className="mb-8"><p className="page-kicker">Last step</p><h1 className="section-title">Payment</h1><p className="mt-3 text-sm text-muted">Choose to pay now online or in cash on delivery.</p></div>}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_23rem] xl:gap-12">
        {step === 'address' ? (
        <form onSubmit={continueToPayment} className="panel p-5 sm:p-7 md:p-8"><div className="mb-7 flex items-start justify-between border-b border-sand pb-5"><div><h2 className="font-serif text-2xl">Shipping address</h2><p className="mt-1 text-xs leading-5 text-muted">We will only use these details to deliver this order.</p></div><CheckShieldIcon width={21} height={21} className="text-accent" /></div>
          <div className="grid gap-5 sm:grid-cols-2"><label className="block text-xs font-semibold text-ink/75 sm:col-span-2">Full name<input name="shipping_name" value={form.shipping_name} onChange={handleChange} required placeholder="Your full name" className="input-field mt-2" /></label><label className="block text-xs font-semibold text-ink/75 sm:col-span-2">Phone number<input name="shipping_phone" value={form.shipping_phone} onChange={handleChange} required type="tel" inputMode="tel" autoComplete="tel" pattern="(\+91[\s-]?)?[6-9][0-9]{9}" title="Enter a 10-digit Indian mobile number" placeholder="10-digit mobile number" className="input-field mt-2" /></label><label className="block text-xs font-semibold text-ink/75 sm:col-span-2">Address line 1<input name="shipping_address_line1" value={form.shipping_address_line1} onChange={handleChange} required placeholder="House no., building, street" className="input-field mt-2" /></label><label className="block text-xs font-semibold text-ink/75 sm:col-span-2">Address line 2 <span className="font-normal text-muted">(optional)</span><input name="shipping_address_line2" value={form.shipping_address_line2} onChange={handleChange} placeholder="Landmark, area, etc." className="input-field mt-2" /></label><label className="block text-xs font-semibold text-ink/75">City<input name="shipping_city" value={form.shipping_city} onChange={handleChange} required placeholder="City" className="input-field mt-2" /></label><label className="block text-xs font-semibold text-ink/75">State<input name="shipping_state" value={form.shipping_state} onChange={handleChange} required placeholder="State" className="input-field mt-2" /></label><label className="block text-xs font-semibold text-ink/75 sm:col-span-2">Pincode<input name="shipping_pincode" value={form.shipping_pincode} onChange={handleChange} required inputMode="numeric" autoComplete="postal-code" pattern="[1-9][0-9]{5}" maxLength={6} title="Enter a 6-digit pincode" placeholder="6-digit pincode" className="input-field mt-2 sm:max-w-[48%]" /></label></div>
          <button type="submit" disabled={editingItem !== null || applyingCoupon} className="btn-primary mt-7 w-full">Continue to payment <span aria-hidden="true">&rarr;</span></button>
        </form>
        ) : (
        <form onSubmit={placeOrder} className="panel p-5 sm:p-7 md:p-8">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border border-sand bg-white p-4"><div className="min-w-0 text-xs leading-5"><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Delivering to</p><p className="text-sm font-semibold">{form.shipping_name}</p><p className="text-muted">{[form.shipping_address_line1, form.shipping_address_line2].filter(Boolean).join(', ')}</p><p className="text-muted">{form.shipping_city}, {form.shipping_state} {form.shipping_pincode}</p><p className="text-muted">Phone: {form.shipping_phone}</p></div><button type="button" onClick={editAddress} disabled={placing} className="min-h-11 text-xs font-semibold underline underline-offset-4">Change</button></div>
          <fieldset><legend className="mb-1 font-serif text-2xl">Choose how to pay</legend><p className="mb-4 text-xs leading-5 text-muted">Pay now through our secure payment partner, or pay in cash when your order arrives.</p>
            <div className="grid gap-3">
              <label className={`flex gap-3 border p-4 ${onlineAvailable === false ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${paymentMethod === 'ONLINE' ? 'border-ink bg-white' : 'border-sand'}`}><input type="radio" name="payment_method" value="ONLINE" checked={paymentMethod === 'ONLINE'} disabled={!onlineAvailable || placing} onChange={() => setPaymentMethod('ONLINE')} className="mt-1 accent-ink" /><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sand/40 text-accent"><CheckShieldIcon width={18} height={18} /></span><span className="min-w-0"><span className="block text-sm font-semibold">Pay now</span><span className="mt-1 block text-xs leading-5 text-muted">{onlineAvailable === false ? 'Online payment is unavailable right now. Please choose cash on delivery.' : onlineAvailable === null ? 'Checking online payment…' : 'UPI, credit and debit cards, net banking and wallets, secured by Razorpay. Refunds go back to the same account.'}</span>{onlineAvailable && <span className="mt-2 flex flex-wrap gap-1.5" aria-hidden="true">{['UPI', 'Cards', 'Net banking', 'Wallets'].map(name => <span key={name} className="border border-sand px-1.5 py-0.5 text-[10px] font-semibold text-ink/70">{name}</span>)}</span>}{onlineAvailable && testMode && <span className="mt-2 block border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] leading-4 text-amber-900">Test mode: no real money is charged. Use Razorpay test UPI <strong>success@razorpay</strong> or test card 4111 1111 1111 1111.</span>}</span></label>
              <label className={`flex cursor-pointer gap-3 border p-4 ${paymentMethod === 'COD' ? 'border-ink bg-white' : 'border-sand'}`}><input type="radio" name="payment_method" value="COD" checked={paymentMethod === 'COD'} disabled={placing} onChange={() => setPaymentMethod('COD')} className="mt-1 accent-ink" /><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sand/40 text-accent"><CashIcon width={18} height={18} /></span><span><span className="block text-sm font-semibold">Cash on delivery</span><span className="mt-1 block text-xs leading-5 text-muted">Pay in cash when your order reaches you. No payment is required today.</span></span></label>
            </div>
          </fieldset>
          <div className="mt-6 flex items-center justify-between border-t border-sand pt-5 text-sm"><span className="text-muted">{paymentMethod === 'ONLINE' ? 'Amount to pay now' : 'Amount to pay on delivery'}</span><span className="text-lg font-semibold">₹{orderTotal.toLocaleString('en-IN')}</span></div>
          {error && <p role="alert" className="mt-5 text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={placing || editingItem !== null || applyingCoupon || onlineAvailable === null} className="btn-primary mt-5 w-full">{placing ? (paymentMethod === 'ONLINE' ? 'Opening secure payment...' : 'Placing your order...') : paymentMethod === 'ONLINE' ? `Pay ₹${orderTotal.toLocaleString('en-IN')} now` : `Place order · Pay ₹${orderTotal.toLocaleString('en-IN')} on delivery`} <span aria-hidden="true">&rarr;</span></button>
          <p className="mt-3 text-center text-[11px] leading-5 text-muted">{paymentMethod === 'ONLINE' ? 'You will complete the payment in Razorpay’s secure window. We never see or store your card or UPI PIN.' : 'Please keep the exact amount ready at delivery.'}</p>
        </form>
        )}
        <aside className="h-fit bg-ink p-6 text-cream lg:sticky lg:top-32">
          <div className="flex items-center justify-between border-b border-cream/15 pb-4"><h2 className="font-serif text-2xl">Your order</h2><BagIcon width={19} height={19} className="text-accent" /></div>
          <p className="mt-3 text-xs text-cream/65">Adjust quantities or remove items below.</p>
          <div className="max-h-96 divide-y divide-cream/10 overflow-y-auto py-2 pr-2" aria-busy={editingItem !== null}>{cartItems.map(item => {
            const busy = editingItem !== null || placing || applyingCoupon;
            const stock = Number(item.stock);
            const label = item.name + ', size ' + item.size;
            return <article key={item.id} className="flex gap-3 py-4">
              <img src={item.images?.[0]} alt="" className="h-20 w-14 shrink-0 object-cover" />
              <div className="min-w-0 flex-1">
                <Link to={`/product/${item.slug}`} className="product-name product-name-on-dark block text-xs font-semibold leading-5 hover:underline">{item.name}</Link>
                <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs"><span className="text-cream/65">Size: {item.size}</span><span>&#8377;{(Number(item.discount_price || item.price) * item.quantity).toLocaleString('en-IN')}</span></div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex items-center rounded-sm border border-cream/25">
                    <button type="button" aria-label={`Decrease quantity for ${label}`} disabled={busy || item.quantity <= 1 || stock === 0} onClick={() => editItem(item, Math.max(1, Math.min(item.quantity - 1, stock > 0 ? stock : item.quantity - 1)))} className="flex h-9 w-9 items-center justify-center hover:bg-white/10 disabled:opacity-30"><MinusIcon width={12} height={12} /></button>
                    <span className="min-w-7 text-center text-xs" aria-label={`Quantity for ${label}`} aria-live="polite">{item.quantity}</span>
                    <button type="button" aria-label={`Increase quantity for ${label}`} disabled={busy || item.quantity >= stock} onClick={() => editItem(item, item.quantity + 1)} className="flex h-9 w-9 items-center justify-center hover:bg-white/10 disabled:opacity-30"><PlusIcon width={12} height={12} /></button>
                  </div>
                  <button type="button" aria-label={`Remove ${label}`} disabled={busy} onClick={() => editItem(item, null)} className="inline-flex min-h-9 items-center gap-1.5 text-xs text-red-200 hover:text-red-100 hover:underline disabled:opacity-40"><TrashIcon width={13} height={13} />Remove</button>
                </div>
                {stock === 0 ? <p className="mt-2 text-xs text-red-200">Out of stock. Please remove this item.</p> : item.quantity > stock ? <p className="mt-2 text-xs text-red-200">Only {stock} available. Reduce the quantity to continue.</p> : null}
              </div>
            </article>;
          })}</div>
          {itemError && <p role="alert" className="my-2 rounded-sm bg-red-50 p-3 text-xs text-red-800">{itemError}</p>}

          <CouponCode coupon={coupon} disabled={editingItem !== null || placing} showFirstOrderOffer />
          <div className="space-y-3 border-t border-cream/15 py-5 text-sm">
            <div className="flex justify-between text-cream/70"><span>Subtotal</span><span className="text-cream">&#8377;{cartTotal.toLocaleString('en-IN')}</span></div>
            {discountAmount > 0 && <div className="flex justify-between text-green-400"><span>Coupon discount</span><span>&minus;&#8377;{discountAmount.toLocaleString('en-IN')}</span></div>}
            <div className="flex justify-between text-cream/70"><span>Delivery</span><span className="text-cream">{shippingFee === 0 ? 'Complimentary' : `₹${shippingFee}`}</span></div>
          </div>
          <div className="flex justify-between border-t border-cream/15 pt-5 text-lg font-semibold"><span>Total</span><span>&#8377;{orderTotal.toLocaleString('en-IN')}</span></div>
          <p className="mt-5 text-center text-[12px] leading-5 text-cream/55">Pay now online or choose cash on delivery at the next step.</p>
        </aside>
      </div>
    </div>
  );
}
