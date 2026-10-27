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
