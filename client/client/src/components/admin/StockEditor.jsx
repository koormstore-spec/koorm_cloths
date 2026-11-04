import { useEffect, useState } from 'react';
import adminApi from '../../api/adminAxios';

export default function StockEditor({ product, onSaved }) {
  const [quantity, setQuantity] = useState(String(product.stock ?? 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setQuantity(String(product.stock ?? 0)); }, [product.id, product.stock]);
  const save = async event => {
    event.preventDefault();
    if (saving) return;
    const stock = Number(quantity);
    if (quantity.trim() === '' || !Number.isInteger(stock) || stock < 0 || stock > 2147483647) {
      setError('Enter a whole number of units, zero or more.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { data } = await adminApi.patch(`/products/${product.id}/stock`, { stock });
      onSaved(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Stock could not be saved. Please try again.');
    } finally { setSaving(false); }
  };
  return <form onSubmit={save} className="mt-2 max-w-[15rem]">
    <div className="flex items-center gap-2">
      <input type="number" min="0" max="2147483647" step="1" required value={quantity} onChange={e => { setQuantity(e.target.value); setError(''); }} disabled={saving} aria-label={`Available stock for ${product.name}`} className="input-field w-20 rounded-lg px-2 py-2 text-sm" />
      <button type="submit" disabled={saving || quantity.trim() === '' || Number(quantity) === Number(product.stock)} className="admin-secondary min-h-11 px-3 py-2 text-xs" aria-label={`Save stock for ${product.name}`}>{saving ? 'Saving…' : 'Save stock'}</button>
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
  </form>;
}
