import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import adminApi from '../../api/adminAxios';
import AdminLayout from '../../components/AdminLayout';
import Loader from '../../components/Loader';
import { ChevronRightIcon } from '../../components/Icons';
import { AdminIcon, AdminNotice, StatusBadge, money } from '../../components/admin/AdminUI';

const emptyForm = { code: '', discount_type: 'percent', discount_value: '', min_order_amount: '', max_discount_amount: '', usage_limit: '', expires_at: '', is_active: true };
const offerPresets = [
  { label: 'Welcome note', code: 'WELCOME10', discount_value: '10', min_order_amount: '0', usage_limit: '', description: 'A gentle first-order hello.' },
  { label: 'Weekend drop', code: 'WEEKEND15', discount_value: '15', min_order_amount: '1499', usage_limit: '100', description: 'A little urgency for the weekend.' },
  { label: 'Wardrobe upgrade', code: 'UPGRADE250', discount_type: 'flat', discount_value: '250', min_order_amount: '2499', usage_limit: '', description: 'Reward a considered basket.' },
];

export default function AdminCouponForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(''); setError(''); setLoading(isEdit);
    if (isEdit) {
      adminApi.get(`/coupons/${id}`, { signal: controller.signal }).then(({ data }) => {
        if (controller.signal.aborted) return;
        setForm({ ...emptyForm, ...data, discount_value: data.discount_value ?? '', min_order_amount: data.min_order_amount ?? '', max_discount_amount: data.max_discount_amount ?? '', usage_limit: data.usage_limit ?? '', expires_at: data.expires_at ? data.expires_at.slice(0, 10) : '', is_active: Boolean(data.is_active) });
      }).catch(err => { if (!controller.signal.aborted) setLoadError(err.response?.data?.message || 'Could not open this coupon. Please try again.'); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    } else setForm(emptyForm);
    return () => controller.abort();
  }, [id, isEdit, revision]);

  const handleChange = event => {
    const { name, value, type, checked } = event.target;
    setForm(current => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
  };
  const applyPreset = preset => setForm(current => ({
    ...current,
    code: preset.code,
    discount_type: preset.discount_type || 'percent',
    discount_value: preset.discount_value,
    min_order_amount: preset.min_order_amount,
    usage_limit: preset.usage_limit,
  }));
  const handleSubmit = async event => {
    event.preventDefault();
    if (saving) return;
    setError(''); setSaving(true);
    const payload = { code: form.code.trim().toUpperCase(), discount_type: form.discount_type, discount_value: Number(form.discount_value), min_order_amount: form.min_order_amount ? Number(form.min_order_amount) : 0, max_discount_amount: form.discount_type === 'percent' && form.max_discount_amount ? Number(form.max_discount_amount) : null, usage_limit: form.usage_limit ? Number(form.usage_limit) : null, expires_at: form.expires_at || null, is_active: Boolean(form.is_active) };
    try {
      if (isEdit) await adminApi.put(`/coupons/${id}`, payload);
      else await adminApi.post('/coupons', payload);
      navigate('/admin/coupons');
    } catch (err) { setError(err.response?.data?.message || 'Could not save this coupon. Your changes are still here; please try again.'); }
    finally { setSaving(false); }
  };
  const input = (name, label, props = {}, help) => <label className="admin-field">{label}<input name={name} value={form[name]} onChange={handleChange} className="input-field" {...props} />{help && <p className="admin-field-help">{help}</p>}</label>;
  const saveLabel = saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create coupon';

  return <AdminLayout title={isEdit ? 'Edit coupon' : 'Create a coupon'} description="Make a little room for something special." actions={<><Link to="/admin/coupons" className="admin-secondary"><ChevronRightIcon width={14} height={14} className="rotate-180" />Coupons</Link><button form="admin-coupon-form" type="submit" disabled={loading || Boolean(loadError) || saving} className="admin-primary">{saveLabel}</button></>}>
    {loading ? <div className="admin-panel py-16"><Loader /></div> : loadError ? <AdminNotice onRetry={() => setRevision(value => value + 1)}>{loadError}</AdminNotice> : <form id="admin-coupon-form" onSubmit={handleSubmit}>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-6">
          <section className="admin-panel"><div className="admin-panel-heading"><div><h2 className="admin-panel-title">The offer</h2><p className="mt-1 text-xs text-muted">Choose a code and set your discount.</p></div></div><div className="space-y-5 p-5 sm:p-6"><div><p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Start with a spark</p><div className="grid gap-2 sm:grid-cols-3">{offerPresets.map(preset => <button key={preset.code} type="button" onClick={() => applyPreset(preset)} className="rounded-lg border border-sand bg-[#fafbf8] p-3 text-left transition-colors hover:border-accent hover:bg-[#eef3e6]"><span className="block text-xs font-semibold">{preset.label}</span><span className="mt-1 block font-mono text-[11px] text-accent">{preset.code}</span><span className="mt-2 block text-[10px] leading-4 text-muted">{preset.description}</span></button>)}</div></div>{input('code', 'Coupon code', { required: true, placeholder: 'WELCOME10', autoCapitalize: 'characters', autoComplete: 'off' }, 'Customers enter this code at checkout. It will be saved in uppercase.')}<div className="grid gap-5 sm:grid-cols-2"><label className="admin-field">Discount type<select name="discount_type" value={form.discount_type} onChange={handleChange} className="input-field"><option value="percent">Percentage off</option><option value="flat">Flat amount off</option></select></label>{input('discount_value', form.discount_type === 'percent' ? 'Discount (%)' : 'Discount (₹)', { type: 'number', min: '0.01', max: form.discount_type === 'percent' ? '100' : undefined, step: '0.01', required: true, placeholder: form.discount_type === 'percent' ? '10' : '250' })}</div></div></section>
          <section className="admin-panel"><div className="admin-panel-heading"><div><h2 className="admin-panel-title">Limits & availability</h2><p className="mt-1 text-xs text-muted">Set the terms that work for your store.</p></div></div><div className="p-5 sm:p-6"><div className="grid gap-5 sm:grid-cols-2">{input('min_order_amount', 'Minimum order (₹)', { type: 'number', min: '0', step: '0.01', placeholder: '0' }, 'Leave empty to allow any order value.')}{form.discount_type === 'percent' && input('max_discount_amount', 'Maximum discount (₹)', { type: 'number', min: '0.01', step: '0.01', placeholder: 'No limit' }, 'Optional cap on the total discount.')}{input('usage_limit', 'Redemption limit', { type: 'number', min: '1', step: '1', placeholder: 'Unlimited' }, 'Total number of times this code can be used.')}{input('expires_at', 'Expiry date', { type: 'date' }, 'Leave empty to keep the offer available.')}</div><label className="mt-6 flex cursor-pointer items-start gap-3 rounded-lg bg-[#f5f7f1] p-4"><input type="checkbox" name="is_active" checked={form.is_active} onChange={handleChange} className="mt-0.5 h-5 w-5 shrink-0 accent-ink" /><span><span className="block text-xs font-semibold">Active coupon</span><span className="mt-1 block text-xs leading-5 text-muted">Customers can use this code when its limits and expiry conditions are met.</span></span></label></div></section>
        </div>
        <aside className="admin-panel xl:sticky xl:top-28"><div className="admin-panel-heading"><h2 className="admin-panel-title">Offer preview</h2><AdminIcon type="coupon" className="text-accent" /></div><div className="p-5"><div className="rounded-xl border border-dashed border-accent/35 bg-[#eef3e6] p-6 text-center"><p className="text-[10px] uppercase tracking-[0.2em] text-accent">A little something for you</p><p className="my-5 font-serif text-4xl font-semibold">{form.discount_type === 'percent' ? `${Number(form.discount_value || 0)}%` : money(form.discount_value)} off</p><p className="break-all rounded-lg bg-white px-3 py-3 font-mono text-sm font-semibold tracking-wide">{form.code.trim().toUpperCase() || 'YOURCODE'}</p><p className="mt-4 text-xs leading-6 text-muted">{Number(form.min_order_amount) > 0 ? `On orders of ${money(form.min_order_amount)} or more.` : 'On any order.'}{form.discount_type === 'percent' && Number(form.max_discount_amount) > 0 ? ` Save up to ${money(form.max_discount_amount)}.` : ''}</p></div><div className="mt-5 flex items-center justify-between gap-3"><span className="text-xs text-muted">Availability</span><StatusBadge status={!form.is_active ? 'inactive' : form.expires_at && new Date(form.expires_at) < new Date() ? 'expired' : 'active'} /></div><p className="mt-4 text-xs leading-6 text-muted">Review the discount and conditions before saving your offer.</p></div></aside>
      </div>
      {error && <div className="mt-6"><AdminNotice>{error}</AdminNotice></div>}
      <div className="mt-6 flex flex-col-reverse justify-end gap-3 rounded-xl border border-sand bg-white p-4 sm:flex-row"><button type="button" onClick={() => navigate('/admin/coupons')} disabled={saving} className="admin-secondary">Cancel</button><button type="submit" disabled={saving} className="admin-primary">{saveLabel}</button></div>
    </form>}
  </AdminLayout>;
}
