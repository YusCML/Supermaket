import type { ReactNode } from 'react';

export interface NavTab<T extends string> {
  id: T;
  label: string;
  icon: ReactNode;
}

interface NavbarProps<T extends string> {
  tabs: NavTab<T>[];
  activeTab: T;
  setActiveTab: (tab: NoInfer<T>) => void;
  logoSrc?: string;
}

export default function Navbar<T extends string>({
  tabs,
  activeTab,
  setActiveTab,
  logoSrc = '/sp%20logo.jpg',
}: NavbarProps<T>) {
  const getTabClass = (tabId: T) =>
    `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
      activeTab === tabId
        ? 'bg-[#2E7D32]/10 text-[#2E7D32]'
        : 'text-[#333333]/70 hover:bg-[#F5F5F5] hover:text-[#333333]'
    }`;

  return (
    <nav className="sticky top-0 z-30 border-b border-gray-200/80 bg-[#FFFFFF] shadow-xs">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-2.5">
        <div className="flex items-center gap-2.5 text-base font-bold tracking-tight text-[#333333]">
          <img src={logoSrc} alt="SuperMarket Express Logo" className="h-8 w-auto object-contain" />
          <span>SuperMarket Express</span>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={getTabClass(tab.id)}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="flex items-center [&>svg]:size-4">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}