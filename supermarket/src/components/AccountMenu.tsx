// AccountMenu.tsx: the account button (round initial + email) and the small
// pop-up menu it opens. Shown in two places:
//   - the bottom of the sidebar (AppShell), on every signed-in screen. There
//     it also shows which role is in use and offers "Switch role".
//   - the landing page's top bar (placement="topbar"), when someone is signed
//     in, so they can see which account they're on and sign out from there.
//
// Uses Base UI's Menu, which handles the hard parts of a dropdown: arrow-key
// movement, Escape to close, and putting keyboard focus back on the button.
// "Switch role" opens RolePickerDialog; "Sign out" calls signOut from
// AuthContext.
import { useState } from 'react';
import { Menu } from '@base-ui/react/menu';
import { ArrowLeftRight, ChevronDown, ChevronsUpDown, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNotify } from '../contexts/NotifyContext';
import { ROLE_INFO } from '../lib/roles';
import { roleIcon } from '../ui/roleIcons';
import { cn } from '@/lib/utils';
import type { AppRole } from '../types/app';
import RolePickerDialog from './RolePickerDialog';

// Shared look for the rows inside the pop-up menu.
// Base UI puts a data-highlighted attribute on the row under the mouse or
// the keyboard, and data-highlighted:bg-subtle gives that row a grey fill.
const itemClass =
  'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium outline-none select-none data-highlighted:bg-subtle';

// The props (inputs from the parent).
interface AccountMenuProps {
  // The role whose screens are open right now (e.g. 'cashier'). Left out on
  // the landing page, where no role is in use yet; then the role line and
  // "Switch role" are hidden (the "Shop now" / "Open POS" button leads to the picker).
  role?: AppRole;
  // Where the button sits, which changes its shape and where the menu opens:
  //   'sidebar' (default) full-width button, menu opens ABOVE it
  //   'topbar'            compact pill (email hidden on phones), menu opens
  //                       BELOW it, lined up with its right edge
  placement?: 'sidebar' | 'topbar';
}

// The account button and its pop-up: the full email, the current role (if
// any), "Switch role" (if they have more than one) and "Sign out".
export default function AccountMenu({ role, placement = 'sidebar' }: AccountMenuProps) {
  const { user, signOut, availableRoles } = useAuth();
  // For showing an error if signing out fails.
  const { notify } = useNotify();
  // Whether the "Switch role" pop-up is open. useState remembers a value
  // between redraws. It's separate state because the menu closes as soon as
  // an item is clicked, but the pop-up must stay.
  const [pickerOpen, setPickerOpen] = useState(false);
  // roleIcon() returns an icon COMPONENT (not a drawn element), so it's kept in
  // a capitalised variable and used as <RoleIcon />. JSX treats lowercase
  // names like <roleIcon> as plain HTML tags. null when there's no role.
  const RoleIcon = role ? roleIcon(role) : null;
  const email = user?.email ?? '';
  // First letter of the email, shown in the round "avatar" ('?' if there's no email).
  const initial = email.charAt(0).toUpperCase() || '?';
  const isTopbar = placement === 'topbar';

  return (
    <>
      {/* Menu.Root holds the open/closed state. Menu.Trigger is the button
          that opens it; data-popup-open:bg-subtle keeps the button grey
          while the menu is open. */}
      <Menu.Root>
        <Menu.Trigger
          className={cn(
            'flex items-center rounded-full text-left transition-colors hover:bg-subtle data-popup-open:bg-subtle',
            isTopbar ? 'gap-2 p-1 sm:pr-3' : 'w-full gap-3 p-1.5 pr-3'
          )}
          aria-label="Account menu"
        >
          <span
            className={cn(
              'flex shrink-0 items-center justify-center rounded-full bg-brand font-bold text-white',
              isTopbar ? 'size-8 text-xs' : 'size-9 text-sm'
            )}
            aria-hidden="true"
          >
            {initial}
          </span>
          {isTopbar ? (
            // Top bar: just the email (cut off with "…" if long), hidden on
            // phones (hidden sm:block) where there's no room; the initial
            // alone says "you're signed in" there.
            <>
              <span className="hidden max-w-48 truncate text-sm font-semibold text-ink sm:block">{email}</span>
              <ChevronDown className="hidden size-4 shrink-0 text-ink-subtle sm:block" aria-hidden="true" />
            </>
          ) : (
            <>
              {/* min-w-0 lets this part shrink below its text width, which is
                  what allows `truncate` to cut the email off with "…". */}
              <span className="min-w-0 flex-1">
                {/* Long emails are cut off with "…" here; the full one is in the pop-up. */}
                <span className="block truncate text-sm font-semibold text-ink">{email}</span>
                {role && RoleIcon && (
                  <span className="flex items-center gap-1 text-xs font-medium text-brand-strong">
                    <RoleIcon className="size-3" aria-hidden="true" />
                    {ROLE_INFO[role].label}
                  </span>
                )}
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
            </>
          )}
        </Menu.Trigger>

        {/* Menu.Portal draws the pop-up at the end of the page's <body>, so
            the sidebar can't clip it (a "portal").
            Menu.Positioner places it: in the sidebar side="top" = above the
            button and align="start" = lined up with its left edge; in the top
            bar side="bottom" (below) and align="end" (right edges lined up).
            sideOffset={8} = an 8px gap. z-[60] keeps it above the phone menu
            (z-50) and the landing page's sticky top bar.
            In the Popup's classes, --anchor-width and --transform-origin are
            CSS variables Base UI sets: in the sidebar the menu is as wide as
            the button, and it grows out from the button's side as it opens. */}
        <Menu.Portal>
          <Menu.Positioner
            side={isTopbar ? 'bottom' : 'top'}
            align={isTopbar ? 'end' : 'start'}
            sideOffset={8}
            className="z-[60] outline-none"
          >
            <Menu.Popup
              className={cn(
                'min-w-60 origin-[var(--transform-origin)] rounded-md border border-gray-200 bg-white p-1.5 text-ink shadow-lg outline-none transition-[opacity,scale] duration-100 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0',
                isTopbar ? 'w-64' : 'w-[var(--anchor-width)]'
              )}
            >
              {/* Who's signed in. break-all lets a very long email wrap instead of overflowing. */}
              <div className="px-2.5 py-2">
                <p className="text-xs text-ink-muted">Signed in as</p>
                <p className="text-sm font-semibold break-all text-ink">{email}</p>
                {role && RoleIcon && (
                  <p className="mt-1 flex items-center gap-1 text-xs font-medium text-brand-strong">
                    <RoleIcon className="size-3" aria-hidden="true" />
                    Using the app as {ROLE_INFO[role].label}
                  </p>
                )}
              </div>

              <Menu.Separator className="my-1 h-px bg-gray-100" />

              {/* "Switch role" only makes sense inside the app (a role is in
                  use) and for people with more than one role. */}
              {role && availableRoles.length > 1 && (
                <Menu.Item className={itemClass} onClick={() => setPickerOpen(true)}>
                  <ArrowLeftRight className="size-4 text-ink-muted" aria-hidden="true" />
                  Switch role
                </Menu.Item>
              )}
              {/* Sign out (in red). Inside the app, ProtectedRoute then sends
                  the person to /login; on the landing page they just stay
                  there, signed out (the top bar shows "Sign in" again). */}
              <Menu.Item
                className={`${itemClass} text-danger-strong data-highlighted:bg-danger/10`}
                onClick={() =>
                  signOut().catch((err) =>
                    notify(err instanceof Error ? err.message : 'Could not sign out. Please try again.', 'error')
                  )
                }
              >
                <LogOut className="size-4" aria-hidden="true" />
                Sign out
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      {/* The "Switch role" pop-up (only inside the app). It sits outside
          Menu.Root so it stays open after the menu closes. currentRole marks
          the role in use. */}
      {role && <RolePickerDialog open={pickerOpen} onOpenChange={setPickerOpen} currentRole={role} />}
    </>
  );
}
