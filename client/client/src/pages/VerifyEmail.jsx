import AuthLayout from '../components/AuthLayout';
import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function VerifyEmail() {
  const { verifyEmail, resendVerificationCode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || '');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [verified, setVerified] = useState(false);

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      await verifyEmail(email, code);
      setVerified(true);
      const from = location.state?.from;
      setTimeout(() => navigate(from ? { pathname: from.pathname, search: from.search, hash: from.hash } : '/'), 1800);
    } catch (err) {
      setError(err.response?.data?.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setMessage('');
    setResending(true);
    try {
      const data = await resendVerificationCode(email);
      setMessage(data.message);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to resend code');
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout>
      <h1 className="section-title mb-2 text-center">Verify Your Email</h1>
      <p className="text-center text-muted mb-8 text-sm">
        We've sent a 6-digit code to your email. Enter it below to activate your account.
      </p>

      {verified ? (
        <div className="border border-sand p-6 text-center">
          <p className="text-muted mb-2">Email verified successfully! 🎉</p>
          <p className="text-muted text-sm">{location.state?.from ? 'Taking you back to your requested page...' : 'Redirecting you to the shop...'}</p>
        </div>
      ) : (
        <form onSubmit={handleVerify} className="space-y-4">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-field"
          />
          <input
            required
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="input-field text-center tracking-[0.4em] text-lg"
          />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          {message && <p className="text-green-700 text-sm">{message}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Verifying...' : 'Verify Email'}
          </button>
          <button
            type="button"
            onClick={handleResend}
            disabled={resending || !email}
            className="w-full text-sm text-accent font-medium hover:underline disabled:opacity-50"
          >
            {resending ? 'Resending...' : "Didn't get a code? Resend"}
          </button>
        </form>
      )}

      <p className="text-center text-sm text-muted mt-6">
        <Link to="/" className="text-accent font-medium">Skip for now</Link>
      </p>
    </AuthLayout>
  );
}
