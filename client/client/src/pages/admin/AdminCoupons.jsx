import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import adminApi from '../../api/adminAxios';
import AdminLayout from '../../components/AdminLayout';
import Loader from '../../components/Loader';
import { PlusIcon } from '../../components/Icons';
import { AdminConfirm, AdminEmpty, AdminIcon, AdminNotice, AdminSearch, StatusBadge, dateLabel, money } from '../../components/admin/AdminUI';

const formatDiscount = coupon => coupon.discount_type === 'percent' ? `${Number(coupon.discount_value)}% off` : `${money(coupon.discount_value)} off`;
const couponStatus = coupon => !coupon.is_active ? 'inactive' : coupon.expires_at && new Date(coupon.expires_at) < new Date() ? 'expired' : 'active';

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const load = () => {
    setLoading(true); setError('');
    adminApi.get('/coupons').then(({ data }) => setCoupons(data))
      .catch(() => setError('Could not load coupons. Please try again.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleDelete = async () => {
    setBusy(true); setDeleteError('');
    try {
      await adminApi.delete(`/coupons/${deleting.id}`);
      setCoupons(current => current.filter(coupon => coupon.id !== deleting.id));
      setSuccess(`${deleting.code} has been deleted.`); setDeleting(null);
    } catch (err) { setDeleteError(err.response?.data?.message || 'Could not delete this coupon. Please try again.'); }
    finally { setBusy(false); }
  };
  const visible = coupons.filter(coupon => coupon.code.toLowerCase().includes(search.trim().toLowerCase()));
  const actions = coupon => <div className="flex items-center gap-2"><Link to={`/admin/coupons/${coupon.id}/edit`} aria-label={`Edit ${coupon.code}`} className="admin-secondary px-3">Edit</Link><button type="button" aria-label={`Delete ${coupon.code}`} onClick={() => { setDeleting({ ...coupon, name: coupon.code }); setDeleteError(''); }} className="min-h-11 rounded-lg px-3 text-xs font-medium text-red-700 hover:bg-red-50">Delete</button></div>;

  return <AdminLayout title="Coupons" description="A thoughtful offer. Another reason to come back." actions={<Link to="/admin/coupons/new" className="admin-primary"><PlusIcon width={16} height={16} />Add coupon</Link>}>
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-3 sm:gap-5">{[{ label: 'Total coupons', value: coupons.length }, { label: 'Active offers', value: coupons.filter(coupon => couponStatus(coupon) === 'active').length }, { label: 'Times redeemed', value: coupons.reduce((total, coupon) => total + Number(coupon.used_count || 0), 0) }].map(stat => <div key={stat.label} className="admin-stat"><p className="text-xs text-muted">{stat.label}</p><p className="admin-stat-value">{loading ? '—' : stat.value}</p></div>)}</div>
      {error && <AdminNotice onRetry={load}>{error}</AdminNotice>}
      {success && <AdminNotice success>{success}</AdminNotice>}
      <section className="admin-panel">
        <div className="admin-panel-heading"><div><h2 className="admin-panel-title">Your promotions</h2><p className="mt-1 text-xs text-muted">Manage discounts and reward your customers.</p></div><div className="w-full sm:max-w-xs"><AdminSearch placeholder="Search coupon codes" value={search} onChange={setSearch} /></div></div>
        {loading ? <Loader /> : !visible.length ? <AdminEmpty title={search ? 'No matching coupons' : 'Your next offer starts here'} description={search ? 'Try searching for a different coupon code.' : 'Create a discount code for your next collection or a special customer offer.'}>{!search && <Link to="/admin/coupons/new" className="admin-primary">Create a coupon</Link>}</AdminEmpty> : <>
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6 xl:hidden">{visible.map(coupon => <article key={coupon.id} className="min-w-0 rounded-xl border border-sand p-4"><div className="mb-5 flex items-start justify-between gap-2"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#edf2e6] text-accent"><AdminIcon type="coupon" /></span><StatusBadge status={couponStatus(coupon)} /></div><p className="break-all text-sm font-semibold tracking-wide">{coupon.code}</p><p className="mt-1 font-serif text-3xl font-semibold">{formatDiscount(coupon)}</p><dl className="mt-5 grid grid-cols-2 gap-4 border-y border-sand py-4 text-xs"><div><dt className="text-muted">Minimum order</dt><dd className="mt-1 font-medium">{money(coupon.min_order_amount)}</dd></div><div><dt className="text-muted">Redemptions</dt><dd className="mt-1 font-medium">{coupon.used_count || 0}{coupon.usage_limit ? ` / ${coupon.usage_limit}` : ''}</dd></div><div className="col-span-2"><dt className="text-muted">Expires</dt><dd className="mt-1 font-medium">{coupon.expires_at ? dateLabel(coupon.expires_at) : 'No expiry date'}</dd></div></dl><div className="mt-4">{actions(coupon)}</div></article>)}</div>
          <div className="hidden xl:block"><table className="admin-table"><thead><tr><th>Coupon code</th><th>Offer</th><th>Minimum order</th><th>Redemptions</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visible.map(coupon => <tr key={coupon.id}><td><p className="max-w-[14rem] break-all font-semibold tracking-wide">{coupon.code}</p><p className="mt-1 text-[11px] text-muted">{coupon.expires_at ? `Expires ${dateLabel(coupon.expires_at)}` : 'No expiry date'}</p></td><td className="font-medium">{formatDiscount(coupon)}</td><td>{money(coupon.min_order_amount)}</td><td>{coupon.used_count || 0}{coupon.usage_limit ? ` / ${coupon.usage_limit}` : ''}</td><td><StatusBadge status={couponStatus(coupon)} /></td><td>{actions(coupon)}</td></tr>)}</tbody></table></div>
        </>}
      </section>
    </div>
    <AdminConfirm entity="coupon" item={deleting} busy={busy} error={deleteError} onCancel={() => setDeleting(null)} onConfirm={handleDelete} />
  </AdminLayout>;
}
