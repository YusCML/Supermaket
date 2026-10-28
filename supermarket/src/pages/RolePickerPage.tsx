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
      <div className="flex min-h-screen items-center justify-center bg-[#F5F5F5] font-sans text-xs font-semibold text-[#333333]/60 antialiased">
        Checking your access…
      </div>
    );
  }

  // Only one option (plain customers): nothing to choose, go straight there.
  if (availableRoles.length === 1) {
    return <Navigate to={ROLE_INFO[availableRoles[0]].home} replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F5F5F5] px-4 py-12 font-sans antialiased selection:bg-[#2E7D32]/15 selection:text-[#2E7D32]">
      <div className="w-full max-w-md rounded-2xl border border-gray-200/80 bg-[#FFFFFF] p-8 shadow-xs">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#2E7D32]/10 text-xl text-[#2E7D32]">
            ⚡
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-[#333333]">
            SuperMarket Express
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-[#333333]/70">
            Signed in as <strong className="font-semibold text-[#333333]">{user?.email}</strong>.<br />
            How would you like to continue?
          </p>
        </div>

        {/* Role Options */}
        <div className="mt-6 space-y-3">
          {availableRoles.map((role) => (
            <button
              key={role}
              type="button"
              className="group flex w-full flex-col text-left rounded-xl border border-gray-200 bg-[#FFFFFF] p-4 shadow-2xs hover:border-[#2E7D32]/50 hover:bg-[#2E7D32]/5 transition-all cursor-pointer"
              onClick={() => navigate(ROLE_INFO[role].home)}
            >
              <span className="flex items-center gap-2 text-sm font-bold text-[#333333] group-hover:text-[#2E7D32] transition-colors">
                <span>{ROLE_INFO[role].icon}</span>
                <span>{ROLE_INFO[role].label}</span>
              </span>
              <span className="mt-1 text-xs text-[#333333]/60 leading-normal">
                {ROLE_INFO[role].description}
              </span>
            </button>
          ))}
        </div>

        {/* Sign Out Button */}
        <button
          type="button"
          className="mt-6 w-full rounded-xl border border-gray-300 bg-[#FFFFFF] py-2.5 text-xs font-semibold text-[#333333] shadow-2xs hover:bg-[#F5F5F5] transition-colors"
          onClick={signOut}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}