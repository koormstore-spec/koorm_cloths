import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import Loader from '../components/Loader';
import CouponCode from '../components/CouponCode';
import useCoupon from '../hooks/useCoupon';
import { BagIcon, PlusIcon, MinusIcon, TrashIcon, UserIcon, TruckIcon, ChevronRightIcon } from '../components/Icons';

const FREE_SHIPPING_THRESHOLD = 1999;
// Matches the server-enforced per-product cap in cartController.js.
const MAX_QUANTITY_PER_PRODUCT = 4;

const Progress = () => (
  <div className="mb-9 flex items-center gap-2 overflow-hidden sm:gap-4">
    <span className="progress-step progress-step-active"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[9px] text-white">1</span> Bag</span><span className="h-px flex-1 bg-sand" /><span className="progress-step"><span className="flex h-5 w-5 items-center justify-center rounded-full border border-sand">2</span> Details</span><span className="h-px flex-1 bg-sand" /><span className="progress-step"><span className="flex h-5 w-5 items-center justify-center rounded-full border border-sand">3</span> Confirm</span>
  </div>
);

export default function Cart() {
  const { cartItems, loading, cartTotal, updateQuantity, removeFromCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const coupon = useCoupon(cartItems, cartTotal, '', user?.id);
  const { appliedCoupon, discountAmount, applyingCoupon } = coupon;
  const [quantityError, setQuantityError] = useState({});
  const increaseQuantity = async (item) => {
    setQuantityError((current) => ({ ...current, [item.id]: '' }));
    try {
      await updateQuantity(item.id, item.quantity + 1);
    } catch (err) {
      setQuantityError((current) => ({ ...current, [item.id]: err.response?.data?.message || 'Could not update quantity.' }));
    }
  };
  const shippingFee = cartTotal >= FREE_SHIPPING_THRESHOLD || cartTotal === 0 ? 0 : 99;
  const remainingForFreeShipping = Math.max(0, FREE_SHIPPING_THRESHOLD - cartTotal);
  const shippingProgress = Math.min(100, (cartTotal / FREE_SHIPPING_THRESHOLD) * 100);

  if (loading) return <Loader full />;

  if (!user) return <div className="container-x py-20 text-center md:py-28"><div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-sand/50 text-muted"><UserIcon width={25} height={25} /></div><p className="page-kicker justify-center">Your bag</p><h1 className="section-title">Sign in to continue.</h1><p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-muted">Your saved pieces and bag will be waiting once you log in.</p><Link to="/login" className="btn-primary mt-7">Login <span aria-hidden="true">&rarr;</span></Link></div>;

  if (cartItems.length === 0) return <div className="container-x py-20 text-center md:py-28"><div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-sand/50 text-muted"><BagIcon width={25} height={25} /></div><p className="page-kicker justify-center">Your bag</p><h1 className="section-title">A fresh start awaits.</h1><p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-muted">You have not added anything just yet. Find a piece you will want to wear on repeat.</p><Link to="/shop" className="btn-primary mt-7">Explore the collection <span aria-hidden="true">&rarr;</span></Link></div>;

  return (
    <div className="container-x py-8 fade-in md:py-12">
      <Progress />
      <div className="mb-8 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="page-kicker">Your selection</p><h1 className="section-title">Your bag</h1></div><Link to="/shop" className="text-xs font-bold uppercase tracking-[0.14em] text-muted link-underline hover:text-ink">Continue shopping &rarr;</Link></div>

      {remainingForFreeShipping > 0 ? <div className="mb-7 overflow-hidden border border-sand bg-white"><div className="flex items-start gap-3 p-4"><div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-clay/10 text-accent"><TruckIcon width={16} height={16} /></div><div className="flex-1"><p className="text-sm">Add <strong className="text-accent">&#8377;{remainingForFreeShipping.toLocaleString('en-IN')}</strong> more for complimentary delivery.</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sand"><div className="h-full rounded-full bg-clay transition-all duration-500" style={{ width: `${shippingProgress}%` }} /></div></div></div></div> : <div className="mb-7 flex items-center gap-3 border border-clay/25 bg-clay/5 p-4 text-sm"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-clay text-white"><TruckIcon width={16} height={16} /></span><p><strong>You have unlocked complimentary delivery.</strong> Your order is ready for checkout.</p></div>}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_23rem] xl:gap-12">
        <section className="border-t border-ink"><div className="flex items-center justify-between border-b border-sand py-4"><p className="text-[12px] font-bold uppercase tracking-[0.16em] text-muted">{cartItems.length} item{cartItems.length === 1 ? '' : 's'}</p><p className="text-xs text-muted">Delivery across India</p></div>
          <div className="divide-y divide-sand">{cartItems.map((item) => { const price = Number(item.discount_price || item.price); const originalPrice = Number(item.price); const stock = Number(item.stock); const outOfStock = stock === 0; const atStockLimit = !outOfStock && item.quantity >= stock; const productTotalQty = cartItems.filter((other) => other.product_id === item.product_id).reduce((sum, other) => sum + other.quantity, 0); const atProductLimit = productTotalQty >= MAX_QUANTITY_PER_PRODUCT; return <article key={item.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4 py-5 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:gap-5"><Link to={`/product/${item.slug}`} className="aspect-[3/4] overflow-hidden bg-sand/40"><img src={item.images?.[0]} alt={item.name} className="h-full w-full object-cover transition-transform duration-500 hover:scale-105" /></Link><div className="flex min-w-0 flex-col"><p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted">{item.brand || 'Koorm'}</p><Link to={`/product/${item.slug}`} className="product-name mt-1 truncate text-sm font-semibold hover:text-accent">{item.name}</Link><p className="mt-1 text-xs text-muted">Size: <span className="font-medium text-ink">{item.size}</span></p>{outOfStock ? <p role="alert" className="mt-1 text-xs font-semibold text-red-600">Out of stock</p> : item.quantity > stock ? <p role="alert" className="mt-1 text-xs font-semibold text-red-600">Only {stock} left in stock</p> : atProductLimit ? <p className="mt-1 text-xs font-semibold text-muted">Limit of {MAX_QUANTITY_PER_PRODUCT} per product reached</p> : null}<div className="mt-auto flex flex-wrap items-center gap-4 pt-4"><div className="flex w-28 items-center border border-sand bg-white"><button onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))} className="flex h-9 flex-1 items-center justify-center hover:bg-cream" aria-label="Decrease quantity"><MinusIcon width={13} height={13} /></button><span className="flex-1 text-center text-xs font-semibold">{item.quantity}</span><button onClick={() => increaseQuantity(item)} disabled={atStockLimit || outOfStock || atProductLimit} className="flex h-9 flex-1 items-center justify-center hover:bg-cream disabled:opacity-40" aria-label="Increase quantity"><PlusIcon width={13} height={13} /></button></div><span className="hidden text-xs text-muted sm:block">Qty {item.quantity}</span></div>{quantityError[item.id] && <p role="alert" className="basis-full text-xs text-red-600">{quantityError[item.id]}</p>}</div><div className="col-start-2 flex flex-row-reverse items-center justify-between gap-3 sm:col-auto sm:flex-col sm:items-end"><button onClick={() => removeFromCart(item.id)} className="text-muted transition-colors hover:text-red-600" aria-label={`Remove ${item.name}`}><TrashIcon width={17} height={17} /></button><div className="text-right"><p className="text-sm font-semibold">&#8377;{(price * item.quantity).toLocaleString('en-IN')}</p>{price < originalPrice && <p className="mt-1 text-[12px] text-accent">Saved &#8377;{((originalPrice - price) * item.quantity).toLocaleString('en-IN')}</p>}</div></div></article>; })}</div>
        </section>
        <aside className="h-fit bg-ink p-6 text-cream lg:sticky lg:top-32">
          <div className="flex items-center justify-between border-b border-cream/15 pb-4"><h2 className="font-serif text-2xl">Order summary</h2><BagIcon width={19} height={19} className="text-accent" /></div>
          <div className="space-y-3 py-5 text-sm">
            <div className="flex justify-between text-cream/70"><span>Subtotal</span><span className="text-cream">&#8377;{cartTotal.toLocaleString('en-IN')}</span></div>
            {discountAmount > 0 && <div className="flex justify-between text-green-300"><span>Coupon discount</span><span>&minus;&#8377;{discountAmount.toLocaleString('en-IN')}</span></div>}
            <div className="flex justify-between text-cream/70"><span>Delivery</span><span className="text-cream">{shippingFee === 0 ? 'Complimentary' : `₹${shippingFee}`}</span></div>
          </div>
          <CouponCode coupon={coupon} />
          <div className="flex justify-between border-t border-cream/15 pt-5 text-lg font-semibold" aria-live="polite"><span>Total</span><span>&#8377;{(cartTotal - discountAmount + shippingFee).toLocaleString('en-IN')}</span></div>
          <button onClick={() => navigate('/checkout', { state: { couponCode: appliedCoupon?.code } })} disabled={applyingCoupon} className="btn-primary mt-6 w-full">Secure checkout <ChevronRightIcon width={15} height={15} /></button>
          <p className="mt-4 text-center text-[12px] leading-5 text-cream/55">Pay securely online or with cash on delivery.</p>
        </aside>
      </div>
    </div>
  );
}
