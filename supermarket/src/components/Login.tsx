import { useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { loginSchema, signupSchema } from '../lib/validation';

type Mode = 'signin' | 'signup';

type FieldErrors = Partial<
  Record<'email' | 'password' | 'confirmPassword', string>
>;

export default function Login() {
  const { signInWithGoogle, signUp, signInWithEmail } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setFieldErrors({});
    setFormError('');
    setNotice('');
  }

  const handleGoogle = async () => {
    setFormError('');
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Sign in failed');
      setLoading(false);
    }
  };

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    setNotice('');
    setFieldErrors({});

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const next: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string' && !next[key]) next[key] = issue.message;
      }
      setFieldErrors(next);
      return;
    }

    setLoading(true);
    try {
      await signInWithEmail(result.data);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    setNotice('');
    setFieldErrors({});

    const result = signupSchema.safeParse({ email, password, confirmPassword });
    if (!result.success) {
      const next: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0];
        if (!next[key]) next[key] = issue.message;
      }
      setFieldErrors(next);
      return;
    }

    setLoading(true);
    try {
      const { session } = await signUp(result.data);
      if (!session) {
        setNotice(
          'Check your inbox to confirm your email address, then come back to sign in.',
        );
        setPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Unable to create your account',
      );
    } finally {
      setLoading(false);
    }
  };

  const inputClass = (field: keyof FieldErrors) =>
    `auth-input${fieldErrors[field] ? ' auth-input-error' : ''}`;

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>⚡ SuperMarket Express</h1>
        <p className="login-subtitle">
          {mode === 'signup' ? 'Create your account' : 'Sign in to continue'}
        </p>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab${mode === 'signin' ? ' is-active' : ''}`}
            onClick={() => switchMode('signin')}
            disabled={loading}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`auth-tab${mode === 'signup' ? ' is-active' : ''}`}
            onClick={() => switchMode('signup')}
            disabled={loading}
          >
            Create account
          </button>
        </div>

        {formError && <div className="login-error">{formError}</div>}
        {notice && <div className="auth-notice">{notice}</div>}

        <button
          className="google-btn"
          onClick={handleGoogle}
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
          {loading ? 'Please wait…' : 'Continue with Google'}
        </button>

        <div className="auth-divider">or</div>

        <form
          className="auth-form"
          noValidate
          onSubmit={mode === 'signup' ? handleSignUp : handleSignIn}
        >
<div className="auth-field">
            <label className="auth-label" htmlFor="auth-email">
              Email
            </label>
            <input
              id="auth-email"
              className={inputClass('email')}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              disabled={loading}
            />
            {fieldErrors.email && (
              <span className="field-error">{fieldErrors.email}</span>
            )}
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-password">
              Password
            </label>
            <input
              id="auth-password"
              className={inputClass('password')}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={
                mode === 'signup' ? 'new-password' : 'current-password'
              }
              placeholder={mode === 'signup' ? 'At least 8 characters' : ''}
              disabled={loading}
            />
            {fieldErrors.password && (
              <span className="field-error">{fieldErrors.password}</span>
            )}
          </div>

          {mode === 'signup' && (
            <div className="auth-field">
              <label className="auth-label" htmlFor="auth-confirm">
                Confirm password
              </label>
              <input
                id="auth-confirm"
                className={inputClass('confirmPassword')}
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                disabled={loading}
              />
              {fieldErrors.confirmPassword && (
                <span className="field-error">{fieldErrors.confirmPassword}</span>
              )}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary auth-submit"
            disabled={loading}
          >
            {loading
              ? 'Please wait…'
              : mode === 'signup'
                ? 'Create account'
                : 'Sign in'}
          </button>
        </form>

        <p className="login-footer">
          {mode === 'signup'
            ? 'Confirm your email address to activate your account.'
            : 'Use your Google account or an email address.'}
        </p>
      </div>
    </div>
  );
}