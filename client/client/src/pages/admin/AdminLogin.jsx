import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { CheckShieldIcon, ChevronRightIcon } from '../../components/Icons';
import { AdminIcon, AdminNotice } from '../../components/admin/AdminUI';

export default function AdminLogin() {
  const { adminLogin, requestAdminSetupCode, verifyAdminSetup, requestAdminPasswordReset, resetAdminPassword } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from;
  const destination = from?.pathname?.startsWith('/admin/') && from.pathname !== '/admin/login'
    ? { pathname: from.pathname, search: from.search || '' }
    : '/admin';
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', code: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(() => new URLSearchParams(window.location.search).has('expired') ? 'Your admin session has ended. Please sign in again.' : '');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const update = event => setForm(value => ({ ...value, [event.target.name]: event.target.value }));
  const submit = async event => {
    event.preventDefault(); setError(''); setMessage(''); setLoading(true);
    try {
      if (mode === 'login') {
        await adminLogin(form.email, form.password);
        navigate(destination, { replace: true });
      } else if (mode === 'request') {
        const data = await requestAdminSetupCode(form.email);
        setMessage(data.message); setMode('setup');
      } else if (mode === 'forgot') {
        const data = await requestAdminPasswordReset(form.email);
        setMessage(data.message); setMode('reset');
      } else if (mode === 'reset') {
        await resetAdminPassword(form.email, form.code, form.password);
        navigate(destination, { replace: true });
      } else {
        await verifyAdminSetup(form.email, form.code, form.password);
        navigate(destination, { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally { setLoading(false); }
  };

  const isSetup = mode !== 'login';
  const isReset = mode === 'forgot' || mode === 'reset';
  const hasCodeStep = mode === 'setup' || mode === 'reset';
  return <div className="admin-login">
    <section className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-cream lg:flex xl:p-16"><Link to="/" className="relative z-10 w-fit font-serif text-4xl font-semibold tracking-[-0.06em]">KOORM</Link><div className="relative z-10 my-16 max-w-md"><p className="mb-6 text-[10px] uppercase tracking-[0.2em] text-[#c4d1b6]">Behind every great collection</p><h2 className="font-serif text-5xl leading-[1.12] tracking-[-0.04em] xl:text-6xl">A little care.<br /><em className="font-normal text-[#c4d1b6]">A great store.</em></h2><p className="mt-7 max-w-sm text-sm leading-7 text-cream/60">Your collection, your customers, and your next chapter. Bring it all together in your Koorm workspace.</p><div className="mt-10 space-y-5">{[{ icon: 'products', text: 'Build a collection worth coming back to' }, { icon: 'orders', text: 'Keep every customer order moving' }, { icon: 'dashboard', text: 'See the bigger picture, at a glance' }].map(item => <div key={item.icon} className="flex items-center gap-3 text-xs text-cream/80"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10"><AdminIcon type={item.icon} width={17} height={17} /></span>{item.text}</div>)}</div></div><p className="relative z-10 text-[10px] tracking-wide text-cream/40">KOORM · Your everyday, considered.</p><div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full border border-white/10" /><div className="pointer-events-none absolute -bottom-16 -right-16 h-64 w-64 rounded-full border border-white/10" /></section>
    <section className="flex min-w-0 flex-col justify-center px-5 py-10 sm:px-12"><div className="mx-auto w-full max-w-sm"><Link to="/" className="mb-12 inline-block font-serif text-3xl font-semibold tracking-[-0.06em] lg:hidden">KOORM</Link><span className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-sand bg-white text-accent"><CheckShieldIcon width={24} height={24} /></span><p className="eyebrow mb-3">Your admin workspace</p><h1 className="font-serif text-4xl font-semibold tracking-[-0.035em]">{isReset ? 'Reset your password.' : isSetup ? 'Create admin access.' : 'Welcome back.'}</h1><p className="mb-8 mt-3 text-sm leading-6 text-muted">{mode === 'forgot' ? 'We will email a reset code to the configured admin address.' : mode === 'reset' ? 'Enter the code from your email and choose a new password.' : mode === 'request' ? 'We will email a verification code to the configured admin address.' : mode === 'setup' ? 'Enter the code and choose a password for your admin account.' : 'Sign in to take care of your store.'}</p><form onSubmit={submit} className="space-y-5"><label className="admin-field">Admin email<input name="email" type="email" autoComplete="username" required disabled={hasCodeStep} value={form.email} onChange={update} placeholder="you@example.com" className="input-field" /></label>{hasCodeStep && <label className="admin-field">Verification code<input name="code" required inputMode="numeric" pattern="\d{6}" maxLength={6} value={form.code} onChange={event => setForm(value => ({ ...value, code: event.target.value.replace(/\D/g, '').slice(0, 6) }))} placeholder="6-digit code" className="input-field text-center tracking-[0.4em] text-lg" /></label>}{hasCodeStep && <label className="admin-field">{isReset ? 'New password' : 'Set password'}<span className="relative block"><input name="password" aria-label={isReset ? 'New password' : 'Set password'} type={showPassword ? 'text' : 'password'} minLength={8} autoComplete="new-password" required value={form.password} onChange={update} placeholder="At least 8 characters" className="input-field pr-16" /><button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-1 top-2 h-11 px-3 text-xs font-medium text-accent">{showPassword ? 'Hide' : 'Show'}</button></span></label>}{mode === 'login' && <label className="admin-field">Password<span className="relative block"><input name="password" aria-label="Password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={form.password} onChange={update} placeholder="Enter your password" className="input-field pr-16" /><button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-1 top-2 h-11 px-3 text-xs font-medium text-accent">{showPassword ? 'Hide' : 'Show'}</button></span></label>}{error && <AdminNotice>{error}</AdminNotice>}{message && <AdminNotice success>{message}</AdminNotice>}<button type="submit" disabled={loading} className="admin-primary w-full">{loading ? (mode === 'login' ? 'Signing in…' : 'Please wait…') : mode === 'login' ? 'Sign in to workspace' : mode === 'request' ? 'Email verification code' : mode === 'forgot' ? 'Email reset code' : mode === 'reset' ? 'Save new password' : 'Create admin account'}<ChevronRightIcon width={15} height={15} /></button></form>{mode === 'login' && <button type="button" onClick={() => { setMode('forgot'); setError(''); setMessage(''); }} className="mt-5 w-full text-center text-xs font-medium text-accent hover:underline">Forgot password?</button>}{mode === 'login' && <button type="button" onClick={() => { setMode('request'); setError(''); setMessage(''); }} className="mt-5 w-full text-center text-xs font-medium text-accent hover:underline">First-time admin? Set up your account</button>}{mode !== 'login' && <button type="button" onClick={() => { setMode('login'); setError(''); setMessage(''); }} className="mt-5 w-full text-center text-xs font-medium text-accent hover:underline">Back to sign in</button>}<p className="mt-6 text-center text-[11px] text-muted">Authorised Koorm staff only.</p><div className="mt-8 border-t border-sand pt-6"><Link to="/" className="inline-flex min-h-11 items-center gap-2 text-xs text-muted hover:text-ink"><ChevronRightIcon width={14} height={14} className="rotate-180" />Back to the storefront</Link></div></div></section>
  </div>;
}

