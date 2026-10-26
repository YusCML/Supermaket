import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { ensureMyAccount, getRole } from '../lib/roles';
import type { AppRole } from '../types/app';
import type { LoginInput, SignupInput } from '../lib/validation';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  isAdmin: boolean;
  roleLoading: boolean;
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
  const [role, setRole] = useState<AppRole | null>(null);
  const isAdmin = role === 'admin';
  const [roleLoading, setRoleLoading] = useState(false);
  const [loading, setLoading] = useState(true);

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
  //   1. make sure they exist as a customer (first-timers get set up here,
  //      which is what puts them in the Loyalty & Rewards list), then
  //   2. look up their role (admin / cashier / customer from users.role).
  // Step 1 has to finish first, or a first-timer's role would come back empty.
  //
  // We watch the id rather than the user object because Supabase gives us a
  // fresh object on every session refresh, and there's no need to redo this
  // for the same person each time.
  const userId = user?.id;

  useEffect(() => {
    if (!userId) {
      setRole(null);
      setRoleLoading(false);
      return;
    }

    // If the user changes again before this lookup finishes, ignore the old answer.
    let cancelled = false;
    setRoleLoading(true);

    ensureMyAccount()
      .then(() => getRole(userId))
      .then((value) => {
        if (!cancelled) setRole(value);
      })
      .finally(() => {
        if (!cancelled) setRoleLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

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
        role,
        isAdmin,
        roleLoading,
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