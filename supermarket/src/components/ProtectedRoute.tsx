// ProtectedRoute.tsx: a gatekeeper that App.tsx wraps around pages, e.g.
//   <ProtectedRoute role="admin"><AdminPage /></ProtectedRoute>
//
// It shows the page inside it only when someone is signed in and, if `role`
// is given, only when they hold that role. Otherwise it redirects:
//   nobody signed in   -> /login (home page with the sign-in pop-up)
//   missing the role   -> /app   (the role picker)
// This only decides what the browser SHOWS. The real protection is in the
// database: row-level security (the database itself checks who may read or
// change each row) and the role checks inside each SQL function.
//
// It reads everything from AuthContext through useAuth().
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { AppRole } from '../types/app';
import LoadingPanel from './LoadingPanel';

// The props (inputs) it takes.
interface ProtectedRouteProps {
  // The page to protect: whatever is written between the tags. ReactNode
  // means "anything React can draw".
  children: ReactNode;
  // Which role's interface this page is. Leave it out for pages any signed-in
  // person can open (like the "Continue as" picker).
  role?: AppRole;
}

// From AuthContext:
//   user           the signed-in person, or null
//   loading        true at start-up while the saved session is being checked
//   roleLoading    true while their roles are being looked up
//   availableRoles every role they hold, e.g. ['customer', 'cashier']
export default function ProtectedRoute({ children, role }: ProtectedRouteProps) {
  const { user, loading, roleLoading, availableRoles } = useAuth();

  // Wait for the session, and for the role as well when this page needs one,
  // so nobody gets sent away while we're still finding out who they are.
  if (loading || (role && roleLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
        <LoadingPanel message="Checking session…" />
      </div>
    );
  }

  // Nobody signed in: go to the sign-in pop-up. <Navigate> redirects as soon
  // as it's drawn; `replace` swaps out this address in the history so Back
  // doesn't return here and bounce again. (After signing in, people go to
  // /app, not back to the page they first asked for.)
  if (!user) return <Navigate to="/login" replace />;

  // Signed in, but their role doesn't include this interface (e.g. a customer
  // typing /admin into the address bar). Send them back to pick one they do
  // have. The database refuses their requests anyway; this just keeps them off
  // a page full of errors.
  if (role && !availableRoles.includes(role)) return <Navigate to="/app" replace />;

  // All checks passed: show the page. <>...</> is a "fragment", a wrapper
  // that adds no extra element to the page.
  return <>{children}</>;
}
