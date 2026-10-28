import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNotify } from '../contexts/NotifyContext';
import { ALL_ROLES, ROLE_INFO } from '../lib/roles';
import type { AppRole, Customer } from '../types/app';

interface UserRolesProps {
  // Every account. Everyone is a loyalty member, so the member list doubles
  // as the list of users.
  users: Customer[];
  // Who holds which staff role: { userId: ['cashier', 'admin'] }.
  staffRoles: Record<string, AppRole[]>;
  onSaveRoles: (userId: string, roles: AppRole[]) => Promise<void>;
}

type RoleFilter = 'all' | 'cashier' | 'admin' | 'customer-only';

// Same roles in the same order, regardless of how they were ticked.
function sameRoles(a: AppRole[], b: AppRole[]) {
  return ALL_ROLES.every((role) => a.includes(role) === b.includes(role));
}

// Admin page tab for deciding who can do what. Each person can hold any mix
// of Cashier and Admin on top of Customer, which everyone always has (it's
// their loyalty account). Tick the boxes, then Save that row.
export default function UserRoles({ users, staffRoles, onSaveRoles }: UserRolesProps) {
  const { user } = useAuth();
  const { notify, askToConfirm } = useNotify();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  // Ticks changed but not saved yet, by user id. Kept apart from the saved
  // roles so you can see what's really stored until you hit Save.
  const [pending, setPending] = useState<Record<string, AppRole[]>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // What's saved in the database for this person right now.
  const savedRolesOf = (userId: string): AppRole[] => [
    'customer',
    ...(staffRoles[userId] ?? []),
  ];

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

  const toggleRole = (userId: string, role: AppRole, checked: boolean) => {
    setPending((prev) => {
      const current = prev[userId] ?? savedRolesOf(userId);
      // Rebuild from ALL_ROLES so the list stays in the usual order.
      const next = ALL_ROLES.filter((r) => (r === role ? checked : current.includes(r)));
      return { ...prev, [userId]: next };
    });
  };

  const handleSave = async (member: Customer) => {
    const newRoles = pending[member.id];
    if (!newRoles || sameRoles(newRoles, savedRolesOf(member.id))) return;

    const who = member.name || member.email;
    const labels = newRoles.map((r) => ROLE_INFO[r].label).join(', ');
    const ok = await askToConfirm({
      title: 'Change roles?',
      message: `Set ${who}'s roles to: ${labels}.`,
      confirmLabel: 'Save roles',
    });
    if (!ok) return;

    setSavingId(member.id);
    try {
      await onSaveRoles(member.id, newRoles);
      // Saved, so this row no longer has unsaved ticks.
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

  // Throw away unsaved ticks on one row.
  const handleUndo = (userId: string) => {
    setPending((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  };

  return (
    <div className="p-6 space-y-6 min-h-screen bg-[#F5F5F5] text-[#333333] font-sans antialiased selection:bg-[#2E7D32]/15 selection:text-[#2E7D32]">
      <h2 className="text-2xl font-bold tracking-tight text-[#333333]">Users & Roles</h2>
      <p className="text-xs text-[#333333]/70 leading-relaxed max-w-3xl">
        Everyone is a <strong className="text-[#333333]">Customer</strong> (self-serve and loyalty points).
        Tick <strong className="text-[#333333]">Cashier</strong> to let someone ring up sales and view stock,
        and <strong className="text-[#333333]">Admin</strong> for full access, including restocking and
        assigning roles. A person can have both. They get the new options the
        next time they sign in or refresh the page.
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <input
          type="text"
          className="w-full sm:w-72 rounded-xl border border-gray-300 bg-[#FFFFFF] px-3.5 py-2 text-xs text-[#333333] placeholder-[#333333]/40 outline-none transition-all focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20 shadow-xs"
          // No "email"/"name" in the hint, or Chrome shows its own saved-address
          // pop-up over the box. It still searches names, emails and loyalty IDs.
          placeholder="Search members or loyalty ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <select
          className="w-full sm:w-44 rounded-xl border border-gray-300 bg-[#FFFFFF] px-3.5 py-2 text-xs text-[#333333] font-medium outline-none transition-all focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20 shadow-xs cursor-pointer"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
        >
          <option value="all">All users</option>
          <option value="cashier">Cashiers</option>
          <option value="admin">Admins</option>
          <option value="customer-only">Customers only</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-[#FFFFFF] shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#333333]">
            <thead className="bg-[#F5F5F5] border-b border-gray-200 text-[#333333]/70 font-semibold">
              <tr>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Loyalty ID</th>
                {ALL_ROLES.map((role) => (
                  <th key={role} className="px-4 py-3 text-center">
                    {ROLE_INFO[role].label}
                  </th>
                ))}
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleUsers.length === 0 ? (
                <tr>
                  <td colSpan={4 + ALL_ROLES.length} className="px-4 py-8 text-center text-[#333333]/50">
                    No users found.
                  </td>
                </tr>
              ) : (
                visibleUsers.map((member) => {
                  const isMe = member.id === user?.id;
                  const savedRoles = savedRolesOf(member.id);
                  const shownRoles = pending[member.id] ?? savedRoles;
                  const hasChange = !sameRoles(shownRoles, savedRoles);
                  const isSaving = savingId === member.id;

                  return (
                    <tr key={member.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3 font-semibold text-[#333333]">
                        <div className="flex items-center gap-2">
                          <span>{member.name || 'N/A'}</span>
                          {isMe && (
                            <span className="rounded-full bg-[#2E7D32]/10 px-2 py-0.5 text-[10px] font-bold text-[#2E7D32] border border-[#2E7D32]/20">
                              You
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#333333]/70">{member.email}</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-[#333333]/70">
                        {member.loyalty_id || '—'}
                      </td>
                      {ALL_ROLES.map((role) => {
                        // Customer can't be removed: it's everyone's loyalty account.
                        // Your own Admin can't be removed either (ask another
                        // admin), so the store always keeps at least one admin.
                        const locked =
                          role === 'customer' || (isMe && role === 'admin' && savedRoles.includes('admin'));
                        const reason =
                          role === 'customer'
                            ? 'Everyone is a customer'
                            : locked
                              ? "You can't remove your own admin role"
                              : undefined;
                        return (
                          <td key={role} className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded-sm border-gray-300 text-[#2E7D32] accent-[#2E7D32] focus:ring-[#2E7D32]/30 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label={`${ROLE_INFO[role].label} role for ${member.name || member.email}`}
                              title={reason}
                              checked={shownRoles.includes(role)}
                              disabled={locked || isSaving}
                              onChange={(e) => toggleRole(member.id, role, e.target.checked)}
                            />
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            className="rounded-lg bg-[#2E7D32] px-3 py-1.5 text-xs font-semibold text-[#FFFFFF] shadow-xs hover:bg-[#246628] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            disabled={!hasChange || isSaving}
                            onClick={() => handleSave(member)}
                          >
                            {isSaving ? 'Saving…' : 'Save'}
                          </button>
                          {hasChange && !isSaving && (
                            <button
                              type="button"
                              className="rounded-lg border border-gray-300 bg-[#FFFFFF] px-2.5 py-1.5 text-xs font-medium text-[#333333] hover:bg-[#F5F5F5] transition-colors shadow-xs"
                              onClick={() => handleUndo(member.id)}
                            >
                              Undo
                            </button>
                          )}
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
    </div>
  );
}