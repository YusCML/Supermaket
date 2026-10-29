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
    <header className="border-b border-gray-200/80 bg-[#FFFFFF] px-6 py-2.5 font-sans antialiased text-[#333333]">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        {/* User Info & Current Role Badge */}
        <div className="flex items-center gap-3 text-xs">
          <span className="text-[#333333]/70">
            Signed in as <strong className="font-semibold text-[#333333]">{user?.email}</strong>
          </span>

          <span className="inline-flex items-center gap-1 rounded-full bg-[#2E7D32]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#2E7D32] border border-[#2E7D32]/20">
            <span>{ROLE_INFO[role].icon}</span>
            <span>{ROLE_INFO[role].label}</span>
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Only worth showing if there's another role to switch to. */}
          {availableRoles.length > 1 && (
            <button
              type="button"
              className="rounded-lg border border-gray-300 bg-[#FFFFFF] px-3 py-1.5 text-xs font-semibold text-[#333333] shadow-2xs hover:bg-[#F5F5F5] transition-colors cursor-pointer"
              onClick={() => navigate('/app')}
            >
              Switch role
            </button>
          )}

          <button
            type="button"
            className="rounded-lg border border-gray-300 bg-[#FFFFFF] px-3 py-1.5 text-xs font-semibold text-[#333333] shadow-2xs hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-colors cursor-pointer"
            onClick={signOut}
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}