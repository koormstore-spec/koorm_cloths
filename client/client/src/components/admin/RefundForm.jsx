import { useId, useState } from 'react';
import { money } from './AdminUI';

export const refundableAmount = (order) => Math.max(0, Math.round((Number(order.total_amount) - Number(order.refunded_amount || 0)) * 100) / 100);

// Online orders are refunded to the customer's original payment through
// Razorpay. Cash-on-delivery orders are refunded by the admin directly (bank or
// UPI transfer), so the form asks for that transfer's reference instead.
export default function RefundForm({ order, onSubmit, onCancel, askReason = true, submitLabel = 'Refund' }) {
  const id = useId();
  const balance = refundableAmount(order);
  const online = order.payment_method === 'ONLINE';
  const [amount, setAmount] = useState(String(balance));
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    const value = Number(amount);
    if (!(value > 0) || value > balance) { setError(`Enter an amount between ₹1 and ${money(balance)}.`); return; }
    if (!online && !reference.trim()) { setError('Add the bank or UPI reference of the refund you sent.'); return; }
    setSaving(true); setError('');
    try {
      await onSubmit({ amount: value, reason: reason.trim(), reference: reference.trim() });
    } catch (err) {
      setError(err.response?.data?.message || 'The refund could not be completed. Please try again.');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="mt-3 space-y-3 rounded-lg border border-sand bg-[#fafbf8] p-4" aria-label={`Refund ${order.order_number}`}>
      <p className="text-xs text-muted">{online ? 'Refunds go back to the customer’s original payment method (usually 5–7 working days).' : 'Cash on delivery: send the money to the customer yourself, then record it here.'} Up to {money(balance)} can be refunded.</p>
      <label htmlFor={`${id}-amount`} className="block text-[11px] font-medium text-muted">Amount (₹)
        <input id={`${id}-amount`} type="number" min="1" step="0.01" max={balance} value={amount} onChange={(event) => setAmount(event.target.value)} className="input-field mt-1 min-h-11 rounded-lg px-3 py-2 text-sm" />
      </label>
      {askReason && <label htmlFor={`${id}-reason`} className="block text-[11px] font-medium text-muted">Reason (shown to the customer)
        <input id={`${id}-reason`} value={reason} maxLength={255} onChange={(event) => setReason(event.target.value)} placeholder="For example, item damaged in transit" className="input-field mt-1 min-h-11 rounded-lg px-3 py-2 text-sm" />
      </label>}
      {!online && <label htmlFor={`${id}-reference`} className="block text-[11px] font-medium text-muted">Bank / UPI reference
        <input id={`${id}-reference`} value={reference} maxLength={120} onChange={(event) => setReference(event.target.value)} className="input-field mt-1 min-h-11 rounded-lg px-3 py-2 text-sm" />
      </label>}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className="admin-primary">{saving ? 'Refunding…' : submitLabel}</button>
        <button type="button" onClick={onCancel} disabled={saving} className="admin-secondary">Cancel</button>
      </div>
    </form>
  );
}
