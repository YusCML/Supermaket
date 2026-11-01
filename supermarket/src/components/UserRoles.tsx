// ════════════════════════════════════════════════════════════════════════════
// UserRoles.tsx: the "Users & Roles" tab. Only admins see it (it is one of
// the tabs in AdminPage, which is behind the admin-only route).
//
// Everyone who signs up is a Customer. Here an admin ticks boxes to ALSO make
// someone a Cashier and/or an Admin, then presses Save on that person's row.
//
// Where the data comes from (all passed in as props by AdminPage; "props" are
// the inputs a parent component gives a child, like function arguments):
//   users        everyone with a loyalty account (api.getCustomers)
//   staffRoles   who is a cashier / admin. api.getStaffRoles() reads the
//                `cashier` and `admin` tables (one row per person with that
//                role). AdminPage loads it again each time this tab opens.
//   rolesStatus  whether staffRoles has finished loading (see below)
//   onSaveRoles  saves one person's roles: api.setUserRoles() calls the
//                database function set_user_roles (migration
//                20261027120000_role_interfaces_and_self_checkout.sql), then
//                AdminPage reloads staffRoles so the table shows the result.
//
// Who may change what:
//   - Only admins. set_user_roles checks is_admin() inside the database, so a
//     tampered browser still can't change anyone's role.
//   - Customer can never be removed: everyone keeps their loyalty account.
//   - You can't remove your OWN admin role. The box is locked here, and the
//     database refuses it too. That way the store can never be left with no
//     admin. Your own Cashier role you may change freely.
//   - The person sees their new options the next time they sign in or
//     refresh the page. (If you change your own roles, AdminPage refreshes
//     them for you straight away.)
//
// Ticks are NOT saved the moment you click. They wait in `pending` until you
// press that row's Save (and confirm), so a mis-click is easy to undo.
// ════════════════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { Search } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNotify } from '../contexts/NotifyContext';
import { ALL_ROLES, ROLE_INFO } from '../lib/roles';
import type { AppRole, Customer } from '../types/app';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { StatusText } from './ui/status-text';
import { Input } from './ui/input';
import { RichSelect } from './ui/rich-select';
import PageHeader from './PageHeader';
import LoadingPanel from './LoadingPanel';

// The props this component accepts (an `interface` describes an object's shape).
interface UserRolesProps {
  // Everyone who can be given a role.
  users: Customer[];
  // Staff roles by user id, e.g. { "a1b2…": ['cashier', 'admin'] }.
  // `Record<string, AppRole[]>` means "an object whose keys are text and whose
  // values are lists of roles". People with no staff role aren't in it at all.
  staffRoles: Record<string, AppRole[]>;
  // Whether staffRoles has finished loading. The table only appears once it's
  // 'ready', so nobody edits roles against an empty or out-of-date list.
  // Why that matters: with an empty list everyone looks like "customer only".
  // Ticking Cashier for a real admin would then build the list
  // [customer, cashier] and saving it would quietly REMOVE their admin role.
  rolesStatus: 'loading' | 'ready' | 'error';
  // The "Try again" button when loading the roles failed.
  onRetryRoles: () => void;
  // Saves the FULL list of roles one person should have. It returns a Promise
  // (a value that arrives later), so we can `await` it and then show a message.
  onSaveRoles: (userId: string, roles: AppRole[]) => Promise<void>;
}

// The choices in the "Show which users" dropdown. A union of fixed strings
// like this means TypeScript refuses any other value.
type RoleFilter = 'all' | 'cashier' | 'admin' | 'customer-only';

// True if two role lists hold the same roles, whatever order they're in.
// For each of the three roles it asks "is it in both lists, or in neither?";
// `.every(...)` is true only if that holds for all three.
function sameRoles(a: AppRole[], b: AppRole[]) {
  return ALL_ROLES.every((role) => a.includes(role) === b.includes(role));
}

export default function UserRoles({ users, staffRoles, rolesStatus, onRetryRoles, onSaveRoles }: UserRolesProps) {
  // The signed-in admin, so their own row can say "(You)" and lock their
  // own Admin box.
  const { user } = useAuth();
  // notify() pops up a short message; askToConfirm() opens an "Are you sure?"
  // box and gives back true (confirmed) or false (cancelled).
  const { notify, askToConfirm } = useNotify();
  // useState = a value this component remembers between redraws; calling the
  // "set" function changes it and redraws the screen.
  // What's typed in the search box.
  const [search, setSearch] = useState('');
  // Which group the dropdown is showing (all / cashiers / admins / customers only).
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  // PENDING (unsaved) changes: user id -> the ticks shown on screen right now.
  // Only people whose boxes were clicked are in here. The saved roles stay in
  // staffRoles (from the database) until Save succeeds, so the screen can
  // compare the two and mark the row "Unsaved".
  const [pending, setPending] = useState<Record<string, AppRole[]>>({});
  // The id of the person whose row is being saved right now (null = nobody).
  // That row's boxes and buttons are switched off until the save finishes.
  const [savingId, setSavingId] = useState<string | null>(null);

  // A person's roles as saved in the database: always 'customer', plus any
  // staff roles. `...` (spread) copies the items of one list into another, and
  // `?? []` uses an empty list when they have no staff roles.
  const savedRolesOf = (userId: string): AppRole[] => [
    'customer',
    ...(staffRoles[userId] ?? []),
  ];

  // The rows to show: first the dropdown filter, then the search text.
  // The filter looks at SAVED roles, so ticking a box doesn't make a row
  // jump out of the list before it's saved. "Customers only" means the person
  // has nothing but 'customer' (a list of length 1).
  const query = search.toLowerCase().trim();
  const visibleUsers = users.filter((u) => {
    const roles = savedRolesOf(u.id);
    if (roleFilter === 'cashier' && !roles.includes('cashier')) return false;
    if (roleFilter === 'admin' && !roles.includes('admin')) return false;
    if (roleFilter === 'customer-only' && roles.length > 1) return false;
    if (!query) return true;
    return (
      (u.name || '').toLowerCase().includes(query) ||
      (u.email || '').toLowerCase().includes(query) ||
      (u.loyalty_id || '').toLowerCase().includes(query)
    );
  });

  // Called when a box is ticked or unticked. Nothing is saved yet: it only
  // records the new set of ticks for that person in `pending`.
  // setPending is given a function (prev => next) so it always starts from
  // the newest state, even if several clicks happen quickly.
  // The new list is built in ALL_ROLES order: the clicked role gets the new
  // tick, every other role keeps what it had (unsaved tick if any, else saved).
  const toggleRole = (userId: string, role: AppRole, checked: boolean) => {
    setPending((prev) => {
      const current = prev[userId] ?? savedRolesOf(userId);
      const next = ALL_ROLES.filter((r) => (r === role ? checked : current.includes(r)));
      return { ...prev, [userId]: next };
    });
  };

  // The row's Save button.
  //   1. Stop if nothing really changed.
  //   2. Ask "Change roles?" and stop if the admin cancels.
  //   3. Send the FULL new list to the database (via AdminPage -> api.setUserRoles
  //      -> set_user_roles). The database adds/removes the cashier and admin
  //      rows to match it, and refuses if you try to drop your own admin role.
  //   4. On success, forget the pending ticks: the reloaded staffRoles now
  //      holds the same thing. On failure, keep them so the admin can retry.
  const handleSave = async (member: Customer) => {
    const newRoles = pending[member.id];
    if (!newRoles || sameRoles(newRoles, savedRolesOf(member.id))) return;

    // Readable names for the messages, e.g. "Customer, Cashier".
    const who = member.name || member.email;
    const labels = newRoles.map((r) => ROLE_INFO[r].label).join(', ');
    // `await` pauses here until the admin answers the question.
    const ok = await askToConfirm({
      title: 'Change roles?',
      message: `Set ${who}'s roles to: ${labels}.`,
      confirmLabel: 'Save roles',
    });
    if (!ok) return;

    setSavingId(member.id);
    // try / catch / finally: `catch` runs if saving throws an error (e.g. the
    // database said no), and `finally` runs either way, so the row is always
    // switched back on afterwards.
    try {
      await onSaveRoles(member.id, newRoles);
      // Remove this person from `pending`. React state must not be changed in
      // place, so we copy the object, delete from the copy, and return it.
      setPending((prev) => {
        const next = { ...prev };
        delete next[member.id];
        return next;
      });
      notify(`${who} is now: ${labels}.`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not change the roles', 'error');
    } finally {
      setSavingId(null);
    }
  };

  // The row's Undo button: throw away the unsaved ticks, so the row shows the
  // saved roles again.
  const handleUndo = (userId: string) => {
    setPending((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Title + a short explanation of what each role can do. The <> ... </>
          around the description is a Fragment: a wrapper that groups several
          pieces without adding an extra element to the page. */}
      <PageHeader
        title="Users & Roles"
        description={
          <>
            Everyone is a <strong className="text-ink">Customer</strong> (self-serve and loyalty points). Tick{' '}
            <strong className="text-ink">Cashier</strong> to let someone ring up sales and view stock, and{' '}
            <strong className="text-ink">Admin</strong> for full access, including restocking and assigning roles. A
            person can have both. They get the new options the next time they sign in or refresh the page.
          </>
        }
      />

      {/* ── Search box + "Show which users" filter + how many are shown ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:w-80">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-subtle"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Search users"
            maxLength={100}
            className="pl-10"
            placeholder="Search name, email or loyalty ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        {/* `(value || 'all') as RoleFilter`: fall back to "all" if the
            dropdown ever sends an empty value, and tell TypeScript the text
            is one of the RoleFilter choices. */}
        <RichSelect
          label="Show which users"
          hideLabel
          className="w-full sm:w-52"
          placeholder="All users"
          value={roleFilter}
          onValueChange={(value) => setRoleFilter((value || 'all') as RoleFilter)}
          options={[
            { value: 'all', label: 'All users' },
            { value: 'cashier', label: 'Cashiers' },
            { value: 'admin', label: 'Admins' },
            { value: 'customer-only', label: 'Customers only' },
          ]}
        />
        <span className="text-xs text-ink-muted sm:ml-auto">
          Showing {visibleUsers.length} of {users.length}
        </span>
      </div>

      {/* ── Roles still loading, or failed to load ──
          `condition && <X />` shows X only when the condition is true.
          While loading or after an error there is NO table, so no box can be
          ticked against a wrong list of roles (see rolesStatus above). */}
      {rolesStatus === 'loading' && <LoadingPanel message="Loading everyone's roles…" />}
      {rolesStatus === 'error' && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger-strong"
        >
          <span className="font-medium">
            Couldn't load everyone's roles, so editing is switched off for now (to avoid removing a role by mistake).
          </span>
          <Button variant="outline" size="sm" onClick={onRetryRoles}>
            Try again
          </Button>
        </div>
      )}

      {/* The table only appears once the real roles are loaded. */}
      {rolesStatus === 'ready' && (
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-ink">
            <thead className="border-b border-gray-200 bg-subtle text-xs font-semibold text-ink-muted">
              <tr>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Loyalty ID</th>
                {/* One column per role: Customer, Cashier, Admin. */}
                {ALL_ROLES.map((role) => (
                  <th key={role} className="px-4 py-3 text-center">
                    {ROLE_INFO[role].label}
                  </th>
                ))}
                <th className="px-4 py-3 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {/* No matches: one message spanning every column
                  (Member + Loyalty ID + Actions = 3, plus one per role). */}
              {visibleUsers.length === 0 ? (
                <tr>
                  <td colSpan={3 + ALL_ROLES.length} className="px-4 py-8 text-center text-ink-muted">
                    No users found.
                  </td>
                </tr>
              ) : (
                visibleUsers.map((member) => {
                  // Is this row the signed-in admin? (`user?.id`: the `?.`
                  // gives undefined instead of crashing if nobody is signed in.)
                  const isMe = member.id === user?.id;
                  // What the database has for them.
                  const savedRoles = savedRolesOf(member.id);
                  // What the boxes show: unsaved ticks if any, else the saved roles.
                  const shownRoles = pending[member.id] ?? savedRoles;
                  // Different from the database? Then show "Unsaved" and enable Save/Undo.
                  const hasChange = !sameRoles(shownRoles, savedRoles);
                  const isSaving = savingId === member.id;

                  return (
                    // Rows with unsaved ticks get a pale yellow background so
                    // they're easy to spot before leaving the page.
                    <tr
                      key={member.id}
                      className={cn('transition-colors', hasChange ? 'bg-warning/10' : 'hover:bg-subtle/60')}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 font-semibold text-ink">
                          {member.name || 'N/A'}
                          {isMe && <StatusText tone="success">(You)</StatusText>}
                          {hasChange && <StatusText tone="warning">Unsaved</StatusText>}
                        </div>
                        <div className="text-xs text-ink-muted">{member.email}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-ink-muted">{member.loyalty_id || '—'}</td>
                      {/* One checkbox per role. */}
                      {ALL_ROLES.map((role) => {
                        // Boxes that can't be changed:
                        //   Customer, for everyone (everyone is a customer);
                        //   your OWN Admin box (you can't remove your own admin
                        //   role; the database refuses it too).
                        const locked =
                          role === 'customer' || (isMe && role === 'admin' && savedRoles.includes('admin'));
                        // The explanation shown when hovering a locked box
                        // (the `title` attribute below). undefined = no tooltip.
                        const reason =
                          role === 'customer'
                            ? 'Everyone is a customer'
                            : locked
                              ? "You can't remove your own admin role"
                              : undefined;
                        return (
                          <td key={role} className="px-4 py-3 text-center">
                            {/* "Controlled" checkbox: React decides whether it
                                is ticked (`checked`) from shownRoles, and a
                                click only calls toggleRole, which updates
                                `pending`. Also switched off while this row saves. */}
                            <input
                              type="checkbox"
                              className="size-4 accent-brand disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label={`${ROLE_INFO[role].label} role for ${member.name || member.email}`}
                              title={reason}
                              checked={shownRoles.includes(role)}
                              disabled={locked || isSaving}
                              onChange={(e) => toggleRole(member.id, role, e.target.checked)}
                            />
                          </td>
                        );
                      })}
                      {/* Undo only appears when there's something to undo.
                          Save is greyed out until the ticks differ from the
                          database, and shows "Saving…" while it works. */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {hasChange && !isSaving && (
                            <Button variant="outline" size="sm" onClick={() => handleUndo(member.id)}>
                              Undo
                            </Button>
                          )}
                          <Button size="sm" disabled={!hasChange || isSaving} onClick={() => handleSave(member)}>
                            {isSaving ? 'Saving…' : 'Save'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
}
