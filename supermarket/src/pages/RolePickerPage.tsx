import { Navigate, Link } from 'react-router-dom';
import { ArrowLeft, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
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

  if (roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
        <LoadingPanel message="Checking your access…" />
      </div>
    );
  }

  if (availableRoles.length === 1) {
    return <Navigate to={ROLE_INFO[availableRoles[0]].home} replace />;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas p-6">
      {/* Background behind the pop-up */}
      <BrandLogo size="lg" className="opacity-50" />

      <RolePickerDialog
        open
        onOpenChange={() => {}}
        dismissible={false}
        footer={
          <>
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-1 text-sm font-semibold text-ink-muted transition-colors hover:text-brand-strong"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to homepage
            </Link>
            <Button variant="ghost" size="sm" className="hover:bg-danger/10 hover:text-danger-strong" onClick={signOut}>
              <LogOut aria-hidden="true" />
              Sign out
            </Button>
          </>
        }
      />
    </div>
  );
}
