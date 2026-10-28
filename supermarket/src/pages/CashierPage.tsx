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
    <div className="flex min-h-screen flex-col bg-[#F5F5F5] font-sans antialiased text-[#333333] selection:bg-[#2E7D32]/15 selection:text-[#2E7D32]">
      <AppHeader role="cashier" />

      <Navbar tabs={CASHIER_TABS} activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="flex-1 p-6">
        {loading ? (
          <div className="flex items-center justify-center rounded-2xl border border-gray-200/80 bg-[#FFFFFF] p-12 text-center text-xs font-semibold text-[#333333]/60 shadow-xs">
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