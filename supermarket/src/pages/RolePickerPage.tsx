import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ROLE_INFO } from '../lib/roles';

// "Continue as…" (/app). Shown after every login, and from the "Switch role"
// button. Lists only the roles this person actually has: a customer sees
// just Customer, a cashier sees Customer and Cashier, an admin sees all three.
export default function RolePickerPage() {
  const { user, roleLoading, availableRoles, signOut } = useAuth();
  const navigate = useNavigate();

  // Don't show any choices until we know the role, or an admin would briefly
  // see only "Customer" (or be sent straight to self-serve).
  if (roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        Checking your access…
      </div>
    );
  }

  // Only one option (plain customers): nothing to choose, go straight there.
  if (availableRoles.length === 1) {
    return <Navigate to={ROLE_INFO[availableRoles[0]].home} replace />;
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>⚡ SuperMarket Express</h1>
        <p className="login-subtitle">
          Signed in as <strong>{user?.email}</strong>.<br />
          How would you like to continue?
        </p>

        <div className="role-options">
          {availableRoles.map((role) => (
            <button
              key={role}
              type="button"
              className="role-option"
              onClick={() => navigate(ROLE_INFO[role].home)}
            >
              <span className="role-option-title">
                {ROLE_INFO[role].icon} {ROLE_INFO[role].label}
              </span>
              <span className="role-option-text">{ROLE_INFO[role].description}</span>
            </button>
          ))}
        </div>

        <button type="button" className="role-signout" onClick={signOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}
