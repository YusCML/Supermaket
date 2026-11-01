// RolePickerPage.tsx: the page at /app.
//
// App.tsx wraps it in <ProtectedRoute> WITHOUT a role, so any signed-in
// person can open it (signed-out visitors are sent to /login first).
// It reads the person's roles from AuthContext through useAuth() (the
// sign-in data shared with the whole app, set up in main.tsx), looks up each
// role's home page in ROLE_INFO (lib/roles.ts), and shows RolePickerDialog
// when there's a choice to make:
//   customer only -> no question, straight into the shop (/self-serve)
//   cashier       -> Customer or Cashier
//   admin         -> Customer, Cashier or Admin (getMyRoles gives admins the
//                    cashier role too)
import { Navigate, Link } from 'react-router-dom';
import { ArrowLeft, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNotify } from '../contexts/NotifyContext';
import { ROLE_INFO } from '../lib/roles';
import RolePickerDialog from '../components/RolePickerDialog';
import LoadingPanel from '../components/LoadingPanel';
import BrandLogo from '../components/BrandLogo';
import { Button } from '../components/ui/button';

// Where everyone lands right after logging in (/app).
// People with one role go straight to it. People with several get the
// "How would you like to continue?" pop-up over a plain branded background.
export default function RolePickerPage() {
  const { roleLoading, availableRoles, signOut } = useAuth();
  // For showing an error if signing out fails.
  const { notify } = useNotify();

  // Still looking up the roles. ProtectedRoute doesn't wait for roles on this
  // page (it has no `role`), so we wait here. Until the roles arrive the list
  // is empty, and we'd otherwise show a picker with no buttons in it.
  if (roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
        <LoadingPanel message="Checking your access…" />
      </div>
    );
  }

  // Only one role (that's always 'customer', since everyone has it): nothing
  // to ask, so go straight to that role's page (ROLE_INFO[...].home, e.g.
  // '/self-serve'). <Navigate> redirects as soon as it's drawn, and `replace`
  // keeps /app out of the history so Back doesn't bounce through it again.
  if (availableRoles.length === 1) {
    return <Navigate to={ROLE_INFO[availableRoles[0]].home} replace />;
  }

  // Several roles: show the picker, always open (writing just `open` means
  // open={true}). It can't be closed (dismissible={false}), only answered,
  // so onOpenChange has nothing to do. Picking a role navigates to that
  // role's page (see RolePickerDialog).
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas p-6">
      {/* Background behind the pop-up */}
      <BrandLogo size="lg" className="opacity-50" />

      <RolePickerDialog
        open
        onOpenChange={() => {}}
        dismissible={false}
        footer={
          // <>...</> is a "fragment": it groups the two items without adding
          // an extra element around them. Signing out makes ProtectedRoute
          // send the person to /login (the home page with the sign-in pop-up).
          <>
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-1 text-sm font-semibold text-ink-muted transition-colors hover:text-brand-strong"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to homepage
            </Link>
            <Button variant="ghost" size="sm" className="hover:bg-danger/10 hover:text-danger-strong" onClick={() =>
                signOut().catch((err) =>
                  notify(err instanceof Error ? err.message : 'Could not sign out. Please try again.', 'error')
                )
              }
            >
              <LogOut aria-hidden="true" />
              Sign out
            </Button>
          </>
        }
      />
    </div>
  );
}
