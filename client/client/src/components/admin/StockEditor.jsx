import { useEffect, useState } from 'react';
import adminApi from '../../api/adminAxios';

const MAX_STOCK = 2147483647;
const isValidStock = value => value.trim() !== '' && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= MAX_STOCK;

// Products with sizes get one input per size (saved to product_size_stock);
// products without sizes keep a single stock number.
export default function StockEditor({ product, onSaved }) {
  const sizes = product.sizes || [];
  return sizes.length > 0
    ? <SizeStockEditor product={product} sizes={sizes} onSaved={onSaved} />
    : <TotalStockEditor product={product} onSaved={onSaved} />;
}

function SizeStockEditor({ product, sizes, onSaved }) {
  const saved = product.size_stock || {};
  const tracked = Object.keys(saved).length > 0;
  const initial = () => Object.fromEntries(sizes.map(size => [size, saved[size] != null ? String(saved[size]) : '']));
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savedKey = JSON.stringify([sizes, saved]);
  useEffect(() => { setValues(initial()); }, [product.id, savedKey]);

  const changed = sizes.some(size => values[size] !== (saved[size] != null ? String(saved[size]) : ''));
  const total = sizes.reduce((sum, size) => sum + (isValidStock(values[size] || '') ? Number(values[size]) : 0), 0);

  const save = async event => {
    event.preventDefault();
    if (saving) return;
    const invalid = sizes.find(size => !isValidStock(values[size] || ''));
    if (invalid) { setError(`Enter a whole number of units, zero or more, for size ${invalid}.`); return; }
    setSaving(true);
    setError('');
    try {
      const size_stock = Object.fromEntries(sizes.map(size => [size, Number(values[size])]));
      const { data } = await adminApi.patch(`/products/${product.id}/stock`, { size_stock });
      onSaved(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Stock could not be saved. Please try again.');
    } finally { setSaving(false); }
  };

  return <form onSubmit={save} className="mt-2 max-w-[18rem]">
    {!tracked && <p className="mb-2 text-[11px] leading-4 text-muted">Shared stock: {product.stock ?? 0} units across all sizes. Set each size to track it separately.</p>}
    <div className="flex flex-wrap gap-2">
      {sizes.map(size => <label key={size} className="flex flex-col items-center gap-1 text-[10px] font-semibold uppercase text-muted">
        {size}
        <input type="number" min="0" max={MAX_STOCK} step="1" required value={values[size] ?? ''} onChange={e => { const { value } = e.target; setValues(current => ({ ...current, [size]: value })); setError(''); }} disabled={saving} aria-label={`Stock for ${product.name}, size ${size}`} className={`input-field w-14 rounded-lg px-1.5 py-1.5 text-center text-sm ${values[size] === '0' ? 'text-red-700' : ''}`} />
      </label>)}
    </div>
    <div className="mt-2 flex items-center gap-2">
      <button type="submit" disabled={saving || !changed} className="admin-secondary min-h-11 px-3 py-2 text-xs" aria-label={`Save stock for ${product.name}`}>{saving ? 'Saving…' : 'Save stock'}</button>
      <span className="text-[11px] text-muted">Total {total}</span>
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
  </form>;
}

function TotalStockEditor({ product, onSaved }) {
  const [quantity, setQuantity] = useState(String(product.stock ?? 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setQuantity(String(product.stock ?? 0)); }, [product.id, product.stock]);
  const save = async event => {
    event.preventDefault();
    if (saving) return;
    if (!isValidStock(quantity)) {
      setError('Enter a whole number of units, zero or more.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { data } = await adminApi.patch(`/products/${product.id}/stock`, { stock: Number(quantity) });
      onSaved(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Stock could not be saved. Please try again.');
    } finally { setSaving(false); }
  };
  return <form onSubmit={save} className="mt-2 max-w-[15rem]">
    <div className="flex items-center gap-2">
      <input type="number" min="0" max={MAX_STOCK} step="1" required value={quantity} onChange={e => { setQuantity(e.target.value); setError(''); }} disabled={saving} aria-label={`Available stock for ${product.name}`} className="input-field w-20 rounded-lg px-2 py-2 text-sm" />
      <button type="submit" disabled={saving || quantity.trim() === '' || Number(quantity) === Number(product.stock)} className="admin-secondary min-h-11 px-3 py-2 text-xs" aria-label={`Save stock for ${product.name}`}>{saving ? 'Saving…' : 'Save stock'}</button>
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
  </form>;
}
