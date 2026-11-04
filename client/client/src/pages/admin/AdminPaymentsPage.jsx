import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../api/adminAxios';
import AdminLayout from '../../components/AdminLayout';
import Loader from '../../components/Loader';
import { CashIcon } from '../../components/Icons';
import { AdminIcon, AdminNotice, AdminEmpty, AdminSearch, AdminPagination, money } from '../../components/admin/AdminUI';
import { PAYMENT_STATUS_LABELS } from '../../lib/orderStatus';
import { paymentMethodLabel, methodName, bankName, capitalize, razorpayDashboardUrl } from '../../lib/paymentDetails';

const PAGE_SIZE = 10;
const STATUS_FILTERS = ['paid', 'partially_refunded', 'refunded', 'pending', 'failed'];
const STATUS_CLASSES = {
  paid: 'admin-status-delivered', partially_refunded: 'admin-status-processing', refunded: 'admin-status-shipped',
  pending: 'admin-status-low-stock', failed: 'admin-status-cancelled',
};
const REFUND_STATUS = { pending: 'In progress', processed: 'Completed', failed: 'Failed' };

const dateTime = (value) => (value ? new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

function PaymentBadge({ status }) {
  return <span className={`admin-status ${STATUS_CLASSES[status] || 'border-sand bg-sand/30 text-muted'}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{PAYMENT_STATUS_LABELS[status] || status}</span>;
}

function Stat({ label, value, detail, featured }) {
  return <div className={`admin-stat ${featured ? 'border-[#d7e0ce] bg-[#e9eedf]' : ''}`}><p className="text-xs font-medium text-muted">{label}</p><p className="admin-stat-value">{value}</p><p className="mt-2 text-[10px] leading-5 text-muted">{detail}</p></div>;
}

// A label/value list; rows without a value are left out.
function Fields({ title, rows }) {
  const shown = rows.filter(([, value]) => value !== null && value !== undefined && value !== '');
  return <section className="min-w-0"><h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{title}</h3>
    {shown.length === 0 ? <p className="text-xs text-muted">Not available.</p> : <dl className="space-y-2 text-xs">{shown.map(([label, value]) => <div key={label} className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-2"><dt className="text-muted">{label}</dt><dd className="break-words font-medium">{value}</dd></div>)}</dl>}
  </section>;
}

const mono = (value) => (value ? <span className="select-all font-mono text-[11px]">{value}</span> : null);

function PaymentDetails({ payment, refreshing, onRefresh }) {
  const d = payment.payment_details;
  const card = d?.card;
  const net = d?.fee != null ? Number(payment.total_amount) - Number(d.fee) : null;
  return <div className="border-t border-sand bg-[#fafbf8] p-4 sm:p-6">
    {!d && payment.razorpay_payment_id && <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Payment details have not been saved for this order yet. Fetch them from Razorpay to see how the customer paid.</p>}
    <div className="grid gap-7 md:grid-cols-2 xl:grid-cols-3">
      <Fields title="Payment" rows={[
        ['Amount', money(payment.total_amount)],
        ['Status', PAYMENT_STATUS_LABELS[payment.payment_status] || payment.payment_status],
        ['Method', d ? paymentMethodLabel(d) : null],
        ['Paid on', payment.paid_at ? dateTime(payment.paid_at) : null],
        ['Razorpay fee', d?.fee != null ? `${money(d.fee)}${d.tax ? ` (incl. ${money(d.tax)} GST)` : ''}` : null],
        ['Net to you', net != null ? money(net) : null],
        ['Refunded', Number(payment.refunded_amount) > 0 ? money(payment.refunded_amount) : null],
        ['Payment ID', mono(payment.razorpay_payment_id)],
        ['Razorpay order', mono(payment.razorpay_order_id)],
      ]} />
      <Fields title="Payer account" rows={[
        ['Customer', payment.customer_name],
        ['Store account', payment.customer_email],
        ['Paid with email', d?.email && d.email !== payment.customer_email ? d.email : null],
        ['Phone', d?.contact || payment.shipping_phone],
        ['Payment type', d ? methodName(d.method) : null],
        ['UPI ID', d?.vpa],
        ['Name on card', card?.name],
        ['Card', card ? [card.network, capitalize(card.type)].filter(Boolean).join(' ') || null : null],
        ['Card number', card?.last4 ? `•••• •••• •••• ${card.last4}` : null],
        ['Issuing bank', card?.issuer ? bankName(card.issuer) : null],
        ['Bank', d?.bank ? bankName(d.bank) : null],
        ['Wallet', d?.wallet ? capitalize(d.wallet) : null],
        ['International', card?.international || d?.international ? 'Yes' : null],
        ['Ships to', [payment.shipping_city, payment.shipping_state].filter(Boolean).join(', ') || null],
      ]} />
      <div className="space-y-7 md:col-span-2 xl:col-span-1">
        <Fields title="Bank reference" rows={[
          ['Bank RRN', mono(d?.reference?.rrn)],
          ['UPI transaction', mono(d?.reference?.upi_transaction_id)],
          ['Bank transaction', mono(d?.reference?.bank_transaction_id)],
          ['Auth code', mono(d?.reference?.auth_code)],
        ]} />
        {payment.refunds.length > 0 && <section><h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Refunds</h3><ul className="space-y-2 text-xs">{payment.refunds.map(refund => <li key={refund.id} className="rounded-lg border border-sand bg-white p-3"><p className="flex justify-between gap-2 font-semibold"><span>{money(refund.amount)}</span><span className={refund.status === 'failed' ? 'text-red-700' : 'text-muted'}>{REFUND_STATUS[refund.status] || refund.status}</span></p><p className="mt-1 text-muted">{dateTime(refund.created_at)}{refund.reason ? ` · ${refund.reason}` : ''}</p>{refund.reference && <p className="mt-1">{mono(refund.reference)}</p>}</li>)}</ul></section>}
      </div>
    </div>
    <div className="mt-6 flex flex-wrap gap-2 border-t border-sand pt-5">
      {payment.razorpay_payment_id && <button type="button" className="admin-secondary" disabled={refreshing} onClick={onRefresh}>{refreshing ? 'Fetching…' : 'Fetch latest from Razorpay'}</button>}
      {payment.razorpay_payment_id && <a href={razorpayDashboardUrl(payment.razorpay_payment_id)} target="_blank" rel="noreferrer" className="admin-secondary">Open in Razorpay <AdminIcon type="external" width={14} height={14} /></a>}
      <Link to={`/admin/orders?search=${encodeURIComponent(payment.order_number)}`} className="admin-secondary">View order</Link>
    </div>
  </div>;
}

export default function AdminPaymentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('search') || '';
  const filter = searchParams.get('status') || '';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const [refreshingId, setRefreshingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const { data: body } = await api.get('/admin/payments'); setData(body); }
    catch { setError('We couldn’t load payments. Please try again.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const refresh = async (payment) => {
    setRefreshingId(payment.id); setError(''); setNotice('');
    try {
      const { data: body } = await api.post(`/admin/payments/${payment.id}/refresh`);
      setData(value => ({ ...value, payments: value.payments.map(item => item.id === payment.id ? { ...item, payment_details: body.payment_details } : item) }));
      setNotice(`${payment.order_number}: payment details updated from Razorpay.`);
    } catch (err) { setError(err.response?.data?.message || 'Razorpay could not be reached. Please try again.'); }
    finally { setRefreshingId(null); }
  };

  const updateFilter = (key, value) => { const next = new URLSearchParams(searchParams); if (value) next.set(key, value); else next.delete(key); setSearchParams(next, { replace: true }); setPage(1); };
  const payments = data?.payments || [];
  const needle = query.toLowerCase();
  const filtered = payments.filter(payment => (!filter || payment.payment_status === filter) && [
    payment.order_number, payment.customer_name, payment.customer_email, payment.shipping_phone, payment.razorpay_payment_id,
    payment.payment_details?.vpa, payment.payment_details?.contact, payment.payment_details?.email, payment.payment_details?.card?.last4,
  ].filter(Boolean).join(' ').toLowerCase().includes(needle));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const summary = data?.summary;

  const modeBadge = data?.mode && <span className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-xs font-semibold ${data.mode === 'live' ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>{data.mode === 'live' ? 'Razorpay live' : 'Razorpay test mode'}</span>;

  return <AdminLayout title="Payments" description="Every online payment, how the customer paid, and where the money went." actions={modeBadge}>
    {notice && <div className="mb-4"><AdminNotice success>{notice}</AdminNotice></div>}
    {error && <div className="mb-4"><AdminNotice onRetry={data ? undefined : load}>{error}</AdminNotice></div>}
    {data?.mode === 'test' && <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">Test mode is on: these payments use Razorpay test keys and no real money moved. Switch to live keys in the server settings to accept real payments.</p>}
    {loading && !data ? <div className="admin-panel py-16"><Loader /></div> : data && <>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Collected" value={money(summary.collected)} detail={`${summary.count} paid online`} featured />
        <Stat label="Refunded" value={money(summary.refunded)} detail="Returned to customers" />
        <Stat label="Razorpay fees" value={money(summary.fees)} detail="Incl. GST, where known" />
        <Stat label="Net received" value={money(summary.net)} detail="After refunds and fees" />
      </div>
      <section className="admin-panel">
        <div className="flex flex-col gap-3 border-b border-sand p-4 sm:flex-row sm:px-6">
          <AdminSearch value={query} onChange={value => updateFilter('search', value)} placeholder="Search order, customer, UPI ID, payment ID" />
          <select aria-label="Filter payment status" value={filter} onChange={event => updateFilter('status', event.target.value)} className="input-field min-h-11 rounded-lg py-2 sm:w-auto"><option value="">All payments</option>{STATUS_FILTERS.map(status => <option key={status} value={status}>{PAYMENT_STATUS_LABELS[status]}</option>)}</select>
          {(query || filter) && <button type="button" className="admin-secondary" onClick={() => { setSearchParams({}); setPage(1); }}>Clear filters</button>}
        </div>
        {filtered.length === 0 ? <AdminEmpty title={payments.length ? 'No payments match' : 'No online payments yet'} description={payments.length ? 'Try a different search or status.' : 'Payments made through Razorpay at checkout will appear here.'} /> : <>
          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_7rem_9.5rem_2.75rem] gap-4 border-b border-sand px-6 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted lg:grid"><span>Order</span><span>Customer</span><span>Paid with</span><span className="text-right">Amount</span><span>Status</span><span /></div>
          <ul className="divide-y divide-sand">{visible.map(payment => {
            const open = openId === payment.id;
            const method = paymentMethodLabel(payment.payment_details);
            return <li key={payment.id}>
              <button type="button" aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} payment details for ${payment.order_number}`} onClick={() => setOpenId(open ? null : payment.id)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-4 text-left transition-colors hover:bg-cream sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_7rem_9.5rem_2.75rem]">
                <span className="min-w-0"><span className="block text-xs font-semibold">{payment.order_number}</span><span className="mt-1 block text-[11px] text-muted">{dateTime(payment.paid_at || payment.created_at)}</span></span>
                <span className="text-right text-sm font-semibold tabular-nums lg:hidden">{money(payment.total_amount)}</span>
                <span className="col-span-2 min-w-0 lg:col-span-1"><span className="block truncate text-sm font-medium">{payment.customer_name}</span><span className="mt-1 block truncate text-xs text-muted">{payment.customer_email}</span></span>
                <span className="col-span-2 min-w-0 truncate text-xs lg:col-span-1">{method || <span className="text-muted">{payment.razorpay_payment_id ? 'Details not fetched' : 'No payment yet'}</span>}</span>
                <span className="hidden text-right text-sm font-semibold tabular-nums lg:block">{money(payment.total_amount)}</span>
                <span><PaymentBadge status={payment.payment_status} /></span>
                <span className="flex h-9 w-9 items-center justify-center justify-self-end rounded-lg text-muted"><AdminIcon type="chevron" className={`transition-transform ${open ? 'rotate-90' : ''}`} width={16} height={16} /></span>
              </button>
              {open && <PaymentDetails payment={payment} refreshing={refreshingId === payment.id} onRefresh={() => refresh(payment)} />}
            </li>;
          })}</ul>
          <AdminPagination page={currentPage} pages={pages} total={filtered.length} count={visible.length} pageSize={PAGE_SIZE} onChange={setPage} />
        </>}
      </section>
      {!data.online && <p className="mt-4 flex items-center gap-2 text-xs text-muted"><CashIcon width={16} height={16} /> Online payments are switched off because no Razorpay keys are set on the server.</p>}
    </>}
  </AdminLayout>;
}
