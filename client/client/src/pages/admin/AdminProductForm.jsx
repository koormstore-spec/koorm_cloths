import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import adminApi from '../../api/adminAxios';
import AdminLayout from '../../components/AdminLayout';
import Loader from '../../components/Loader';
import { ChevronRightIcon, CheckShieldIcon } from '../../components/Icons';
import { AdminIcon, AdminNotice, money } from '../../components/admin/AdminUI';

const emptyForm = { name: '', slug: '', description: '', price: '', discount_price: '', category_id: '', brand: 'Koorm', gender: 'unisex', sizes: '', colors: '', images: '', stock: 100, is_featured: false };
const splitList = value => value.split(/[\n,]+/).map(item => item.trim()).filter(Boolean);
const slugify = value => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export default function AdminProductForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const location = useLocation();
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const slugEdited = useRef(isEdit);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError(''); setError('');
    slugEdited.current = isEdit;
    const findProduct = async () => {
      if (!isEdit) return emptyForm;
      if (String(location.state?.product?.id) === id) return location.state.product;
      let page = 1;
      let pages = 1;
      do {
        const { data } = await adminApi.get('/products', { params: { limit: 100, page }, signal: controller.signal });
        const product = data.products.find(item => String(item.id) === id);
        if (product) return product;
        pages = data.pages;
        page += 1;
      } while (page <= pages);
      throw new Error('This product could not be found. Return to the collection and choose another product.');
    };
    Promise.all([adminApi.get('/categories', { signal: controller.signal }), findProduct()])
      .then(([categoryResponse, product]) => {
        if (controller.signal.aborted) return;
        setCategories(categoryResponse.data);
        setForm(isEdit ? { ...emptyForm, ...product, description: product.description || '', discount_price: product.discount_price ?? '', category_id: product.category_id || '', sizes: (product.sizes || []).join(', '), colors: (product.colors || []).join(', '), images: (product.images || []).join('\n'), is_featured: Boolean(Number(product.is_featured)) } : emptyForm);
      })
      .catch(err => { if (!controller.signal.aborted) setLoadError(err.response?.data?.message || err.message || 'We couldn’t open the product editor.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, isEdit, location.state, revision]);

  const handleChange = event => {
    const { name, value, type, checked } = event.target;
    if (name === 'slug') slugEdited.current = true;
    setForm(current => ({ ...current, [name]: type === 'checkbox' ? checked : value, ...(name === 'name' && !slugEdited.current ? { slug: slugify(value) } : {}) }));
  };
  const handleSubmit = async event => {
    event.preventDefault();
    if (saving) return;
    setError(''); setSaving(true);
    const payload = { ...form, price: Number(form.price), discount_price: form.discount_price ? Number(form.discount_price) : null, category_id: form.category_id ? Number(form.category_id) : null, stock: Number(form.stock), sizes: splitList(form.sizes), colors: splitList(form.colors), images: splitList(form.images), is_featured: Boolean(form.is_featured) };
    try {
      if (isEdit) await adminApi.put(`/products/${id}`, payload);
      else await adminApi.post('/products', payload);
      navigate('/admin/products');
    } catch (err) { setError(err.response?.data?.message || 'We couldn’t save this product. Your changes are still here; please try again.'); }
    finally { setSaving(false); }
  };
  const imageUrls = splitList(form.images);
  const input = (name, label, props = {}, help) => <label className="admin-field">{label}<input name={name} value={form[name]} onChange={handleChange} className="input-field" {...props} />{help && <p className="admin-field-help">{help}</p>}</label>;

  return <AdminLayout title={isEdit ? 'Edit product' : 'Add a new product'} description="The details make the difference. Give your next favourite a place in the collection." actions={<><Link to="/admin/products" className="admin-secondary"><ChevronRightIcon width={14} height={14} className="rotate-180" />Products</Link><button form="admin-product-form" type="submit" disabled={loading || Boolean(loadError) || saving} className="admin-primary">{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}</button></>}>
    {loading ? <div className="admin-panel py-16"><Loader /></div> : loadError ? <AdminNotice onRetry={() => setRevision(value => value + 1)}>{loadError}</AdminNotice> : <form id="admin-product-form" onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-6">
          <FormSection title="Product details" description="The first things your customers should know."><div className="space-y-5">{input('name', 'Product name', { required: true, placeholder: 'e.g. Olive Green European Linen Shirt' })}{input('slug', 'Product URL', { required: true, placeholder: 'olive-green-european-linen-shirt', pattern: '[a-z0-9]+(?:-[a-z0-9]+)*' }, 'Use lowercase letters, numbers, and hyphens.')}<label className="admin-field">Description<textarea name="description" value={form.description} onChange={handleChange} rows={5} className="input-field resize-y" placeholder="Tell the story of the fabric, fit, and details." /></label><div className="grid gap-5 sm:grid-cols-2">{input('brand', 'Brand', { placeholder: 'Koorm' })}<label className="admin-field">Category<select name="category_id" value={form.category_id} onChange={handleChange} className="input-field"><option value="">Choose a category</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label></div></div></FormSection>
          <FormSection title="Pricing & inventory" description="Keep pricing clear and stock up to date."><div className="grid gap-5 sm:grid-cols-2">{input('price', 'Regular price (₹)', { required: true, type: 'number', min: '0.01', step: '0.01', placeholder: '2499' })}{input('discount_price', 'Sale price (₹)', { type: 'number', min: '0.01', max: form.price || undefined, step: '0.01', placeholder: 'Optional' }, 'Leave empty if this product is not on sale.')}{input('stock', 'Available stock', { required: true, type: 'number', min: '0', step: '1' }, 'The number of units available to order.')}<label className="admin-field">Collection<select name="gender" value={form.gender} onChange={handleChange} className="input-field"><option value="men">Men</option><option value="women">Women</option><option value="kids">Kids</option><option value="unisex">Unisex</option></select></label></div></FormSection>
          <FormSection title="Sizes & colours" description="Help customers find the right version of this piece."><div className="grid gap-5 sm:grid-cols-2">{input('sizes', 'Available sizes', { placeholder: 'S, M, L, XL' }, 'Separate each size with a comma.')}{input('colors', 'Colours', { placeholder: 'Sage Green, Cream' }, 'Separate each colour with a comma.')}</div></FormSection>
          <FormSection title="Product photography" description="A clear view of every detail."><label className="admin-field">Image URLs<textarea name="images" value={form.images} onChange={handleChange} rows={4} className="input-field resize-y" placeholder="/images/collection-26/olive-green-european-linen-shirt/1.jpg" /><p className="admin-field-help">One image URL per line, or separated by commas. The first image is your cover photo.</p></label>{imageUrls.length > 0 && <div className="mt-4 flex gap-3 overflow-x-auto pb-2">{imageUrls.map((src, index) => <div key={`${src}-${index}`} className="relative h-24 w-20 shrink-0 overflow-hidden rounded-lg border border-sand"><PreviewImage src={src} alt={`Product image ${index + 1}`} />{index === 0 && <span className="absolute inset-x-0 bottom-0 bg-ink/85 py-1 text-center text-[9px] text-white">Cover</span>}</div>)}</div>}</FormSection>
        </div>
        <aside className="min-w-0 space-y-5 xl:sticky xl:top-28"><section className="admin-panel"><div className="admin-panel-heading"><h2 className="admin-panel-title">Product preview</h2><span className="text-[10px] text-muted">As you edit</span></div><div className="p-5"><div className="mx-auto aspect-[3/4] max-w-xs overflow-hidden rounded-lg bg-[#eeeee9]"><PreviewImage key={imageUrls[0]} src={imageUrls[0]} alt="Product cover preview" /></div><p className="mt-4 text-[10px] uppercase tracking-wider text-muted">{form.brand || 'Koorm'}</p><p className="mt-1 text-sm font-semibold">{form.name || 'Your product name'}</p><p className="mt-2 font-semibold">{money(form.discount_price || form.price)}{form.discount_price && Number(form.discount_price) < Number(form.price) && <span className="ml-2 text-xs font-normal text-muted line-through">{money(form.price)}</span>}</p><div className="mt-3 flex flex-wrap gap-1.5">{splitList(form.sizes).map((size, index) => <span key={`${size}-${index}`} className="rounded border border-sand px-2 py-1 text-[10px] text-muted">{size}</span>)}</div></div></section>
          <section className="admin-panel p-5"><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" name="is_featured" checked={form.is_featured} onChange={handleChange} className="mt-0.5 h-5 w-5 shrink-0 accent-ink" /><span><span className="block text-xs font-semibold">Feature this product</span><span className="mt-2 block text-xs leading-6 text-muted">Show this piece in the homepage favourites collection.</span></span></label></section>
          <div className="flex items-start gap-3 rounded-xl bg-[#e9eedf] p-5"><CheckShieldIcon width={20} height={20} className="shrink-0 text-accent" /><p className="text-xs leading-6 text-accent">Check the photos, price, and sizes before saving. Saved changes appear on your storefront.</p></div>
        </aside>
      </div>
      {error && <div className="mt-6"><AdminNotice>{error}</AdminNotice></div>}
      <div className="mt-6 flex flex-col-reverse justify-end gap-3 rounded-xl border border-sand bg-white p-4 sm:flex-row"><button type="button" onClick={() => navigate('/admin/products')} disabled={saving} className="admin-secondary">Cancel</button><button type="submit" disabled={saving} className="admin-primary">{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}</button></div>
    </form>}
  </AdminLayout>;
}

function FormSection({ title, description, children }) {
  return <section className="admin-panel"><div className="admin-panel-heading"><div><h2 className="admin-panel-title">{title}</h2><p className="mt-1 text-xs leading-5 text-muted">{description}</p></div></div><div className="p-5 sm:p-6">{children}</div></section>;
}
function PreviewImage({ src, alt }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  return src && !failed ? <img src={src} alt={alt} onError={() => setFailed(true)} className="h-full w-full object-cover object-top" /> : <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#eeeee9] p-3 text-center text-muted"><AdminIcon type="image" width={26} height={26} /><span className="text-[10px]">{failed ? 'Image unavailable' : 'Add a cover image'}</span></div>;
}
