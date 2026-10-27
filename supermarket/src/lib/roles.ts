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

// Which roles does this person have? A person can hold several at once:
//   'customer' -> self-serve checkout. Everyone has this, always.
//   'cashier'  -> the till (any member) + read-only stock
//   'admin'    -> everything, including restocking and assigning roles
//
// Cashier and admin simply mean "has a row in the cashier / admin table"
// (see the role_interfaces_and_self_checkout migration). The security rules
// always let you read your own rows there.
//
// We also read users.role, which always holds the person's HIGHEST role. A
// role counts if either place says so. Once the migration has run they always
// agree; before it runs, users.role is what the database itself goes by, so
// this keeps the app working in the meantime.
//
// The list always comes back in the same order (customer, cashier, admin) so
// the "Continue as" screen lists them the same way every time.
//
// If a lookup fails we leave that role out. Better to hide the admin tabs from
// a real admin by mistake than to show them to someone who isn't one. The
// database blocks non-admins either way.
export async function getMyRoles(userId: string): Promise<AppRole[]> {
  const [userRow, cashierRow, adminRow] = await Promise.all([
    supabase.from('users').select('role').eq('id', userId).maybeSingle(),
    supabase.from('cashier').select('user_id').eq('user_id', userId).maybeSingle(),
    supabase.from('admin').select('user_id').eq('user_id', userId).maybeSingle(),
  ]);

  if (userRow.error) console.warn('Could not fetch user role:', userRow.error.message);
  if (cashierRow.error) console.warn('Could not check cashier role:', cashierRow.error.message);
  if (adminRow.error) console.warn('Could not check admin role:', adminRow.error.message);

  const mainRole = userRow.data?.role;
  const roles: AppRole[] = ['customer'];
  if (cashierRow.data || mainRole === 'cashier') roles.push('cashier');
  if (adminRow.data || mainRole === 'admin') roles.push('admin');
  return roles;
}

// All roles in display order. Used to sort a role list the same way everywhere.
export const ALL_ROLES: AppRole[] = ['customer', 'cashier', 'admin'];

// How each role is shown on the "Continue as" screen, and which page it opens.
export const ROLE_INFO: Record<
  AppRole,
  { label: string; icon: string; description: string; home: string }
> = {
  customer: {
    label: 'Customer',
    icon: '🛍️',
    description: 'Self-serve checkout on your own loyalty account',
    home: '/self-serve',
  },
  cashier: {
    label: 'Cashier',
    icon: '🧾',
    description: 'Ring up customer orders and check stock levels',
    home: '/cashier',
  },
  admin: {
    label: 'Admin',
    icon: '🛠️',
    description: 'Restock, manage members, view analytics and assign roles',
    home: '/admin',
  },
};
