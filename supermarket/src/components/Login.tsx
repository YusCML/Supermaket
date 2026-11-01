import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { loginSchema, signupSchema } from '../lib/validation';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Field } from './ui/field';

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

  // Links an input to its error message (if any), so screen readers read the
  // error out when the field is focused.
  const errorProps = (field: keyof FieldErrors, id: string) =>
    fieldErrors[field] ? { 'aria-invalid': true, 'aria-describedby': `${id}-error` } : {};

  // The two "Sign in" / "Create account" switch buttons share this look.
  const modeTabClass = (tab: Mode) =>
    cn(
      'flex-1 rounded-full py-2 text-sm font-semibold transition-colors',
      mode === tab ? 'bg-brand text-white shadow-sm' : 'text-ink-muted hover:text-ink'
    );

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        {/* Back to homepage link */}
        <div className="-mt-2 mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted transition-colors hover:text-brand-strong"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to homepage
          </Link>
        </div>

        {/* Header */}
        <div className="text-center">
          <img src="/logo.svg" alt="" className="mx-auto size-14" />
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-ink">
            SuperMarket <span className="text-brand-strong">Express</span>
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {mode === 'signup' ? 'Create your account' : 'Sign in to continue'}
          </p>
        </div>

        {/* Sign in / Create account switch. aria-pressed tells screen readers which one is on. */}
        <div className="mt-6 flex rounded-full border border-gray-200 bg-subtle p-1">
          <button
            type="button"
            className={modeTabClass('signin')}
            aria-pressed={mode === 'signin'}
            onClick={() => switchMode('signin')}
            disabled={loading}
          >
            Sign in
          </button>
          <button
            type="button"
            className={modeTabClass('signup')}
            aria-pressed={mode === 'signup'}
            onClick={() => switchMode('signup')}
            disabled={loading}
          >
            Create account
          </button>
        </div>

        {/* Messages. role="alert" makes screen readers announce the error straight away. */}
        {formError && (
          <div role="alert" className="mt-4 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm font-medium text-danger-strong">
            {formError}
          </div>
        )}
        {notice && (
          <div role="status" className="mt-4 rounded-md border border-brand/20 bg-brand/10 p-3 text-sm font-medium text-brand-strong">
            {notice}
          </div>
        )}

        {/* Google sign-in */}
        <Button variant="outline" size="lg" className="mt-6 w-full gap-3" onClick={handleGoogle} disabled={loading}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4818h4.8436c-.2086 1.125-.8427 2.0781-1.7963 2.7163v2.2581h2.9086c1.7026-1.5677 2.6841-3.8745 2.6841-6.6153z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.4673-.8063 5.9563-2.1805l-2.9086-2.2581c-.8063.54-1.8368.8586-3.0477.8586-2.3445 0-4.3286-1.5827-5.0368-3.7104H.9573v2.3318C2.4381 15.9831 5.4818 18 9 18z" />
            <path fill="#FBBC05" d="M3.9632 10.71c-.1801-.54-.2827-1.1173-.2827-1.71s.1026-1.17.2827-1.71V4.9582H.9573C.3477 6.1731 0 7.5477 0 9s.3477 2.8268.9573 4.0418L3.9632 10.71z" />
            <path fill="#EA4335" d="M9 3.5818c1.3213 0 2.5077.4541 3.4405 1.3459l2.5813-2.5813C13.4631.8909 11.4254 0 9 0 5.4818 0 2.4381 2.0168.9573 4.9582L3.9632 7.29C4.6714 5.1622 6.6555 3.5818 9 3.5818z" />
          </svg>
          {loading ? 'Please wait…' : 'Continue with Google'}
        </Button>

        {/* Divider */}
        <div className="relative my-6 text-center">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-gray-200" />
          </div>
          <span className="relative bg-white px-3 text-xs tracking-wider text-ink-muted uppercase">or</span>
        </div>

        {/* Email + password */}
        <form className="space-y-4" noValidate onSubmit={mode === 'signup' ? handleSignUp : handleSignIn}>
          <Field label="Email" htmlFor="auth-email" error={fieldErrors.email}>
            <Input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              disabled={loading}
              {...errorProps('email', 'auth-email')}
            />
          </Field>

          <Field
            label="Password"
            htmlFor="auth-password"
            error={fieldErrors.password}
            hint={mode === 'signup' ? 'At least 8 characters.' : undefined}
          >
            <Input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              disabled={loading}
              {...errorProps('password', 'auth-password')}
            />
          </Field>

          {mode === 'signup' && (
            <Field label="Confirm password" htmlFor="auth-confirm" error={fieldErrors.confirmPassword}>
              <Input
                id="auth-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                disabled={loading}
                {...errorProps('confirmPassword', 'auth-confirm')}
              />
            </Field>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-ink-muted">
          {mode === 'signup'
            ? 'Confirm your email address to activate your account.'
            : 'Use your Google account or an email address.'}
        </p>
      </div>
    </div>
  );
}
