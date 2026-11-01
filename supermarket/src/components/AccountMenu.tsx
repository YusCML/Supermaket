import { useState } from 'react';
import { Menu } from '@base-ui/react/menu';
import { ArrowLeftRight, ChevronsUpDown, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ROLE_INFO } from '../lib/roles';
import { roleIcon } from '../ui/roleIcons';
import type { AppRole } from '../types/app';
import RolePickerDialog from './RolePickerDialog';

// Shared look for the rows inside the pop-up menu.
const itemClass =
  'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium outline-none select-none data-highlighted:bg-subtle';

// The account button at the bottom of the sidebar. Clicking it opens a small
// pop-up (above the button) with the full email, the current role,
// "Switch role" and "Sign out".
export default function AccountMenu({ role }: { role: AppRole }) {
  const { user, signOut, availableRoles } = useAuth();
  const [pickerOpen, setPickerOpen] = useState(false);
  const RoleIcon = roleIcon(role);
  const email = user?.email ?? '';
  // First letter of the email, shown in the round "avatar".
  const initial = email.charAt(0).toUpperCase() || '?';

  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          className="flex w-full items-center gap-3 rounded-full p-1.5 pr-3 text-left transition-colors hover:bg-subtle data-popup-open:bg-subtle"
          aria-label="Account menu"
        >
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white"
            aria-hidden="true"
          >
            {initial}
          </span>
          <span className="min-w-0 flex-1">
            {/* Long emails are cut off with "…" here; the full one is in the pop-up. */}
            <span className="block truncate text-sm font-semibold text-ink">{email}</span>
            <span className="flex items-center gap-1 text-xs font-medium text-brand-strong">
              <RoleIcon className="size-3" aria-hidden="true" />
              {ROLE_INFO[role].label}
            </span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
        </Menu.Trigger>

        <Menu.Portal>
          <Menu.Positioner side="top" align="start" sideOffset={8} className="z-[60] outline-none">
            <Menu.Popup className="w-[var(--anchor-width)] min-w-60 origin-[var(--transform-origin)] rounded-md border border-gray-200 bg-white p-1.5 text-ink shadow-lg outline-none transition-[opacity,scale] duration-100 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0">
              {/* Who's signed in. break-all lets a very long email wrap instead of overflowing. */}
              <div className="px-2.5 py-2">
                <p className="text-xs text-ink-muted">Signed in as</p>
                <p className="text-sm font-semibold break-all text-ink">{email}</p>
                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-brand-strong">
                  <RoleIcon className="size-3" aria-hidden="true" />
                  Using the app as {ROLE_INFO[role].label}
                </p>
              </div>

              <Menu.Separator className="my-1 h-px bg-gray-100" />

              {availableRoles.length > 1 && (
                <Menu.Item className={itemClass} onClick={() => setPickerOpen(true)}>
                  <ArrowLeftRight className="size-4 text-ink-muted" aria-hidden="true" />
                  Switch role
                </Menu.Item>
              )}
              <Menu.Item className={`${itemClass} text-danger-strong data-highlighted:bg-danger/10`} onClick={signOut}>
                <LogOut className="size-4" aria-hidden="true" />
                Sign out
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      <RolePickerDialog open={pickerOpen} onOpenChange={setPickerOpen} currentRole={role} />
    </>
  );
}
