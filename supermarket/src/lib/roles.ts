// roles.ts: everything about the three roles (customer, cashier, admin).
//
//   - ensureMyAccount() and getMyRoles() are called by AuthContext.tsx right
//     after someone signs in, to find out which screens they may use.
//   - ALL_ROLES and ROLE_INFO describe the roles for the screens: the
//     "Continue as" picker (RolePickerPage / RolePickerDialog), the account
//     menu, the Users & Roles tab, and the role icons (src/ui/roleIcons.tsx).
//   - rememberSignInRedirect() / takeSignInRedirect() let someone coming back
//     from Google sign-in carry on into the app (AuthContext + LandingPage).
//
// Remember: these checks only decide what the app SHOWS. The database checks
// roles again on every request (is_admin() / is_staff()), so hiding or showing
// a tab here can't give anyone extra powers.
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
//
// Database function ensure_my_account() takes no inputs: the database knows
// who is calling from their login. It adds a `users` row and a `customer`
// (loyalty) row only if they're missing, and returns nothing.
export async function ensureMyAccount(): Promise<void> {
  const { error } = await supabase.rpc('ensure_my_account');
  if (error) {
    console.warn('Could not set up customer account:', error.message);
  }
}

// Which roles does this person have? A person can hold several at once:
//   'customer' -> self-serve checkout (the shop). Everyone has this, always.
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
// Admins also get 'cashier', even without a row in the cashier table: an admin
// can do everything a cashier can (the database's is_staff() lets admins in
// too), so their picker offers all three screens. What each person sees after
// signing in therefore works out as:
//   customer only     -> straight into the shop (no picker; see RolePickerPage)
//   cashier           -> picks Customer or Cashier
//   admin             -> picks Customer, Cashier or Admin
//
// The list always comes back in the same order (customer, cashier, admin) so
// the "Continue as" screen lists them the same way every time.
//
// If a lookup fails we leave that role out. Better to hide the admin tabs from
// a real admin by mistake than to show them to someone who isn't one. The
// database blocks non-admins either way.
//
// Input: the signed-in person's user id. Output: e.g. ['customer', 'admin'].
export async function getMyRoles(userId: string): Promise<AppRole[]> {
  // Three small reads sent at the same time (Promise.all waits for all three):
  //   table users   -> their `role` column
  //   table cashier -> is there a row for them?
  //   table admin   -> is there a row for them?
  // .maybeSingle() means "zero or one row": `data` is the row, or null if
  // there isn't one. (Plain .single() would treat "no row" as an error.)
  const [userRow, cashierRow, adminRow] = await Promise.all([
    supabase.from('users').select('role').eq('id', userId).maybeSingle(),
    supabase.from('cashier').select('user_id').eq('user_id', userId).maybeSingle(),
    supabase.from('admin').select('user_id').eq('user_id', userId).maybeSingle(),
  ]);

  if (userRow.error) console.warn('Could not fetch user role:', userRow.error.message);
  if (cashierRow.error) console.warn('Could not check cashier role:', cashierRow.error.message);
  if (adminRow.error) console.warn('Could not check admin role:', adminRow.error.message);

  // Build the list in the fixed order customer, cashier, admin. A failed
  // lookup leaves `data` null, so that role is simply not added.
  const mainRole = userRow.data?.role;
  const isAdmin = !!adminRow.data || mainRole === 'admin';
  const roles: AppRole[] = ['customer'];
  // `|| isAdmin`: admins get the Cashier screen too (see above).
  if (cashierRow.data || mainRole === 'cashier' || isAdmin) roles.push('cashier');
  if (isAdmin) roles.push('admin');
  return roles;
} 

// ── Coming back from Google sign-in ──────────────────────────────────────────
// Google sends people back to the home page ("/"), not into the app (see
// signInWithGoogle in AuthContext). To carry on into the app from there
// (straight into the shop for customers, the role picker for staff), we leave
// a note in sessionStorage just before leaving for Google, and the landing page
// picks it up when they come back.
//
// sessionStorage is a small key/value store the browser keeps for this tab
// only. It survives the trip to Google and back (same tab, same site) and is
// wiped when the tab is closed. The try/catch is there because some browsers
// block storage (e.g. strict privacy modes); then the note is simply skipped
// and the person clicks "Shop now" / "Open POS" themselves.
const SIGN_IN_REDIRECT_KEY = 'supermarket:continue-after-sign-in';

// Called by AuthContext right before the browser leaves for Google.
export function rememberSignInRedirect(): void {
  try {
    sessionStorage.setItem(SIGN_IN_REDIRECT_KEY, '1');
  } catch {
    // Storage blocked: nothing to remember. See above.
  }
}

// Called by the landing page. Returns true if a Google sign-in was just
// started from this tab, and deletes the note either way, so it only ever
// counts once (e.g. "Back to homepage" later doesn't bounce into the app).
export function takeSignInRedirect(): boolean {
  try {
    const wasSet = sessionStorage.getItem(SIGN_IN_REDIRECT_KEY) === '1';
    sessionStorage.removeItem(SIGN_IN_REDIRECT_KEY);
    return wasSet;
  } catch {
    return false;
  }
}

// All roles in display order. Used to sort a role list the same way everywhere.
export const ALL_ROLES: AppRole[] = ['customer', 'cashier', 'admin'];

// How each role is shown on the "Continue as" screen, and which page it opens.
//   label       the name shown to people
//   icon        a NAME of an icon; src/ui/roleIcons.tsx turns it into the
//               actual lucide-react icon, so this file stays plain data and
//               doesn't need to import any icons itself
//   description the one-line explanation under the label
//   home        the URL that role's screen lives at (see App.tsx)
// `Record<AppRole, {...}>` means TypeScript insists there's an entry for
// every role, so adding a new role without describing it won't compile.
export const ROLE_INFO: Record<
  AppRole,
  { label: string; icon: 'shopping-bag' | 'receipt' | 'wrench'; description: string; home: string }
> = {
  customer: {
    label: 'Customer',
    icon: 'shopping-bag',
    description: 'Self-serve checkout on your own loyalty account',
    home: '/self-serve',
  },
  cashier: {
    label: 'Cashier',
    icon: 'receipt',
    description: 'Ring up customer orders and check stock levels',
    home: '/cashier',
  },
  admin: {
    label: 'Admin',
    icon: 'wrench',
    description: 'Restock, manage members, view analytics and assign roles',
    home: '/admin',
  },
};