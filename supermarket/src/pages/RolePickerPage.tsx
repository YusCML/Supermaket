import { Navigate, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ROLE_INFO } from '../lib/roles';
import { roleIcon } from '../ui/roleIcons';

export default function RolePickerPage() {
  const { user, roleLoading, availableRoles, signOut } = useAuth();
  const navigate = useNavigate();

  if (roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F5F5] font-sans text-xs font-semibold text-[#333333]/60 antialiased">
        Checking your access…
      </div>
    );
  }

  if (availableRoles.length === 1) {
    return <Navigate to={ROLE_INFO[availableRoles[0]].home} replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F5F5F5] px-4 py-12 font-sans antialiased">
      <div className="w-full max-w-md rounded-2xl border border-gray-200/80 bg-[#FFFFFF] p-8 shadow-xs">
        <div className="flex flex-col items-center text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#F5F5F5]">
            <img src="/sp%20logo.jpg" alt="SuperMarket Express Logo" className="h-8 w-auto object-contain" />
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-[#333333]">SuperMarket Express</h1>
          <p className="mt-2 text-xs leading-relaxed text-[#333333]/70">
            Signed in as <strong className="font-semibold text-[#333333]">{user?.email}</strong>.
            <br />
            How would you like to continue?
          </p>
        </div>

        <div className="mt-6 space-y-3">
          {availableRoles.map((role) => {
            const Icon = roleIcon(role);
            return (
              <button
                key={role}
                type="button"
                className="group flex w-full flex-col text-left rounded-xl border border-gray-200 bg-[#FFFFFF] p-4 shadow-2xs hover:border-[#2E7D32]/50 hover:bg-[#2E7D32]/5 transition-all cursor-pointer"
                onClick={() => navigate(ROLE_INFO[role].home)}
              >
                <span className="flex items-center gap-2 text-sm font-bold text-[#333333] group-hover:text-[#2E7D32] transition-colors">
                  <Icon className="size-4" />
                  <span>{ROLE_INFO[role].label}</span>
                </span>
                <span className="mt-1 text-xs text-[#333333]/60 leading-normal">
                  {ROLE_INFO[role].description}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#333333]/70 hover:text-[#2E7D32] transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Back to homepage
          </Link>
          <button
            type="button"
            className="rounded-lg border border-gray-300 bg-[#FFFFFF] px-3 py-1.5 text-xs font-semibold text-[#333333] shadow-2xs hover:bg-[#F5F5F5] transition-colors cursor-pointer"
            onClick={signOut}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}