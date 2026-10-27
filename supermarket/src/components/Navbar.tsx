import { useAuth } from '../contexts/AuthContext';

export type Tab = 'pos' | 'inventory' | 'loyalty' | 'analytics';

interface NavbarProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

export default function Navbar({ activeTab, setActiveTab }: NavbarProps) {
  const { isAdmin } = useAuth();

  const getTabClass = (tab: Tab) =>
    `flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
      activeTab === tab
        ? 'bg-[#2E7D32] text-[#FFFFFF] shadow-sm'
        : 'text-[#333333]/70 hover:bg-[#F5F5F5] hover:text-[#333333]'
    }`;

  return (
    <nav className="sticky top-0 z-30 border-b border-gray-200/80 bg-[#FFFFFF] shadow-xs">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        {/* Brand */}
        <div className="flex items-center gap-2.5 text-base font-bold tracking-tight text-[#333333]">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#2E7D32]/10 text-[#2E7D32]">
            ⚡
          </span>
          <span>SuperMarket Express</span>
        </div>

        {/* Tab Links */}
        <div className="flex items-center gap-1.5 rounded-2xl bg-[#FFFFFF] p-1">
          <button
            type="button"
            className={getTabClass('pos')}
            onClick={() => setActiveTab('pos')}
          >
            <span>🛒</span> POS Checkout
          </button>

          {isAdmin && (
            <>
              <button
                type="button"
                className={getTabClass('inventory')}
                onClick={() => setActiveTab('inventory')}
              >
                <span>📦</span> Inventory
              </button>
              <button
                type="button"
                className={getTabClass('loyalty')}
                onClick={() => setActiveTab('loyalty')}
              >
                <span>⭐</span> Loyalty
              </button>
              <button
                type="button"
                className={getTabClass('analytics')}
                onClick={() => setActiveTab('analytics')}
              >
                <span>📊</span> Analytics
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}