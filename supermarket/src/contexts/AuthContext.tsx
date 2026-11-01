// AuthContext.tsx: who is signed in, which roles they have, and the
// functions to sign in, create an account and sign out.
//
// A React "Context" shares a value with every component inside it, without
// passing it down as props through every layer. src/main.tsx wraps the whole
// app in <AuthProvider>, so any component can call useAuth() to read it.
//
// Used by: ProtectedRoute (who may open a page), LoginDialog (sign in / up),
// RolePickerPage and RolePickerDialog (which role to continue as),
// AccountMenu (sign out), LandingPage, AdminPage, UserRoles, POS and
// useStoreData (to know who the user is).
//
// Signing in itself is done by Supabase Auth (Supabase's sign-in service).
// After sign-in, the roles come from src/lib/roles.ts.
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { ensureMyAccount, getMyRoles, rememberSignInRedirect, takeSignInRedirect } from '../lib/roles';
import type { AppRole } from '../types/app';
import type { LoginInput, SignupInput } from '../lib/validation';

// Everything useAuth() gives you.
interface AuthContextValue {
  // The signed-in person as Supabase describes them (id, email...), or null
  // when nobody is signed in.
  user: User | null;
  // The current login itself (including the access token Supabase sends
  // with each request), or null.
  session: Session | null;
  // Every role this person holds, i.e. every interface they may sign in as,
  // e.g. ['customer', 'cashier']. Only meaningful once roleLoading is false.
  availableRoles: AppRole[];
  // Shortcut for availableRoles.includes('admin').
  isAdmin: boolean;
  // True while the roles of the signed-in person are still being looked up.
  roleLoading: boolean;
  // Look the roles up again (e.g. after an admin edits their own roles).
  refreshRoles: () => void;
  // True only at start-up, while Supabase checks for a saved login.
  loading: boolean;
  // The sign-in / sign-up / sign-out functions (explained where they're
  // defined below). Each returns a Promise and throws if Supabase says no.
  signInWithGoogle: () => Promise<void>;
  signUp: (input: SignupInput) => Promise<{ user: User | null; session: Session | null }>;
  signInWithEmail: (input: LoginInput) => Promise<void>;
  signOut: () => Promise<void>;
}

// The context itself. It starts as `undefined`, meaning "no provider above
// me"; useAuth() at the bottom turns that into a clear error.
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// The provider component: holds the sign-in state and shares it with
// everything inside it (`children` = whatever is placed between
// <AuthProvider> and </AuthProvider>; ReactNode = "anything React can show").
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // The roles we looked up, together with WHOSE roles they are. Keeping the
  // user id next to them lets us tell "still looking it up" apart from
  // "looked it up, they're only a customer". With a plain roles + loading flag
  // there's a split second right after login where the roles are empty but
  // nothing is loading yet, and a cashier opening /cashier would get bounced
  // back to the role picker before their roles arrived.
  const [roleLookup, setRoleLookup] = useState<{
    userId: string;
    roles: AppRole[];
  } | null>(null);

  // Bumping this number makes the lookup below run again.
  const [roleRefreshCount, setRoleRefreshCount] = useState(0);
  const refreshRoles = () => setRoleRefreshCount((count) => count + 1);

  // Keep `user` and `session` in step with Supabase.
  // useEffect with an empty list [] runs once, after the provider first
  // appears on screen. The function it returns is the "clean-up", which React
  // runs when the provider is removed.
  useEffect(() => {
    // Set to false by the clean-up, so a late answer is ignored.
    let active = true;

    // 1. On start-up, ask Supabase for a login saved in the browser from
    //    last time (so people stay signed in after a page reload).
    //    .then runs when the answer arrives, .catch if it fails, and
    //    .finally either way: the start-up check is done, so loading = false.
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!active) return;
        setSession(session);
        setUser(session?.user ?? null);
      })
      .catch((err) => {
        console.error('Failed to restore session:', err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    // 2. From then on, Supabase calls us back whenever the login changes:
    //    signed in, signed out, or the token quietly refreshed. (`_event` says
    //    which; the underscore marks it as unused.)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    // 3. Clean-up: stop listening, so we don't update a provider that's gone.
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Whenever a different person logs in:
  //   1. make sure they exist as a customer (normally the database already did
  //      this when the account was created; this is the safety net), then
  //   2. look up their roles (customer, plus cashier / admin if they have them).
  // Step 1 has to finish first, or a first-timer's lookup could miss them.
  //
  // We watch the id rather than the user object because Supabase gives us a
  // fresh object on every session refresh, and there's no need to redo this
  // for the same person each time.
  const userId = user?.id;

  // Still loading = someone is signed in, but the roles we have on file
  // aren't theirs yet. Signed out = no roles at all.
  // These three are worked out on every redraw from the state above, rather
  // than stored separately, so they can never get out of step with it.
  // (`!!userId` turns the id into true/false: true if there is one.)
  const roleLoading = !!userId && roleLookup?.userId !== userId;
  const availableRoles: AppRole[] =
    userId && roleLookup?.userId === userId ? roleLookup.roles : [];
  const isAdmin = availableRoles.includes('admin');

  // The role lookup described above. It runs again whenever userId changes
  // (someone signs in or out) or refreshRoles() bumps roleRefreshCount.
  useEffect(() => {
    // Signed out: forget the old roles, so signing back in looks them up
    // fresh (an admin may have changed them in the meantime).
    if (!userId) {
      setRoleLookup(null);
      return;
    }

    // If the user changes again before this lookup finishes, ignore the old answer.
    let cancelled = false;

    // A Promise chain: each step starts when the one before it has finished.
    ensureMyAccount()
      .then(() => getMyRoles(userId))
      // Both of those already log their own errors. If something still blows
      // up, carry on as a plain customer rather than "loading" forever.
      .catch((): AppRole[] => ['customer'])
      .then((roles) => {
        if (!cancelled) setRoleLookup({ userId, roles });
      });

    return () => {
      cancelled = true;
    };
  }, [userId, roleRefreshCount]);

  // Sign in with a Google account. The browser leaves for Google's sign-in
  // page; afterwards Google sends the person back to this site's home address
  // (window.location.origin, e.g. http://localhost:3000), and Supabase picks
  // up the new login there (onAuthStateChange above then fires).
  // rememberSignInRedirect() (lib/roles.ts) leaves a note first, so the home
  // page knows to send them on into the app instead of leaving them there.
  // If starting the Google sign-in fails, the note is taken back.
  const signInWithGoogle = async () => {
    rememberSignInRedirect();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      takeSignInRedirect();
      throw error;
    }
  };

  // Create an account with email + password (already checked by
  // signupSchema). The database then sets the new person up as a customer
  // with a loyalty ID automatically.
  // `emailRedirectTo` is where the "confirm your email" link leads back to.
  // Returns Supabase's answer: if the project requires email confirmation,
  // `session` is null until the person clicks that link, so LoginDialog can
  // tell them to check their inbox.
  const signUp = async ({ email, password }: SignupInput) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
    return { user: data.user, session: data.session };
  };

  // Sign in with email + password. Nothing is returned: on success Supabase
  // fires onAuthStateChange, which sets `user` and starts the role lookup.
  const signInWithEmail = async ({ email, password }: LoginInput) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  // Sign out. Supabase forgets the saved login and fires onAuthStateChange
  // with no session, so `user` becomes null and the roles are cleared.
  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  // Share all of it with every component inside the provider.
  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        availableRoles,
        isAdmin,
        roleLoading,
        refreshRoles,
        loading,
        signInWithGoogle,
        signUp,
        signInWithEmail,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// The hook every component uses: `const { user, signOut } = useAuth();`.
// useContext reads the value from the nearest <AuthProvider> above. If there
// isn't one (a setup mistake), fail loudly with a clear message instead of
// handing back undefined and crashing somewhere less obvious.
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}