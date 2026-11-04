import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useLocation, Link } from 'react-router-dom';
import api from '../api/axios';
import Loader from '../components/Loader';
import ReturnPhotos from '../components/ReturnPhotos';
import { CloseIcon } from '../components/Icons';
import { payForOrder } from '../lib/razorpay';
import {
  ORDER_STATUS_COLORS, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS,
  RETURN_REASONS, RETURN_STATUS_LABELS, EXCHANGE_STATUS_LABELS, RETURN_WINDOW_DAYS, rupees,
} from '../lib/orderStatus';

const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_RETURN = ['requested', 'approved', 'received'];
const longDate = (value) => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
const readPhoto = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve({ name: file.name, data: reader.result });
  reader.onerror = () => reject(new Error('We could not read the photo. Please choose it again.'));
  reader.onabort = () => reject(new Error('Photo selection was interrupted. Please try again.'));
  reader.readAsDataURL(file);
});

function ReturnForm({ orderId, requestType, onDone }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [exchangeDetails, setExchangeDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [photos, setPhotos] = useState([]);
  const [readingPhotos, setReadingPhotos] = useState(false);
  const photosRequired = reason === 'Damaged or defective';

  const selectPhotos = async event => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    setError('');
    if (photos.length + files.length > 3) { setError('Upload up to 3 clothing photos.'); return; }
    if (files.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size === 0 || file.size > 2 * 1024 * 1024)) {
      setError('Each photo must be a JPG, PNG or WebP image no larger than 2 MB.'); return;
    }
    setReadingPhotos(true);
    try { const selected = await Promise.all(files.map(readPhoto)); setPhotos(current => [...current, ...selected]); }
    catch (err) { setError(err.message); }
    finally { setReadingPhotos(false); }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!reason) { setError('Choose a reason for the request.'); return; }
    if (readingPhotos || sending) return;
    if (photosRequired && photos.length === 0) { setError('Upload at least one photo showing the damaged or defective clothing.'); return; }
    if (requestType === 'exchange' && !exchangeDetails.trim()) { setError('Describe the replacement you want.'); return; }
    setSending(true); setError('');
    try {
      await api.post('/returns', { order_id: orderId, reason, note, request_type: requestType, ...(requestType === 'exchange' ? { exchange_details: exchangeDetails.trim() } : {}), ...(photos.length ? { images: photos.map(photo => photo.data) } : {}) });
      onDone();
    } catch (err) {
      setError(err.response?.data?.message || 'We could not send your request. Please try again.');
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 space-y-4" aria-label={`${requestType === 'exchange' ? 'Exchange' : 'Return'} request`}>
      <p className="text-sm text-muted">Your {requestType} request needs admin approval. We will email you after it is reviewed.</p>
      <label className="block text-xs font-semibold text-ink/75">Reason
        <select value={reason} disabled={sending} onChange={(event) => { setReason(event.target.value); setError(''); }} className="input-field mt-2" required>
          <option value="">Choose a reason</option>
          {RETURN_REASONS.map((option) => <option key={option}>{option}</option>)}
        </select>
      </label>
      <div>
        <label className="block text-xs font-semibold text-ink/75">Clothing photos ({photosRequired ? 'required' : 'optional'})
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={sending || readingPhotos || photos.length >= 3} onChange={selectPhotos} aria-describedby="photo-help" className="mt-2 block w-full text-sm" />
        </label>
        <p id="photo-help" className="mt-2 text-xs text-muted">{photosRequired ? 'Upload at least one clear photo showing the damage or defect.' : reason === 'Size or fit issue' ? 'Photos are not required for size or fit issues.' : 'You can add photos to help us review your request.'} Up to 3 JPG, PNG or WebP photos, 2 MB each.</p>
        {readingPhotos && <p role="status" className="mt-2 text-xs">Reading photos…</p>}
        <div className="mt-3 flex flex-wrap gap-3">{photos.map((photo, index) => <div key={`${index}-${photo.name}`} className="w-24">
          <img src={photo.data} alt={`Selected clothing photo ${index + 1}`} className="h-24 w-24 rounded border border-sand object-cover" />
          <button type="button" disabled={sending || readingPhotos} onClick={() => setPhotos(current => current.filter((_, i) => i !== index))} className="mt-1 min-h-11 text-xs underline" aria-label={`Remove photo ${index + 1}`}>Remove</button>
        </div>)}</div>
      </div>
      {requestType === 'exchange' && <label className="block text-xs font-semibold text-ink/75">Requested replacement
        <textarea value={exchangeDetails} onChange={event => setExchangeDetails(event.target.value)} maxLength={1000} rows={3} required className="input-field mt-2" placeholder="Tell us which item and replacement size or colour you want" />
      </label>}
      <label className="block text-xs font-semibold text-ink/75">Anything else we should know? <span className="font-normal text-muted">(optional)</span>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={3} className="input-field mt-2" placeholder="For example, which size would fit better" />
      </label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={sending || readingPhotos} className="btn-primary">{sending ? 'Sending…' : `Send ${requestType} request`}</button>
    </form>
  );
}

export default function OrderDetail() {
  const { id } = useParams();
  const location = useLocation();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [toast, setToast] = useState('');
  const [actionError, setActionError] = useState('');
  const [paying, setPaying] = useState(false);
  const [paymentIssue, setPaymentIssue] = useState(location.state?.paymentIssue || '');
  const [justPaid, setJustPaid] = useState(false);
  // Money was taken but the server hasn't confirmed it yet (Razorpay's webhook will).
  const [confirming, setConfirming] = useState(Boolean(location.state?.confirming));
  const [showReturnForm, setShowReturnForm] = useState(false);
  const returnsSection = useRef(null);

  const load = useCallback(() => api.get(`/orders/${id}`)
    .then(({ data }) => setOrder(data))
    .catch(() => setOrder(null))
    .finally(() => setLoading(false)), [id]);

  useEffect(() => { load(); }, [load]);

  // Checks back for about a minute while a payment is being confirmed.
  useEffect(() => {
    if (!confirming || !order) return undefined;
    if (order.status !== 'pending_payment') {
      setConfirming(false);
      if (order.payment_status === 'paid') { setJustPaid(true); setPaymentIssue(''); }
      return undefined;
    }
    let checks = 0;
    const timer = window.setInterval(() => {
      checks += 1;
      if (checks > 12) { window.clearInterval(timer); setConfirming(false); return; }
      load();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [confirming, order?.status, order?.payment_status, load]);

  // Email links arrive before the order has loaded, so scroll once it is rendered.
  useEffect(() => {
    if (!loading && order && location.hash === '#returns') {
      returnsSection.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      returnsSection.current?.focus({ preventScroll: true });
    }
  }, [loading, order?.id, location.hash]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const cancelOrder = async () => {
    setCancelling(true); setActionError('');
    try {
      const { data } = await api.put(`/orders/${id}/cancel`);
      setToast(data.message || 'Cancellation requested. Awaiting admin approval.');
      await load();
    } catch (err) {
      setActionError(err.response?.data?.message || 'We could not request cancellation. Please try again.');
    } finally {
      setCancelling(false);
    }
  };

  const completePayment = async () => {
    setPaying(true); setPaymentIssue(''); setActionError('');
    try {
      const { data: payment } = await api.post(`/payments/orders/${id}/retry`);
      await payForOrder(order.id, payment);
      setJustPaid(true);
    } catch (err) {
      if (err.confirming) setConfirming(true);
      setPaymentIssue(err.response?.data?.message || err.message);
    } finally {
      setPaying(false);
      await load();
    }
  };

  if (loading) return <Loader full />;
  if (!order) return <p className="container-x py-20 text-center">Order not found.</p>;

  const isOnline = order.payment_method === 'ONLINE';
  const cancellationRequested = order.cancellation_status === 'requested';
  const awaitingPayment = order.status === 'pending_payment';
  const canCancel = !cancellationRequested && ['pending_payment', 'placed', 'processing'].includes(order.status);
  const refunds = order.refunds || [];
  const returns = order.returns || [];
  const openReturn = returns.find((request) => OPEN_RETURN.includes(request.status));
  const refundable = Number(order.total_amount) - Number(order.refunded_amount || 0);
  const deliveredAt = order.delivered_at ? new Date(order.delivered_at).getTime() : NaN;
  const deliveryDateConfirmed = Number.isFinite(deliveredAt) && deliveredAt <= Date.now();
  const returnDeadline = new Date(deliveredAt + RETURN_WINDOW_DAYS * DAY_MS);
  const canRequestReturn = order.status === 'delivered' && deliveryDateConfirmed && !openReturn && refundable > 0 && Date.now() <= returnDeadline.getTime();
  const placedMessage = isOnline
    ? `🎉 Payment received and order confirmed! Thank you for shopping with Koorm.`
    : `🎉 Order placed successfully! You'll pay ${rupees(order.total_amount)} on delivery.`;

  return (
    <div className="container-x py-10 max-w-3xl mx-auto fade-in">
      {toast && createPortal(
        <div className="bag-toast" role="status" aria-atomic="true">
          <span className="bag-toast-icon" aria-hidden="true">✓</span>
          <p>{toast}</p>
          <button type="button" onClick={() => setToast('')} aria-label="Dismiss message">
            <CloseIcon width={16} height={16} aria-hidden="true" />
          </button>
        </div>,
        document.body
      )}
      {(justPaid || (location.state?.justPlaced && order.status !== 'pending_payment')) && order.status !== 'cancelled' && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-5 py-4 mb-8 text-center">{placedMessage}</div>
      )}
      {cancellationRequested && (
        <div role="status" className="mb-8 border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900">
          <p className="font-semibold">Cancellation requested</p>
          <p className="mt-1 text-sm">Your order is on hold for admin approval. We will email you once it is cancelled. Any online payment refund starts after approval.</p>
        </div>
      )}
      {awaitingPayment && !cancellationRequested && confirming && (
        <div role="status" className="mb-8 border border-sky-200 bg-sky-50 px-5 py-4 text-sky-900">
          <p className="font-semibold">Confirming your payment…</p>
          <p className="mt-1 text-sm">Your payment was received and we are confirming it with the bank. Please don&apos;t pay again; this page updates on its own.</p>
        </div>
      )}
      {awaitingPayment && !cancellationRequested && !confirming && (
        <div className="mb-8 border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900">
          <p className="font-semibold">Your order is waiting for payment.</p>
          <p className="mt-1 text-sm">{paymentIssue ? `${paymentIssue} ` : ''}We are holding your items for 30 minutes. Complete the payment to confirm the order, or request cancellation.</p>
          <button type="button" onClick={completePayment} disabled={paying} className="btn-primary mt-4">{paying ? 'Opening secure payment…' : `Complete payment of ${rupees(order.total_amount)}`}</button>
        </div>
      )}
      {!awaitingPayment && paymentIssue && order.payment_status === 'failed' && (
        <p className="mb-8 border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">This order was cancelled because the payment was not completed in time. No money was taken; if anything was deducted it will be refunded automatically.</p>
      )}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl">{order.order_number}</h1>
          <p className="text-muted text-sm mt-1">Placed on {longDate(order.created_at)}</p>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full ${ORDER_STATUS_COLORS[order.status] || ''}`}>{ORDER_STATUS_LABELS[order.status] || order.status}</span>
      </div>

      <div className="border border-sand p-4 sm:p-6 mb-6">
        <h2 className="font-medium mb-4">Items</h2>
        <div className="divide-y divide-sand">
          {order.items.map((item) => (
            <div key={item.id} className="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-4 gap-y-2 py-3 sm:flex">
              <div className="h-20 w-16 bg-sand/40 overflow-hidden shrink-0">
                {item.product_image && <img src={item.product_image} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="product-name font-medium text-sm">{item.product_name}</p>
                <p className="text-xs text-muted">Size: {item.size} · Qty: {item.quantity}</p>
              </div>
              <p className="col-start-2 font-medium text-sm">₹{(item.price * item.quantity).toLocaleString('en-IN')}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-sand mt-4 pt-4 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted">Subtotal</span><span>{rupees(order.items_total)}</span></div>
          {Number(order.discount_amount) > 0 && (
            <div className="flex justify-between text-green-700">
              <span>Coupon {order.coupon_code ? `(${order.coupon_code})` : ''}</span>
              <span>&minus;{rupees(order.discount_amount)}</span>
            </div>
          )}
          <div className="flex justify-between"><span className="text-muted">Shipping</span><span>{Number(order.shipping_fee) === 0 ? 'Free' : rupees(order.shipping_fee)}</span></div>
          <div className="flex justify-between font-semibold text-base pt-2 border-t border-sand"><span>Total</span><span>{rupees(order.total_amount)}</span></div>
          <div className="flex justify-between pt-1"><span className="text-muted">Payment</span><span>{PAYMENT_STATUS_LABELS[order.payment_status] || (isOnline ? 'Online' : 'Cash on delivery')}</span></div>
        </div>
      </div>

      {refunds.length > 0 && (
        <div className="border border-sand p-4 sm:p-6 mb-6">
          <h2 className="font-medium mb-3">Refunds</h2>
          <ul className="space-y-2 text-sm">
            {refunds.map((refund) => (
              <li key={refund.id} className="flex flex-wrap justify-between gap-2">
                <span>{rupees(refund.amount)} · {refund.method === 'razorpay' ? 'to your original payment method' : 'sent to you directly'}</span>
                <span className={refund.status === 'processed' ? 'text-green-700' : 'text-muted'}>{refund.status === 'processed' ? `Refunded ${longDate(refund.created_at)}` : 'Processing (5–7 working days)'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

        <section id="returns" ref={returnsSection} tabIndex={-1} aria-labelledby="returns-heading" className="scroll-mt-24 border border-sand p-4 sm:p-6 mb-6">
          <h2 id="returns-heading" className="font-medium">Returns &amp; exchanges</h2>
          {order.status !== 'delivered' && <p className="mt-3 text-sm text-muted">{order.status === 'cancelled' ? 'This order was cancelled and cannot be returned or exchanged.' : 'You can request a return or exchange after your order is delivered. You will have 30 days from delivery, and both options require admin approval.'}</p>}
          {order.status === 'delivered' && refundable <= 0 && <p className="mt-3 text-sm text-muted">This order has already been fully refunded.</p>}
          {order.status === 'delivered' && !deliveryDateConfirmed && <p className="mt-3 text-sm text-muted">Please <Link to="/contact" className="underline">contact support</Link> to confirm your delivery date for a return or exchange.</p>}
          {order.status === 'delivered' && deliveryDateConfirmed && Date.now() > returnDeadline.getTime() && <p className="mt-3 text-sm text-muted">The 30-day return and exchange window ended on {longDate(returnDeadline)}.</p>}
          {returns.map((request) => (
            <div key={request.id} className="mt-3 text-sm">
              <p><span className="font-medium">{(request.request_type === 'exchange' ? EXCHANGE_STATUS_LABELS : RETURN_STATUS_LABELS)[request.status] || request.status}</span> · {request.reason} · {longDate(request.created_at)}</p>
              {request.status === 'requested' && <p className="mt-1 text-amber-800">Awaiting admin approval. We will email you after review.</p>}
              {request.exchange_details && <p className="mt-1 text-muted">Requested replacement: {request.exchange_details}</p>}
              <ReturnPhotos request={request} />
              {request.admin_note && <p className="mt-1 text-muted">Note from Koorm: {request.admin_note}</p>}
            </div>
          ))}
          {canRequestReturn && (showReturnForm
            ? <ReturnForm orderId={order.id} requestType={showReturnForm} onDone={() => { setShowReturnForm(false); setToast('Request submitted. Awaiting admin approval. We will email you after review.'); load(); }} />
            : <div className="mt-3 text-sm text-muted"><p>You have 30 days from delivery to request a return or exchange, until {longDate(returnDeadline)}. Both require admin approval.</p><div className="mt-3 flex flex-wrap gap-4"><button type="button" onClick={() => setShowReturnForm('return')} className="font-semibold text-ink underline underline-offset-4">Request a return</button><button type="button" onClick={() => setShowReturnForm('exchange')} className="font-semibold text-ink underline underline-offset-4">Request an exchange</button></div></div>)}
        </section>

      <div className="border border-sand p-6 mb-6">
        <h2 className="font-medium mb-2">Shipping Address</h2>
        <p className="text-sm text-muted leading-relaxed">
          {order.shipping_name} · {order.shipping_phone}<br />
          {order.shipping_address_line1}{order.shipping_address_line2 ? `, ${order.shipping_address_line2}` : ''}<br />
          {order.shipping_city}, {order.shipping_state} - {order.shipping_pincode}
        </p>
      </div>

      {actionError && <p role="alert" className="mb-4 text-sm text-red-600">{actionError}</p>}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Link to="/profile" className="btn-outline">Back to Orders</Link>
        {canCancel && (
          <button onClick={cancelOrder} disabled={cancelling || paying} className="btn-outline">
            {cancelling ? 'Requesting...' : 'Request Cancellation'}
          </button>
        )}
      </div>
      {canCancel && ['paid', 'partially_refunded'].includes(order.payment_status) && (
        <p className="mt-3 text-xs text-muted">After admin approval, your order will be cancelled and your payment refunded to your original payment method.</p>
      )}
    </div>
  );
}
