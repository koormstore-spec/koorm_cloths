import AuthLayout from '../components/AuthLayout';
import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { requestLoginCode, verifyLoginCode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRequestCode = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const data = await requestLoginCode(email);
      setMessage(data.message);
      setCodeSent(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send login code');
      if (err.response?.data?.unverified) {
        navigate('/verify-email', { state: { email, from: location.state?.from } });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await verifyLoginCode(email, code);
      const from = location.state?.from;
      navigate(from ? { pathname: from.pathname, search: from.search, hash: from.hash } : '/');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout background="essentials">
      <h1 className="section-title mb-2 text-center">Welcome Back</h1>
      <p className="text-center text-muted mb-8 text-sm">
        {codeSent ? 'Enter the code we emailed you to continue' : 'Login with a code sent to your email'}
      </p>

      {!codeSent ? (
        <form onSubmit={handleRequestCode} className="space-y-4">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-field"
          />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Sending code...' : 'Send Login Code'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyCode} className="space-y-4">
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
            {loading ? 'Logging in...' : 'Login'}
          </button>
          <button
            type="button"
            onClick={() => {
              setCodeSent(false);
              setCode('');
              setError('');
              setMessage('');
            }}
            className="w-full text-sm text-accent font-medium hover:underline"
          >
            Use a different email
          </button>
        </form>
      )}

      <p className="text-center text-sm text-muted mt-6">
        New to Koorm? <Link to="/register" state={location.state} className="text-accent font-medium">Create an account</Link>
      </p>
    </AuthLayout>
  );
}
