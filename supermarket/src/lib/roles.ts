import { supabase } from './supabase';
import type { AppRole } from '../types/app';

// What is this person allowed to do? Reads users.role, which is one of:
//   'admin'    -> POS + Inventory + Loyalty & Rewards
//   'cashier'  -> POS only
//   'customer' -> loyalty member (every new sign-up starts here)
//
// Every account gets a public.users row automatically when it signs up (see
// supabase/migrations/20261026120000_role_helpers_and_signup.sql), and the
// security rules always let you read your own row.
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
