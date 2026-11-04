import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../api/adminAxios';
import AdminLayout from '../../components/AdminLayout';
import Loader from '../../components/Loader';
import { ReturnIcon } from '../../components/Icons';
import { AdminNotice, AdminEmpty, AdminSearch, AdminPagination, StatusBadge, ORDER_STATUSES, money, dateLabel } from '../../components/admin/AdminUI';
import RefundForm, { refundableAmount } from '../../components/admin/RefundForm';
import { PAYMENT_STATUS_LABELS } from '../../lib/orderStatus';
import { paymentMethodLabel } from '../../lib/paymentDetails';

const PAGE_SIZE = 10;
const FILTER_STATUSES = ['cancellation_requested', 'pending_payment', ...ORDER_STATUSES];
const isPaidOnline = (order) => order.payment_method === 'ONLINE' && ['paid', 'partially_refunded'].includes(order.payment_status);
// Online payments can be refunded any time; cash is only collected on delivery.
const canRefund = (order) => refundableAmount(order) > 0 && (isPaidOnline(order) || (order.payment_method !== 'ONLINE' && order.status === 'delivered'));

export default function AdminOrders() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('search') || '';
  const filter = searchParams.get('status') || '';
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState({});
  const [page, setPage] = useState(1);
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [refundingId, setRefundingId] = useState(null);
  const cancellationRequests = orders.filter(order => order.cancellation_status === 'requested');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const { data } = await api.get('/orders/admin/all'); setOrders(data); }
    catch { setError('We couldn’t load your orders. Please try again.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const updateFilter = (key, value) => { const next = new URLSearchParams(searchParams); if (value) next.set(key, value); else next.delete(key); setSearchParams(next, { replace: true }); setPage(1); };
  const filtered = orders.filter(order => (!filter || (filter === 'cancellation_requested' ? order.cancellation_status === 'requested' : order.status === filter)) && `${order.order_number} ${order.customer_name} ${order.customer_email}`.toLowerCase().includes(query.toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const changeStatus = async (order, status) => {
    setSaving(value => ({ ...value, [order.id]: true })); setError(''); setNotice(''); setConfirmCancel(null);
    try {
      const { data } = await api.put(`/orders/admin/${order.id}/status`, { status });
      if (status === 'cancelled') {
        // Cancelling restocks and may refund, so reload the payment details.
        await load();
        setNotice(`${order.order_number}: ${data.message}`);
        if (data.refundError) setError(`The refund could not be started automatically (${data.refundError}). Use Refund to try again.`);
      } else {
        setOrders(value => value.map(item => item.id === order.id ? { ...item, status } : item));
        setNotice(`${order.order_number} is now ${status}.`);
      }
    } catch (err) { setError(err.response?.data?.message || 'The order status could not be updated. Please try again.'); }
    finally { setSaving(value => ({ ...value, [order.id]: false })); }
  };
  const requestStatus = (order, status) => (status === 'cancelled' ? setConfirmCancel(order) : changeStatus(order, status));

  const refund = async (order, values) => {
    const { data } = await api.post(`/orders/admin/${order.id}/refund`, values);
    setRefundingId(null);
    setNotice(`${order.order_number}: refund of ${money(data.refund.amount)} ${data.refund.method === 'razorpay' ? 'started to the customer’s original payment method' : 'recorded'}.`);
    await load();
  };

  const statusControl = order => {
    if (order.cancellation_status === 'requested') {
      return <div className="text-xs text-amber-900"><p className="font-semibold">Cancellation requested</p><p className="mt-1">Hold packing and shipping until approved.</p><button type="button" disabled={saving[order.id]} onClick={() => setConfirmCancel(order)} className="admin-primary mt-3">Approve cancellation</button></div>;
    }
    if (order.status === 'pending_payment') {
      return <div className="text-[11px] text-muted"><p>Waiting for online payment. Unpaid orders cancel themselves after 30 minutes.</p><button type="button" disabled={saving[order.id]} onClick={() => setConfirmCancel(order)} className="mt-2 font-semibold text-red-700 underline underline-offset-4">Cancel now</button></div>;
    }
    if (order.status === 'cancelled') return <p className="text-[11px] text-muted">Cancelled orders can’t be reopened.</p>;
    return <label className="block text-[10px] font-medium text-muted">{saving[order.id] ? 'Saving status…' : 'Update status'}<select aria-label={`Status for ${order.order_number}`} disabled={saving[order.id]} value={order.status} onChange={event => requestStatus(order, event.target.value)} className="input-field mt-1 min-h-11 rounded-lg px-3 py-2 text-xs capitalize disabled:opacity-50">{ORDER_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}</select></label>;
  };

  const paymentSummary = order => <div className="text-xs">
    <p className="font-medium">{PAYMENT_STATUS_LABELS[order.payment_status] || 'Cash on delivery'}</p>
    {order.payment_method === 'ONLINE' && order.razorpay_payment_id && <Link to={`/admin/payments?search=${encodeURIComponent(order.order_number)}`} className="mt-1 block max-w-[14rem] truncate text-[11px] text-accent underline underline-offset-4">{paymentMethodLabel(order.payment_details) || 'Payment details'}</Link>}
    {(order.refunds || []).filter(item => item.status !== 'failed').map(item => <p key={item.id} className="mt-1 text-muted">Refund {money(item.amount)} · {item.status === 'processed' ? 'done' : 'processing'}{item.reference ? ` · ref ${item.reference}` : ''}</p>)}
    {canRefund(order) && refundingId !== order.id && <button type="button" onClick={() => setRefundingId(order.id)} className="mt-2 font-semibold text-accent underline underline-offset-4">Refund</button>}
  </div>;
  const refundPanel = order => refundingId === order.id && <RefundForm order={order} onSubmit={values => refund(order, values)} onCancel={() => setRefundingId(null)} />;

  return <AdminLayout cancellationCount={cancellationRequests.length} title="Customer orders" description="From the first order to the doorstep. Keep every customer up to date." actions={<button type="button" onClick={load} disabled={loading || Object.values(saving).some(Boolean)} className="admin-secondary"><ReturnIcon width={15} height={15} />Refresh orders</button>}>
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">{[{ label: 'All orders', count: orders.length }, { label: 'To prepare', count: orders.filter(order => ['placed', 'processing'].includes(order.status)).length }, { label: 'Shipped', count: orders.filter(order => order.status === 'shipped').length }, { label: 'Delivered', count: orders.filter(order => order.status === 'delivered').length }].map(item => <div key={item.label} className="admin-stat"><p className="text-xs text-muted">{item.label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{loading ? '—' : item.count}</p></div>)}</div>
    {confirmCancel && <div role="alertdialog" aria-labelledby="cancel-title" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
      <p id="cancel-title" className="font-semibold">{confirmCancel.cancellation_status === 'requested' ? 'Approve cancellation of' : 'Cancel'} {confirmCancel.order_number}?</p>
      <p className="mt-1">Its items go back into stock{isPaidOnline(confirmCancel) ? ` and ${money(refundableAmount(confirmCancel))} is refunded to the customer’s original payment method. This can’t be undone.` : '.'}</p>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => changeStatus(confirmCancel, 'cancelled')} className="admin-primary">{confirmCancel.cancellation_status === 'requested' ? 'Approve and cancel order' : 'Cancel order'}</button><button type="button" onClick={() => setConfirmCancel(null)} className="admin-secondary">Go back</button></div>
    </div>}
    {error && <div className="mb-5"><AdminNotice onRetry={!orders.length ? load : undefined}>{error}</AdminNotice></div>}
    {notice && <div className="mb-5"><AdminNotice success>{notice}</AdminNotice></div>}
    {cancellationRequests.length > 0 && <div role="status" className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p>{cancellationRequests.length} cancellation request(s) awaiting approval.</p><button type="button" onClick={() => { setSearchParams({ status: 'cancellation_requested' }); setPage(1); }} className="mt-2 font-semibold underline underline-offset-4">Review cancellation requests</button></div>}
    <section className="admin-panel"><div className="flex flex-col gap-3 border-b border-sand p-4 sm:flex-row sm:px-6"><AdminSearch value={query} onChange={value => updateFilter('search', value)} placeholder="Search orders or customers" /><select aria-label="Filter order status" value={filter} onChange={event => updateFilter('status', event.target.value)} className="input-field min-h-11 rounded-lg py-2 sm:w-auto"><option value="">All statuses</option>{FILTER_STATUSES.map(status => <option key={status} value={status}>{status === 'cancellation_requested' ? 'Cancellation requested' : status === 'pending_payment' ? 'Awaiting payment' : status.charAt(0).toUpperCase() + status.slice(1)}</option>)}</select>{(query || filter) && <button type="button" className="admin-secondary" onClick={() => { setSearchParams({}); setPage(1); }}>Clear filters</button>}</div>
      {loading ? <div className="py-16"><Loader /></div> : !orders.length && error ? null : !visible.length ? <AdminEmpty title={orders.length ? 'No matching orders' : 'No orders just yet'} description={orders.length ? 'Try another order number, customer, or status.' : 'New customer orders will appear here, ready for you to manage.'} /> : <>
        <div className="grid grid-cols-1 gap-4 bg-[#fafbf8] p-4 md:grid-cols-2 xl:hidden">{visible.map(order => <article key={order.id} className="rounded-xl border border-sand bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="text-xs font-semibold">{order.order_number}</h2><p className="mt-1 text-[11px] text-muted">{dateLabel(order.created_at)}</p></div><StatusBadge status={order.status} /></div><div className="my-4 border-y border-sand py-4"><p className="text-sm font-medium">{order.customer_name}</p><p className="mt-1 text-xs text-muted">{order.customer_email}</p><p className="mt-3 text-lg font-semibold">{money(order.total_amount)}</p><div className="mt-2">{paymentSummary(order)}</div>{refundPanel(order)}</div>{statusControl(order)}</article>)}</div>
        <div className="hidden overflow-x-auto xl:block"><table className="admin-table"><thead><tr><th scope="col">Order</th><th scope="col">Customer</th><th scope="col">Total</th><th scope="col">Payment</th><th scope="col">Status</th><th scope="col">Manage</th></tr></thead><tbody>{visible.map(order => <Fragment key={order.id}><tr><td><p className="text-xs font-semibold">{order.order_number}</p><p className="mt-1 text-[11px] text-muted">{dateLabel(order.created_at)}</p></td><td><p className="text-sm font-medium">{order.customer_name}</p><p className="mt-1 max-w-[16rem] text-xs text-muted">{order.customer_email}</p></td><td className="whitespace-nowrap font-semibold">{money(order.total_amount)}</td><td className="min-w-[10rem]">{paymentSummary(order)}</td><td><StatusBadge status={order.status} /></td><td className="min-w-[10rem]">{statusControl(order)}</td></tr>{refundingId === order.id && <tr><td colSpan={6}>{refundPanel(order)}</td></tr>}</Fragment>)}</tbody></table></div>
        <AdminPagination page={currentPage} pages={pages} total={filtered.length} count={visible.length} pageSize={PAGE_SIZE} onChange={setPage} />
      </>}
    </section>
  </AdminLayout>;
}
