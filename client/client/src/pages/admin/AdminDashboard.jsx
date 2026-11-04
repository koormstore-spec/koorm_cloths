import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import adminApi from '../../api/adminAxios';
import AdminLayout from '../../components/AdminLayout';
import Loader from '../../components/Loader';
import { CashIcon, UserIcon, PlusIcon, ChevronRightIcon, ReturnIcon } from '../../components/Icons';
import { AdminIcon, AdminNotice, AdminEmpty, StatusBadge, ORDER_STATUSES, money, dateLabel } from '../../components/admin/AdminUI';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const { data } = await adminApi.get('/admin/stats'); setStats(data); }
    catch { setError('We couldn’t load your store overview. Please try again.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const recent = stats?.recentOrders || [];

  return <AdminLayout title="Store overview" description="A little perspective on your store. Everything you need to keep it moving." actions={<><button onClick={load} disabled={loading} className="admin-secondary"><ReturnIcon width={15} height={15} />Refresh</button><Link to="/admin/products/new" className="admin-primary"><PlusIcon width={16} height={16} />Add product</Link></>}>
    {error ? <AdminNotice onRetry={load}>{error}</AdminNotice> : loading ? <div className="admin-panel py-16"><Loader /></div> : stats && <>
      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-5">
        <Stat label="Total orders" value={Number(stats.totalOrders).toLocaleString('en-IN')} detail="All orders received" icon={<AdminIcon type="orders" />} />
        <Stat label="Order value" value={money(stats.totalRevenue)} detail="Excludes cancelled orders" icon={<CashIcon />} featured />
        <Stat label="Products" value={Number(stats.totalProducts).toLocaleString('en-IN')} detail="In your collection" icon={<AdminIcon type="products" />} />
        <Stat label="Customers" value={Number(stats.totalCustomers).toLocaleString('en-IN')} detail="Registered accounts" icon={<UserIcon />} />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <section className="admin-panel"><div className="admin-panel-heading"><div><h2 className="admin-panel-title">Recent orders</h2><p className="mt-1 text-xs text-muted">The latest activity in your store</p></div><Link to="/admin/orders" className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-accent">View all orders <ChevronRightIcon width={14} height={14} /></Link></div>
          {recent.length === 0 ? <AdminEmpty title="Your first order is ahead" description="New orders will appear here as customers shop your collection." /> : <div className="divide-y divide-sand">{recent.map(order => <Link key={order.id} to={`/admin/orders?search=${encodeURIComponent(order.order_number)}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-5 transition-colors hover:bg-cream sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:px-6"><div className="min-w-0"><p className="text-xs font-semibold">{order.order_number}</p><p className="mt-1.5 text-xs text-muted">{order.customer_name} <span className="hidden sm:inline">· {dateLabel(order.created_at)}</span></p></div><div className="order-3 col-span-2 sm:order-none sm:col-span-1"><StatusBadge status={order.status} /></div><p className="text-right text-sm font-semibold tabular-nums">{money(order.total_amount)}</p></Link>)}</div>}
        </section>
        <section className="admin-panel"><div className="admin-panel-heading"><div><h2 className="admin-panel-title">Recent order activity</h2><p className="mt-1 text-xs text-muted">Status of your latest {recent.length} orders</p></div><AdminIcon type="orders" className="text-accent" /></div><div className="space-y-5 p-5 sm:p-6">{ORDER_STATUSES.map(status => { const count = recent.filter(order => order.status === status).length; return <div key={status}><div className="mb-2 flex justify-between text-xs"><span className="capitalize text-muted">{status}</span><span className="font-semibold tabular-nums">{count}</span></div><div className="h-1.5 rounded-full bg-[#edf0e8]"><div className="h-full rounded-full bg-accent" style={{ width: `${recent.length ? count / recent.length * 100 : 0}%` }} /></div></div>; })}</div></section>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <QuickLink to="/admin/products/new" icon="products" title="Grow your collection" description="Add a new piece, set its price, and show the details." />
        <QuickLink to="/admin/orders" icon="orders" title="Keep orders moving" description="Review customer orders and update their status." />
        <QuickLink to="/" icon="external" title="See your storefront" description="Take a look at the collection your customers see." />
      </div>
    </>}
  </AdminLayout>;
}

function Stat({ label, value, detail, icon, featured }) {
  return <div className={`admin-stat ${featured ? 'border-[#d7e0ce] bg-[#e9eedf]' : ''}`}><div className="flex items-start justify-between gap-2"><p className="text-xs font-medium text-muted">{label}</p><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-accent ${featured ? 'bg-white/60' : 'bg-[#f0f3eb]'}`}>{icon}</span></div><p className="admin-stat-value">{value}</p><p className="mt-2 text-[10px] leading-5 text-muted">{detail}</p></div>;
}
function QuickLink({ to, icon, title, description }) {
  return <Link to={to} className="admin-panel group p-5 transition-colors hover:border-accent/40"><div className="mb-4 flex justify-between text-accent"><AdminIcon type={icon} /><ChevronRightIcon width={15} height={15} /></div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-2 text-xs leading-6 text-muted">{description}</p></Link>;
}
