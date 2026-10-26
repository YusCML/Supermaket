import { supabase } from './supabase';
import type { AppRole } from '../types/app';

// Called right after someone logs in, as a safety net. The database already
// turns every new account into a customer with a loyalty profile (and a
// loyalty ID) the moment it's created. This just double-checks, in case that
// step was ever missed. People who are already set up are left exactly as
// they are, so admins stay admins. See
// supabase/migrations/20261026120000_roles_and_customer_accounts.sql.
//
// If it fails we just log it. The person can still use the app.
export async function ensureMyAccount(): Promise<void> {
  const { error } = await supabase.rpc('ensure_my_account');
  if (error) {
    console.warn('Could not set up customer account:', error.message);
  }
}

// What is this person allowed to do? Reads users.role, which is one of:
//   'admin'    -> POS + Inventory + Loyalty & Rewards
//   'cashier'  -> POS only
//   'customer' -> loyalty member (everyone starts here)
//
// The security rules always let you read your own row.
//
// If anything goes wrong we return null, which the app treats as "not an
// admin". Better to hide the admin tabs from a real admin by mistake than to
// show them to a cashier. The database blocks non-admins either way.
export async function getRole(userId: string): Promise<AppRole | null> {
  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.warn('Could not fetch user role:', error.message);
    return null;
  }

  // Only trust values we know about. Anything else counts as no role.
  const role = data?.role;
  if (role === 'admin' || role === 'cashier' || role === 'customer') {
    return role;
  }
  return null;
}

export async function getIsAdmin(userId: string): Promise<boolean> {
  const role = await getRole(userId);
  return role === 'admin';
}
