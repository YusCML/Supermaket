import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { AppRole } from '../types/app';

interface ProtectedRouteProps {
  children: ReactNode;
  // Which role's interface this page is. Leave it out for pages any signed-in
  // person can open (like the "Continue as" picker).
  role?: AppRole;
}

export default function ProtectedRoute({ children, role }: ProtectedRouteProps) {
  const { user, loading, roleLoading, availableRoles } = useAuth();

  // Wait for the session, and for the role as well when this page needs one,
  // so nobody gets sent away while we're still finding out who they are.
  if (loading || (role && roleLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        Checking session…
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // Signed in, but their role doesn't include this interface (e.g. a customer
  // typing /admin into the address bar). Send them back to pick one they do
  // have. The database refuses their requests anyway; this just keeps them off
  // a page full of errors.
  if (role && !availableRoles.includes(role)) return <Navigate to="/app" replace />;

  return <>{children}</>;
}
