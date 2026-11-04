// LoginDialog.tsx: the sign-in / create-account pop-up.
//
// LandingPage shows it when the address is /login (see App.tsx). It never
// changes the address itself: closing it calls onOpenChange(false), and
// LandingPage then goes back to "/".
//
// Three ways in:
//   - "Continue with Google": Supabase sends the browser to Google and back.
//   - Sign in with email + password.
//   - Create account with email + password + confirm password.
// What's typed is checked with the zod rules in lib/validation.ts
// (loginSchema / signupSchema) before anything is sent. The actual sign-in
// functions come from AuthContext through useAuth(). When sign-in works,
// AuthContext notices the new user and LandingPage moves them on to /app.
//
// Built from the shared pieces in components/ui: Dialog (the pop-up window,
// from Base UI), Button, Input and Field (label + box + error message).
import { useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { loginSchema, signupSchema } from '../lib/validation';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Field } from './ui/field';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';

// Which of the two forms is showing. A "union type": the value must be
// exactly one of these two strings.
type Mode = 'signin' | 'signup';

// One error message per box, e.g. { email: 'Enter a valid email address' }.
// Record<keys, string> = an object with those keys and string values;
// Partial<...> makes every key optional, since usually only some boxes are wrong.
type FieldErrors = Partial<
  Record<'email' | 'password' | 'confirmPassword', string>
>;

// The props (inputs) LandingPage passes in. The parent decides whether the
// pop-up is open; this component only reports when the user closes it.
interface LoginDialogProps {
  // true = the pop-up is showing.
  open: boolean;
  // Called with false when the user closes it (Escape, the × button, or a
  // click outside the window).
  onOpenChange: (open: boolean) => void;
}

// The sign-in / create-account form, shown as a pop-up over the landing page
// (the same way the role picker pops up). LandingPage opens it at /login.
export default function LoginDialog({ open, onOpenChange }: LoginDialogProps) {
  const { signInWithGoogle, signUp, signInWithEmail } = useAuth();

  // useState gives the component a value it remembers between redraws, plus a
  // function to change it. Calling that function redraws the pop-up.

  // Which form is showing. Starts on "Sign in".
  const [mode, setMode] = useState<Mode>('signin');
  // What's typed in each box. Each <Input> shows its value and updates it on
  // every key press (a "controlled input": React state is the source of truth).
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Red messages under individual boxes (from the zod checks).
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // One red message at the top, for errors from Supabase (e.g. wrong password).
  const [formError, setFormError] = useState('');
  // One green message at the top (e.g. "Check your inbox...").
  const [notice, setNotice] = useState('');
  // true while waiting for Supabase. Every button and box is disabled until it
  // answers, so nobody can submit twice.
  const [loading, setLoading] = useState(false);

  // Switches between "Sign in" and "Create account". Old messages are cleared
  // because they belonged to the other form; what was typed is kept.
  function switchMode(next: Mode) {
    setMode(next);
    setFieldErrors({});
    setFormError('');
    setNotice('');
  }

  // "Continue with Google". When it works, the browser leaves this page for
  // Google's sign-in page and later comes back to the home page ("/"), signed
  // in (see signInWithGoogle in AuthContext). That's why `loading` is only
  // switched off when it fails: on success the page is being left anyway.
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

  // Runs when the "Sign in" form is submitted (button click or Enter).
  const handleSignIn = async (e: FormEvent) => {
    // Stop the browser's normal form submit, which would reload the page.
    e.preventDefault();
    setFormError('');
    setNotice('');
    setFieldErrors({});

    // Check the boxes first. safeParse never throws: it returns either
    // { success: true, data } or { success: false, error } with a list of
    // problems ("issues"). Each issue's path[0] names its box ('email',
    // 'password'), and only the first message per box is kept.
    // (The typeof check is because zod allows paths that aren't strings.)
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

    // All good: ask Supabase. result.data is the cleaned-up input (the email
    // trimmed and in lower case). On success there's nothing more to do here:
    // AuthContext picks up the new user and LandingPage takes them to /app.
    // `finally` runs whether it worked or failed.
    setLoading(true);
    try {
      await signInWithEmail(result.data);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  };

  // Runs when the "Create account" form is submitted. Same pattern as above.
  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    setNotice('');
    setFieldErrors({});

    // signupSchema also checks the password length and that both passwords
    // match. The "do not match" message belongs to confirmPassword (path:
    // ['confirmPassword'] in validation.ts), so it shows under that box.
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
      // When Supabase requires email confirmation, signUp returns no session:
      // the account exists but can't be used until the link in the email is
      // clicked. So we say so and clear the passwords. If a session DOES come
      // back, the person is already signed in and LandingPage moves them on.
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
  // aria-invalid also turns the box red (see ui/input.tsx), and
  // aria-describedby points at the message's id, which <Field> creates as
  // `${id}-error`. With no error it returns {}, so spreading it adds nothing.
  // (ui/field.tsx has the same helper, called invalidProps.)
  const errorProps = (field: keyof FieldErrors, id: string) =>
    fieldErrors[field] ? { 'aria-invalid': true, 'aria-describedby': `${id}-error` } : {};

  // The two "Sign in" / "Create account" switch buttons share this look.
  const modeTabClass = (tab: Mode) =>
    cn(
      'flex-1 rounded-full py-2 text-sm font-semibold transition-colors',
      mode === tab ? 'bg-brand text-white shadow-sm' : 'text-ink-muted hover:text-ink'
    );

  return (
    // Escape, the × button or clicking outside closes it (back to the landing page).
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* block + gap-0: the form sets its own spacing. overflow-y-auto: scrolls on short screens. */}
      {/* The cursor starts in the Email box, so people can type straight away. */}
      <DialogContent
        className="block gap-0 overflow-y-auto p-8"
        initialFocus={() => document.getElementById('auth-email')}
      >
        {/* Header */}
        <div className="text-center">
          {/* alt="" marks the logo as decoration: the title right under it
              already says the store's name. */}
          <img src="/logo.svg" alt="" className="mx-auto size-14" />
          <DialogTitle className="mt-3 text-2xl">
            SuperMarket <span className="text-brand-strong">Express</span>
          </DialogTitle>
          <DialogDescription className="mt-1">
            {mode === 'signup' ? 'Create your account' : 'Sign in to continue'}
          </DialogDescription>
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
        {/* role="status" is the polite version: read out once the screen
            reader has finished what it's saying. */}
        {notice && (
          <div role="status" className="mt-4 rounded-md border border-brand/20 bg-brand/10 p-3 text-sm font-medium text-brand-strong">
            {notice}
          </div>
        )}

        {/* Google sign-in */}
        <Button variant="outline" size="lg" className="mt-6 w-full gap-3" onClick={handleGoogle} disabled={loading}>
          {/* Google's coloured "G" logo, drawn as four SVG shapes. */}
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4818h4.8436c-.2086 1.125-.8427 2.0781-1.7963 2.7163v2.2581h2.9086c1.7026-1.5677 2.6841-3.8745 2.6841-6.6153z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.4673-.8063 5.9563-2.1805l-2.9086-2.2581c-.8063.54-1.8368.8586-3.0477.8586-2.3445 0-4.3286-1.5827-5.0368-3.7104H.9573v2.3318C2.4381 15.9831 5.4818 18 9 18z" />
            <path fill="#FBBC05" d="M3.9632 10.71c-.1801-.54-.2827-1.1173-.2827-1.71s.1026-1.17.2827-1.71V4.9582H.9573C.3477 6.1731 0 7.5477 0 9s.3477 2.8268.9573 4.0418L3.9632 10.71z" />
            <path fill="#EA4335" d="M9 3.5818c1.3213 0 2.5077.4541 3.4405 1.3459l2.5813-2.5813C13.4631.8909 11.4254 0 9 0 5.4818 0 2.4381 2.0168.9573 4.9582L3.9632 7.29C4.6714 5.1622 6.6555 3.5818 9 3.5818z" />
          </svg>
          {loading ? 'Please wait…' : 'Continue with Google'}
        </Button>

        {/* Divider */}
        {/* A grey line across the full width, with "or" on a white patch in
            the middle so the line seems to stop on either side of the word. */}
        <div className="relative my-6 text-center">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-gray-200" />
          </div>
          <span className="relative bg-white px-3 text-xs tracking-wider text-ink-muted uppercase">or</span>
        </div>

        {/* Email + password */}
        {/* One form for both modes; submitting runs the handler for the mode
            that's showing. noValidate turns off the browser's own pop-up
            checks (e.g. for type="email"), so our zod messages are the only
            ones and look the same in every browser. */}
        <form className="space-y-4" noValidate onSubmit={mode === 'signup' ? handleSignUp : handleSignIn}>
          {/* {...errorProps(...)} "spreads" the returned object onto the box,
              i.e. adds each of its keys as a prop (here, the aria-* props). */}
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

          {/* autoComplete helps password managers: 'new-password' offers to
              create a strong one, 'current-password' fills in the saved one. */}
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

          {/* Only when creating an account. `condition && <X />` shows X only
              when the condition is true. */}
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

        {/* Small hint at the bottom, different for each mode */}
        <p className="mt-6 text-center text-xs text-ink-muted">
          {mode === 'signup'
            ? 'Confirm your email address to activate your account.'
            : 'Use your Google account or an email address.'}
        </p>
      </DialogContent>
    </Dialog>
  );
}
