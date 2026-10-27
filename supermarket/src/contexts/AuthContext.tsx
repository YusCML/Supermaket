import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { ensureMyAccount, getMyRoles } from '../lib/roles';
import type { AppRole } from '../types/app';
import type { LoginInput, SignupInput } from '../lib/validation';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  // Every role this person holds, i.e. every interface they may sign in as,
  // e.g. ['customer', 'cashier']. Only meaningful once roleLoading is false.
  availableRoles: AppRole[];
  isAdmin: boolean;
  roleLoading: boolean;
  // Look the roles up again (e.g. after an admin edits their own roles).
  refreshRoles: () => void;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signUp: (input: SignupInput) => Promise<{ user: User | null; session: Session | null }>;
  signInWithEmail: (input: LoginInput) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

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

  useEffect(() => {
    let active = true;

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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

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
  const roleLoading = !!userId && roleLookup?.userId !== userId;
  const availableRoles: AppRole[] =
    userId && roleLookup?.userId === userId ? roleLookup.roles : [];
  const isAdmin = availableRoles.includes('admin');

  useEffect(() => {
    // Signed out: forget the old roles, so signing back in looks them up
    // fresh (an admin may have changed them in the meantime).
    if (!userId) {
      setRoleLookup(null);
      return;
    }

    // If the user changes again before this lookup finishes, ignore the old answer.
    let cancelled = false;

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

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  };

  const signUp = async ({ email, password }: SignupInput) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
    return { user: data.user, session: data.session };
  };

  const signInWithEmail = async ({ email, password }: LoginInput) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

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

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}