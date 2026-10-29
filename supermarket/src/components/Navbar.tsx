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
  // Optional custom logo image path
  logoSrc?: string;
}

export default function Navbar<T extends string>({
  tabs,
  activeTab,
  setActiveTab,
  logoSrc = '/sp%20logo.jpg',
}: NavbarProps<T>) {
  const getTabClass = (tabId: T) =>
    `flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all cursor-pointer ${
      activeTab === tabId
        ? 'bg-[#2E7D32] text-[#FFFFFF] shadow-xs'
        : 'text-[#333333]/70 hover:bg-[#F5F5F5] hover:text-[#333333]'
    }`;

  return (
    <nav className="sticky top-0 z-30 border-b border-gray-200/80 bg-[#FFFFFF] shadow-xs">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        {/* Brand Container with Logo on the Left */}
        <div className="flex items-center gap-2.5 text-base font-bold tracking-tight text-[#333333]">
          <img 
              src="/sp%20logo.jpg" 
              alt="SuperMarket Express Logo" 
              className="h-8 w-auto object-contain" 
            />
          <span>SuperMarket Express</span>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 rounded-2xl bg-[#FFFFFF] p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={getTabClass(tab.id)}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}