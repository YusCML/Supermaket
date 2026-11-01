import { useState } from 'react';
import { ShoppingCart, Package } from 'lucide-react';
import POS from '../components/POS';
import Inventory from '../components/Inventory';
import AppShell, { type NavTab } from '../components/AppShell';
import LoadingPanel from '../components/LoadingPanel';
import { useStoreData } from '../hooks/useStoreData';
import '../App.css';

type CashierTab = 'pos' | 'stock';

const CASHIER_TABS: NavTab<CashierTab>[] = [
  { id: 'pos', label: 'POS Checkout', icon: <ShoppingCart /> },
  { id: 'stock', label: 'Stock Levels', icon: <Package /> },
];

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
    <AppShell role="cashier" tabs={CASHIER_TABS} activeTab={activeTab} onTabChange={setActiveTab}>
      {loading ? (
        <LoadingPanel message="Loading store data…" />
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
    </AppShell>
  );
}
