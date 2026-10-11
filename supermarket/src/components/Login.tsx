import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithGoogle();
      // Note: browser will redirect to Google — no need to setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>⚡ SuperMarket Express</h1>
        <p className="login-subtitle">Sign in to continue</p>

        {error && <div className="login-error">{error}</div>}

        <button
          className="google-btn"
          onClick={handleSignIn}
          disabled={loading}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4818h4.8436c-.2086 1.125-.8427 2.0781-1.7963 2.7163v2.2581h2.9086c1.7026-1.5677 2.6841-3.8745 2.6841-6.6153z"
            />
            <path
              fill="#34A853"
              d="M9 18c2.43 0 4.4673-.8063 5.9563-2.1805l-2.9086-2.2581c-.8063.54-1.8368.8586-3.0477.8586-2.3445 0-4.3286-1.5827-5.0368-3.7104H.9573v2.3318C2.4381 15.9831 5.4818 18 9 18z"
            />
            <path
              fill="#FBBC05"
              d="M3.9632 10.71c-.1801-.54-.2827-1.1173-.2827-1.71s.1026-1.17.2827-1.71V4.9582H.9573C.3477 6.1731 0 7.5477 0 9s.3477 2.8268.9573 4.0418L3.9632 10.71z"
            />
            <path
              fill="#EA4335"
              d="M9 3.5818c1.3213 0 2.5077.4541 3.4405 1.3459l2.5813-2.5813C13.4631.8909 11.4254 0 9 0 5.4818 0 2.4381 2.0168.9573 4.9582L3.9632 7.29C4.6714 5.1622 6.6555 3.5818 9 3.5818z"
            />
          </svg>
          {loading ? 'Signing in…' : 'Sign in with Google'}
        </button>

        <p className="login-footer">
          Use your Google account to access the POS system.
        </p>
      </div>
    </div>
  );
}