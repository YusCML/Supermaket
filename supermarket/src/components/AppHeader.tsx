import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ROLE_INFO } from '../lib/roles';
import { roleIcon } from '../ui/roleIcons';
import type { AppRole } from '../types/app';

interface AppHeaderProps {
  role: AppRole;
}

export default function AppHeader({ role }: AppHeaderProps) {
  const { user, signOut, availableRoles } = useAuth();
  const navigate = useNavigate();
  const Icon = roleIcon(role);

  return (
    <header className="border-b border-gray-200/80 bg-[#FFFFFF] px-6 py-2.5 font-sans antialiased text-[#333333]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-[#333333]/70">
            Signed in as <strong className="font-semibold text-[#333333]">{user?.email}</strong>
          </span>

          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#2E7D32]">
            <Icon className="size-3.5" />
            <span>{ROLE_INFO[role].label}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
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