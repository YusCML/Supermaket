import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ROLE_INFO } from '../lib/roles';
import type { AppRole } from '../types/app';

interface AppHeaderProps {
  // The interface currently in use, shown as a badge next to the email.
  role: AppRole;
}

// The strip at the top of the customer, cashier and admin pages.
export default function AppHeader({ role }: AppHeaderProps) {
  const { user, signOut, availableRoles } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="app-header">
      <span className="user-info">
        Signed in as <strong>{user?.email}</strong>
        <span className="admin-badge">{ROLE_INFO[role].label}</span>
      </span>
      <span className="header-actions">
        {/* Only worth showing if there's another role to switch to. */}
        {availableRoles.length > 1 && (
          <button className="signout-btn" onClick={() => navigate('/app')}>
            Switch role
          </button>
        )}
        <button className="signout-btn" onClick={signOut}>
          Sign out
        </button>
      </span>
    </header>
  );
}
