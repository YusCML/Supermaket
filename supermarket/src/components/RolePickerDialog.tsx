import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ROLE_INFO } from '../lib/roles';
import { roleIcon } from '../ui/roleIcons';
import { cn } from '@/lib/utils';
import type { AppRole } from '../types/app';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';

interface RolePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The role being used right now (marked "Current"). Not set right after login.
  currentRole?: AppRole;
  // false right after login: there's nothing behind the window to go back to,
  // so it can't be closed, only answered (or signed out of).
  dismissible?: boolean;
  // Extra buttons at the bottom, e.g. "Sign out" on the after-login screen.
  footer?: ReactNode;
}

// "How would you like to continue?" pop-up. One button per role the person has.
// Shown after logging in (by RolePickerPage) and from "Switch role" in the
// account menu.
export default function RolePickerDialog({
  open,
  onOpenChange,
  currentRole,
  dismissible = true,
  footer,
}: RolePickerDialogProps) {
  const { user, availableRoles } = useAuth();
  const navigate = useNavigate();

  const pick = (role: AppRole) => {
    onOpenChange(false);
    if (role !== currentRole) navigate(ROLE_INFO[role].home);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Ignore Escape / backdrop clicks when the window must stay open.
        if (dismissible || next) onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton={dismissible}>
        <DialogHeader>
          <DialogTitle>{dismissible ? 'Switch role' : 'Welcome back'}</DialogTitle>
          <DialogDescription>
            Signed in as <strong className="font-semibold text-ink">{user?.email}</strong>. How would you like to
            continue?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {availableRoles.map((role) => {
            const Icon = roleIcon(role);
            const isCurrent = role === currentRole;
            return (
              <button
                key={role}
                type="button"
                onClick={() => pick(role)}
                className={cn(
                  'group flex w-full items-center gap-3 rounded-md border p-3.5 text-left transition-colors',
                  isCurrent
                    ? 'border-brand/40 bg-brand/5'
                    : 'border-gray-200 bg-white hover:border-brand/50 hover:bg-brand/5'
                )}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand-strong">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-bold text-ink group-hover:text-brand-strong">
                    {ROLE_INFO[role].label}
                    {isCurrent && <span className="text-xs font-semibold text-brand-strong">· Current</span>}
                  </span>
                  <span className="block text-sm text-ink-muted">{ROLE_INFO[role].description}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-ink-subtle group-hover:text-brand-strong" aria-hidden="true" />
              </button>
            );
          })}
        </div>

        {footer && <DialogFooter className="sm:justify-between">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
