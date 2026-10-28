import { useState } from 'react';
import POS from '../components/POS';
import Inventory from '../components/Inventory';
import Navbar, { type NavTab } from '../components/Navbar';
import AppHeader from '../components/AppHeader';
import { useStoreData } from '../hooks/useStoreData';
import '../App.css';

type CashierTab = 'pos' | 'stock';

const CASHIER_TABS: NavTab<CashierTab>[] = [
  { id: 'pos', label: '🛒 POS Checkout' },
  { id: 'stock', label: '📦 Stock Levels' },
];

// The cashier interface (/cashier), also open to admins.
//   * POS Checkout: ring up a customer's order. The member box starts empty;
//     look the customer up by loyalty ID, phone or email so they get the points.
//   * Stock Levels: the inventory table, read only. Restocking is admin-only.
export default function CashierPage() {
  const {
    products,
    inventory,
    batches,
    customers,
    loading,
    loadData,
    handleCheckout,
    posProducts,
  } = useStoreData('cashier');

  const [activeTab, setActiveTab] = useState<CashierTab>('pos');

  return (
    <div className="app-container">
      <AppHeader role="cashier" />

      <Navbar tabs={CASHIER_TABS} activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="content">
        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>
            Loading store data…
          </div>
        ) : (
          <>
            {activeTab === 'pos' && (
              <POS
                mode="staff"
                products={posProducts}
                customers={customers}
                batches={batches}
                onCheckout={handleCheckout}
              />
            )}
            {activeTab === 'stock' && (
              <Inventory
                readOnly
                products={products}
                inventory={inventory}
                batches={batches}
                onRefresh={loadData}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
