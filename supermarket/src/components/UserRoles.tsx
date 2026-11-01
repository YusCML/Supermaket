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

interface UserRolesProps {
  users: Customer[];
  staffRoles: Record<string, AppRole[]>;
  onSaveRoles: (userId: string, roles: AppRole[]) => Promise<void>;
}

type RoleFilter = 'all' | 'cashier' | 'admin' | 'customer-only';

function sameRoles(a: AppRole[], b: AppRole[]) {
  return ALL_ROLES.every((role) => a.includes(role) === b.includes(role));
}

export default function UserRoles({ users, staffRoles, onSaveRoles }: UserRolesProps) {
  const { user } = useAuth();
  const { notify, askToConfirm } = useNotify();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [pending, setPending] = useState<Record<string, AppRole[]>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

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

  const handleUndo = (userId: string) => {
    setPending((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  };

  return (
    <div className="space-y-6">
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:w-80">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-subtle"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Search users"
            className="pl-10"
            placeholder="Search name, email or loyalty ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
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

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-ink">
            <thead className="border-b border-gray-200 bg-subtle text-xs font-semibold text-ink-muted">
              <tr>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Loyalty ID</th>
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
              {visibleUsers.length === 0 ? (
                <tr>
                  <td colSpan={3 + ALL_ROLES.length} className="px-4 py-8 text-center text-ink-muted">
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
                      {ALL_ROLES.map((role) => {
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
    </div>
  );
}
