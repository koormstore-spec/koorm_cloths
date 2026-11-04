import { useCallback, useEffect, useState } from 'react';
import api from '../../api/adminAxios';
import AdminLayout from '../../components/AdminLayout';
import Loader from '../../components/Loader';
import ReturnPhotos from '../../components/ReturnPhotos';
import { ReturnIcon } from '../../components/Icons';
import { AdminNotice, AdminEmpty, StatusBadge, money, dateLabel } from '../../components/admin/AdminUI';
import RefundForm from '../../components/admin/RefundForm';
import { PAYMENT_STATUS_LABELS } from '../../lib/orderStatus';

const ACTION_LABELS = { approve: 'Approve', reject: 'Decline', receive: 'Mark received', exchange: 'Mark exchange completed' };
const SUCCESS = {
  approve: 'approved. The customer has been emailed to pack the items.',
  reject: 'declined. The customer has been emailed.',
  receive: 'marked as received.',
  refund: 'refunded. The customer has been emailed.',
  exchange: 'marked as exchanged.',
};

function ReturnCard({ request, onAction }) {
  const [note, setNote] = useState('');
  const [restock, setRestock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [error, setError] = useState('');

  const act = async (action, extra = {}) => {
    setBusy(true); setError('');
    try {
      await onAction(request, action, { admin_note: note, ...extra });
    } catch (err) {
      setError(err.response?.data?.message || 'This return could not be updated. Please try again.');
      setBusy(false);
      throw err;
    }
  };

  const isExchange = request.request_type === 'exchange';
  const actions = { requested: ['approve', 'reject'], approved: ['receive', 'reject'], received: isExchange ? ['exchange'] : [] }[request.status] || [];
  const canRefund = !isExchange && ['approved', 'received'].includes(request.status);
  const order = { ...request, id: request.order_id };

  return <article className="rounded-xl border border-sand bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-sm font-semibold">{request.order_number}</h2><p className="mt-1 text-xs text-muted">{request.customer_name} · {request.customer_email}</p><p className="mt-1 text-[11px] text-muted">Requested {dateLabel(request.created_at)}{request.delivered_at ? ` · delivered ${dateLabel(request.delivered_at)}` : ''}</p></div>
      <StatusBadge status={request.status} />
    </div>
    <div className="mt-4 space-y-1 border-t border-sand pt-4 text-sm">
      <p className="font-semibold">{isExchange ? 'Exchange' : 'Return'}{request.status === 'requested' ? ' · Awaiting admin approval' : ''}</p>
      <p><span className="text-muted">Reason:</span> {request.reason}</p>
      {request.exchange_details && <p><span className="text-muted">Requested replacement:</span> {request.exchange_details}</p>}
      {request.note && <p><span className="text-muted">Customer note:</span> {request.note}</p>}
      <ReturnPhotos request={request} admin />
      <p className="text-xs text-muted">{(request.items || []).map(item => `${item.product_name} (${item.size}) × ${item.quantity}`).join(', ')}</p>
      <p className="text-xs text-muted">Order total {money(request.total_amount)} · {PAYMENT_STATUS_LABELS[request.payment_status] || 'Cash on delivery'}{Number(request.refunded_amount) > 0 ? ` · ${money(request.refunded_amount)} refunded` : ''}</p>
      {request.admin_note && <p className="text-xs"><span className="text-muted">Your note:</span> {request.admin_note}</p>}
    </div>
    {(actions.length > 0 || canRefund) && <div className="mt-4 space-y-3">
      {actions.length > 0 && <label className="block text-[11px] font-medium text-muted">Note to the customer (optional)<input value={note} maxLength={1000} onChange={event => setNote(event.target.value)} className="input-field mt-1 min-h-11 rounded-lg px-3 py-2 text-sm" placeholder="For example, pickup details" /></label>}
      {actions.includes('receive') && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={restock} onChange={event => setRestock(event.target.checked)} /> Put the items back in stock</label>}
      {actions.includes('exchange') && <p className="text-xs text-muted">Arrange the replacement and update its stock separately before marking this exchange completed. Add delivery details in the customer note.</p>}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {actions.map(action => <button key={action} type="button" disabled={busy} onClick={() => act(action, action === 'receive' ? { restock } : {}).catch(() => {})} className={action === 'reject' ? 'admin-secondary' : 'admin-primary'}>{ACTION_LABELS[action]}</button>)}
        {canRefund && !refunding && <button type="button" disabled={busy} onClick={() => setRefunding(true)} className="admin-primary">Refund</button>}
      </div>
      {refunding && <RefundForm order={order} askReason={false} submitLabel="Refund and close return" onCancel={() => setRefunding(false)} onSubmit={values => act('refund', values)} />}
    </div>}
  </article>;
}

export default function AdminReturns() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try { const { data } = await api.get('/returns/admin'); setRequests(data); setHasLoaded(true); }
    catch { setError('We couldn’t load return and exchange requests. Please try again.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    load();
    const refresh = () => load(false);
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [load]);

  const handleAction = async (request, action, values) => {
    setNotice('');
    const { data } = await api.put(`/returns/admin/${request.id}`, { action, ...values });
    const status = data.status || { approve: 'approved', reject: 'rejected', receive: 'received', refund: 'refunded', exchange: 'exchanged' }[action];
    setRequests(current => current.map(item => item.id === request.id ? { ...item, status } : item));
    setNotice(`${request.request_type === 'exchange' ? 'Exchange' : 'Return'} for ${request.order_number} ${SUCCESS[action]}`);
    await load();
  };

  const open = requests.filter(request => ['requested', 'approved', 'received'].includes(request.status));
  const closed = requests.filter(request => !open.includes(request));
  const pending = requests.filter(request => request.status === 'requested').length;

  return <AdminLayout title="Returns & exchanges" description="Approve or decline customer requests, then arrange the return or replacement." returnCount={hasLoaded ? pending : undefined} actions={<button type="button" onClick={load} disabled={loading} className="admin-secondary"><ReturnIcon width={15} height={15} />Refresh</button>}>
    {pending > 0 && <div className="mb-5"><AdminNotice success>{pending} return or exchange request(s) awaiting approval.</AdminNotice></div>}
    {error && <div className="mb-5"><AdminNotice onRetry={load}>{error}</AdminNotice></div>}
    {notice && <div className="mb-5"><AdminNotice success>{notice}</AdminNotice></div>}
    {loading ? <div className="admin-panel py-16"><Loader /></div> : !requests.length ? (!error && <section className="admin-panel"><AdminEmpty title="No return or exchange requests" description="When a customer asks to return or exchange a delivered order, it will appear here." /></section>) : <div className="space-y-8">
      <section><h2 className="mb-3 text-sm font-semibold">Needs attention ({open.length})</h2>{open.length ? <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{open.map(request => <ReturnCard key={request.id} request={request} onAction={handleAction} />)}</div> : <p className="text-sm text-muted">Nothing waiting. Nice work.</p>}</section>
      {closed.length > 0 && <section><h2 className="mb-3 text-sm font-semibold">Closed</h2><div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{closed.map(request => <ReturnCard key={request.id} request={request} onAction={handleAction} />)}</div></section>}
    </div>}
  </AdminLayout>;
}
