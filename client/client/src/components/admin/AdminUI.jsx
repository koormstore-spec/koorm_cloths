import { useEffect, useRef } from 'react';
import { ChevronRightIcon, SearchIcon } from '../Icons';

export const ORDER_STATUSES = ['placed', 'processing', 'shipped', 'delivered', 'cancelled'];
export const money = value => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export const dateLabel = value => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export function AdminIcon({ type, className = '', ...props }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    products: <><path d="m12 3 9 5-9 5-9-5 9-5ZM3 8v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5" /></>,
    orders: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 3h6v4H9zM9 12h6M9 16h4" /></>,
    coupon: <><path d="M3 10V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 0 0 4v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 0 0-4Z" /><path d="M9 4v16" strokeDasharray="2 2" /></>,
    review: <><path d="m12 3 2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.2-5.4 3.2 1.3-6-4.6-4.1 6.1-.6Z" /></>,
    logout: <><path d="M9 4H4v16h5M9 12h12m-4-4 4 4-4 4" /></>,
    external: <><path d="M14 3h7v7M21 3l-11 11M10 3H4v17h17v-6" /></>,
    returns: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
    payments: <><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M2.5 10h19M6.5 15h4" /></>,
    chevron: <><path d="m9 6 6 6-6 6" /></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 5-5 4 4 4-7 5 8" /></>,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>{paths[type] || paths.dashboard}</svg>;
}

export function StatusBadge({ status }) {
  const classes = {
    placed: 'admin-status-placed', processing: 'admin-status-processing',
    shipped: 'admin-status-shipped', delivered: 'admin-status-delivered',
    cancelled: 'admin-status-cancelled', 'in-stock': 'admin-status-in-stock',
    'low-stock': 'admin-status-low-stock', 'out-of-stock': 'admin-status-out-of-stock',
    active: 'admin-status-in-stock', inactive: 'border-sand bg-sand/30 text-muted',
    expired: 'admin-status-out-of-stock',
    pending_payment: 'admin-status-low-stock',
    // Return requests
    requested: 'admin-status-processing', approved: 'admin-status-placed',
    received: 'admin-status-shipped', refunded: 'admin-status-delivered', exchanged: 'admin-status-delivered',
    rejected: 'admin-status-cancelled',
  };
  return <span className={`admin-status ${classes[status] || 'border-sand bg-sand/30 text-muted'}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{status?.replace(/[-_]/g, ' ')}</span>;
}

export function AdminNotice({ children, onRetry, success = false }) {
  return <div role={success ? 'status' : 'alert'} className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 text-sm ${success ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`}><p>{children}</p>{onRetry && <button type="button" onClick={onRetry} className="min-h-11 shrink-0 px-3 font-semibold underline underline-offset-4">Try again</button>}</div>;
}

export function AdminEmpty({ title, description, children }) {
  return <div className="px-5 py-14 text-center"><span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-sand/50 text-accent"><AdminIcon type="products" /></span><h2 className="text-lg font-semibold">{title}</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">{description}</p>{children && <div className="mt-5">{children}</div>}</div>;
}

export function AdminSearch({ value, onChange, placeholder, onSubmit }) {
  return <form onSubmit={event => { event.preventDefault(); onSubmit?.(); }} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-input-border bg-white px-3 focus-within:border-accent">
    <SearchIcon width={18} height={18} className="shrink-0 text-muted" />
    <input type="search" aria-label={placeholder} placeholder={placeholder} value={value} onChange={event => onChange(event.target.value)} className="h-11 min-w-0 w-full border-0 bg-transparent text-sm outline-none" />
    {onSubmit && <button type="submit" className="min-h-11 shrink-0 whitespace-nowrap px-1 text-xs font-semibold text-accent">Search</button>}
  </form>;
}

export function AdminPagination({ page, pages, total, count, pageSize, onChange }) {
  if (!total) return null;
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sand px-4 py-4 sm:px-6"><p className="text-xs text-muted">Showing {(page - 1) * pageSize + 1}–{(page - 1) * pageSize + count} of {total}</p><div className="flex items-center gap-3"><button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Previous page" className="admin-icon-button"><ChevronRightIcon className="rotate-180" width={17} height={17} /></button><span className="text-xs tabular-nums">{page} / {Math.max(1, pages)}</span><button type="button" onClick={() => onChange(page + 1)} disabled={page >= pages} aria-label="Next page" className="admin-icon-button"><ChevronRightIcon width={17} height={17} /></button></div></div>;
}

export function AdminConfirm({ item, busy, error, onCancel, onConfirm, entity = 'product' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!item) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current.showModal();
    return () => { document.body.style.overflow = previousOverflow; };
  }, [item]);
  if (!item) return null;
  return <dialog ref={ref} aria-labelledby="delete-item-title" className="admin-dialog" onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <p className="eyebrow mb-3">{entity === 'coupon' ? 'Store promotions' : 'Product catalogue'}</p><h2 id="delete-item-title" className="text-xl font-semibold">Delete this {entity}?</h2><p className="mt-3 text-sm leading-6 text-muted">“{item.name}” will be removed from your store. This action cannot be undone.</p>
    {error && <div className="mt-4"><AdminNotice>{error}</AdminNotice></div>}
    <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" autoFocus disabled={busy} onClick={onCancel} className="admin-secondary">Keep {entity}</button><button type="button" disabled={busy} onClick={onConfirm} className="admin-primary bg-red-700 hover:bg-red-800">{busy ? 'Deleting…' : `Delete ${entity}`}</button></div>
  </dialog>;
}
