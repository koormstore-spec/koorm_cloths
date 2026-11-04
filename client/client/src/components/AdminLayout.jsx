import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';
import Drawer from './Drawer';
import { MenuIcon, CloseIcon, ChevronRightIcon } from './Icons';
import { AdminIcon } from './admin/AdminUI';
import api from '../api/adminAxios';

const LINKS = [
  { to: '/admin', label: 'Overview', icon: 'dashboard', end: true },
  { to: '/admin/products', label: 'Products', icon: 'products' },
  { to: '/admin/orders', label: 'Orders', icon: 'orders' },
  { to: '/admin/payments', label: 'Payments', icon: 'payments' },
  { to: '/admin/returns', label: 'Returns & exchanges', icon: 'returns' },
  { to: '/admin/coupons', label: 'Coupons', icon: 'coupon' },
  { to: '/admin/reviews', label: 'Reviews', icon: 'review' },
];

export default function AdminLayout({ children, title = 'Store overview', description, actions, cancellationCount, returnCount }) {
  const { admin, adminLogout } = useAdminAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingCancellations, setPendingCancellations] = useState(0);
  const [pendingReturns, setPendingReturns] = useState(0);
  useEffect(() => {
    if (returnCount !== undefined) return undefined;
    let active = true;
    const refresh = async () => {
      try {
        const { data } = await api.get('/returns/admin/pending-count');
        if (active) setPendingReturns(Number(data.count) || 0);
      } catch { /* Keep the last known count if a background refresh fails. */ }
    };
    refresh();
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [returnCount]);
  useEffect(() => {
    // The orders page already has the current list, including approval changes.
    if (cancellationCount !== undefined) return undefined;
    let active = true;
    const refresh = async () => {
      try {
        const { data } = await api.get('/orders/admin/cancellation-count');
        if (active) setPendingCancellations(Number(data.count) || 0);
      } catch { /* Keep the last known count when a background refresh fails. */ }
    };
    refresh();
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [cancellationCount]);
  const cancellationBadgeCount = cancellationCount ?? pendingCancellations;
  const returnBadgeCount = returnCount ?? pendingReturns;
  const returnBadge = returnBadgeCount > 0 && <span aria-label={`${returnBadgeCount} return and exchange requests awaiting approval`} className="ml-auto inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold leading-none text-white tabular-nums">{returnBadgeCount}</span>;
  const section = pathname.includes('/products') ? 'Products' : pathname.includes('/orders') ? 'Orders' : pathname.includes('/payments') ? 'Payments' : pathname.includes('/returns') ? 'Returns & exchanges' : pathname.includes('/coupons') ? 'Coupons' : pathname.includes('/reviews') ? 'Reviews' : 'Overview';
  const logout = () => { adminLogout(); navigate('/admin/login'); };
  const navigation = <div className="admin-sidebar">
    <Link to="/admin" className="admin-brand"><span className="font-serif text-3xl font-semibold tracking-[-0.06em]">KOORM</span><span className="mt-1 rounded border border-cream/25 px-1.5 py-0.5 text-[9px] tracking-widest">ADMIN</span></Link>
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-7"><p className="mb-4 px-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-cream/45">Workspace</p><nav aria-label="Admin navigation" className="space-y-2">{LINKS.map(link => <NavLink key={link.to} to={link.to} end={link.end} onClick={() => setMenuOpen(false)} className="admin-nav-link"><AdminIcon type={link.icon} /><span>{link.label}</span>{link.to === '/admin/orders' && cancellationBadgeCount > 0 && <span aria-label={`${cancellationBadgeCount} cancellation requests awaiting approval`} className="ml-auto inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold leading-none text-white tabular-nums">{cancellationBadgeCount}</span>}{link.to === '/admin/returns' && returnBadge}</NavLink>)}</nav><div className="mt-8 border-t border-white/10 pt-6"><Link to="/" className="admin-nav-link"><AdminIcon type="external" />View storefront</Link></div></div>
    <div className="mx-5 mb-5 rounded-xl border border-white/10 bg-white/5 p-4"><p className="font-serif text-lg">Your store. Your story.</p><p className="mt-2 text-xs leading-6 text-cream/55">A little care behind every piece.</p></div>
    <div className="flex items-center gap-3 border-t border-white/10 p-5"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e6eddc] text-sm font-semibold text-ink">{admin?.name?.slice(0, 1).toUpperCase() || 'K'}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{admin?.name || 'Store admin'}</p><p className="mt-1 text-[10px] text-cream/50">Administrator</p></div><button type="button" onClick={logout} aria-label="Sign out" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-white/10"><AdminIcon type="logout" width={17} height={17} /></button></div>
  </div>;
  return <div className="admin-shell">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] lg:block">{navigation}</aside>
    <div className="admin-workspace">
      <header className="admin-header"><div className="flex min-w-0 items-center gap-3"><button type="button" onClick={() => setMenuOpen(true)} aria-label="Open admin menu" aria-expanded={menuOpen} aria-controls="admin-navigation" className="admin-icon-button lg:hidden"><MenuIcon /></button><p className="hidden text-xs text-muted sm:block">Workspace</p><ChevronRightIcon width={13} height={13} className="hidden text-muted sm:block" /><span className="text-sm font-semibold">{section}</span></div><div className="flex items-center gap-3">{returnBadgeCount > 0 && <Link to="/admin/returns" className="admin-secondary" aria-label={`Review ${returnBadgeCount} pending return and exchange requests`}><AdminIcon type="returns" width={17} height={17} /><span className="hidden sm:inline">Requests</span>{returnBadge}</Link>}<Link to="/" className="admin-secondary hidden sm:flex">View store <AdminIcon type="external" width={14} height={14} /></Link><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e9eedf] text-xs font-semibold" title={admin?.name}>{admin?.name?.slice(0, 1).toUpperCase() || 'K'}</span></div></header>
      <div className="admin-content"><div className="admin-heading"><div className="min-w-0"><p className="eyebrow mb-2">Koorm administration</p><h1 className="admin-title">{title}</h1>{description && <p className="mt-2 max-w-xl text-sm leading-6 text-muted">{description}</p>}</div>{actions && <div className="flex flex-wrap gap-2">{actions}</div>}</div>{children}<p className="mt-10 text-center text-[10px] text-muted/80">KOORM · Store management</p></div>
    </div>
    <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} id="admin-navigation" label="Administration"><div className="relative flex min-h-0 flex-1 flex-col"><button type="button" className="absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-ink text-cream" onClick={() => setMenuOpen(false)} aria-label="Close admin menu"><CloseIcon width={17} height={17} /></button>{navigation}</div></Drawer>
  </div>;
}
