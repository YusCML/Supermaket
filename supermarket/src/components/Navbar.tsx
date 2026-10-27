export interface NavTab<T extends string> {
  id: T;
  label: string;
}

interface NavbarProps<T extends string> {
  tabs: NavTab<T>[];
  activeTab: T;
  // NoInfer: work out T from the tabs, not from this setter. A useState setter
  // also accepts a function, which would otherwise confuse TypeScript into
  // treating T as any string.
  setActiveTab: (tab: NoInfer<T>) => void;
}

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
// The dark bar with the tab buttons. Each page (customer, cashier, admin)
// passes in only the tabs that role gets, so the navbar itself doesn't need
// to know anything about roles.
export default function Navbar<T extends string>({ tabs, activeTab, setActiveTab }: NavbarProps<T>) {
  return (
    <nav className="navbar">
      <div className="brand">⚡ SuperMarket</div>
      <div className="nav-links">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
