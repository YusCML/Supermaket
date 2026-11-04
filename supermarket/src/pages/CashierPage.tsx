// CashierPage.tsx: the cashier's page, at /cashier.
//
// App.tsx wraps it in <ProtectedRoute role="cashier">, so only people with
// the cashier role get in (others are sent back to /app).
//
// Two screens in the sidebar:
//   POS Checkout  ring up a sale for any member (POS in "staff" mode)
//   Stock Levels  the inventory table, read-only
//
// It uses AppShell (sidebar layout), useStoreData (loads the data), POS,
// Inventory, and LoadingPanel / LoadErrorNotice.
import { useState } from 'react';
import { ShoppingCart, Package } from 'lucide-react';
import POS from '../components/POS';
import Inventory from '../components/Inventory';
import AppShell, { type NavTab } from '../components/AppShell';
import LoadingPanel from '../components/LoadingPanel';
import LoadErrorNotice from '../components/LoadErrorNotice';
import { useStoreData } from '../hooks/useStoreData';

// The ids of the two screens. A "union type": only these two strings are allowed.
type CashierTab = 'pos' | 'stock';

// What the sidebar shows: one entry per screen, with its label and icon.
const CASHIER_TABS: NavTab<CashierTab>[] = [
  { id: 'pos', label: 'POS Checkout', icon: <ShoppingCart /> },
  { id: 'stock', label: 'Stock Levels', icon: <Package /> },
];

// The page itself. It takes no props.
export default function CashierPage() {
  // useStoreData is a "custom hook" (a reusable function that uses other
  // hooks) that loads the store data. With 'cashier' it also loads every
  // member, for the member lookup at checkout. See hooks/useStoreData.ts.
  const {
    products,
    inventory,
    batches,
    customers,
    loading,
    loadError,
    loadData,
    handleCheckout,
    posProducts,
  } = useStoreData('cashier');

  // Which screen is showing. useState remembers it between redraws; it starts
  // on the POS. AppShell calls setActiveTab when a sidebar entry is clicked.
  // It isn't part of the URL, so reloading the page goes back to the POS.
  const [activeTab, setActiveTab] = useState<CashierTab>('pos');

  return (
    <AppShell role="cashier" tabs={CASHIER_TABS} activeTab={activeTab} onTabChange={setActiveTab}>
      {/* Shown only if some data failed to load. */}
      {loadError && <LoadErrorNotice message={loadError} onRetry={() => loadData()} />}
      {/* A spinner while loading, then whichever screen is active.
          `activeTab === 'pos' && (...)` shows that screen only when it's
          the active one. */}
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
          {/* readOnly: the stock table without the admin-only buttons and
              forms (add, edit, receive, write off, process expired). The
              database would refuse those changes from a cashier anyway. */}
          {activeTab === 'stock' && (
            <Inventory
              readOnly
              products={products}
              inventory={inventory}
              batches={batches}
              onRefresh={() => loadData(false)}
            />
          )}
        </>
      )}
    </AppShell>
  );
}
