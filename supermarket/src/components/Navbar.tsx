import { useAuth } from '../contexts/AuthContext';

export type Tab = 'pos' | 'inventory' | 'loyalty' | 'analytics';

interface NavbarProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

export default function Navbar({ activeTab, setActiveTab }: NavbarProps) {
  const { isAdmin } = useAuth();

  return (
    <nav className="navbar">
      <div className="brand">⚡ SuperMarket</div>
      <div className="nav-links">
        <button
          className={activeTab === 'pos' ? 'active' : ''}
          onClick={() => setActiveTab('pos')}
        >
          🛒 POS Checkout
        </button>

        {isAdmin && (
          <>
            <button
              className={activeTab === 'inventory' ? 'active' : ''}
              onClick={() => setActiveTab('inventory')}
            >
              📦 Inventory Management
            </button>
            <button
              className={activeTab === 'loyalty' ? 'active' : ''}
              onClick={() => setActiveTab('loyalty')}
            >
              ⭐ Loyalty & Rewards
            </button>
            <button
              className={activeTab === 'analytics' ? 'active' : ''}
              onClick={() => setActiveTab('analytics')}
            >
              📊 Analytics
            </button>
          </>
        )}
      </div>
    </nav>
  );
}