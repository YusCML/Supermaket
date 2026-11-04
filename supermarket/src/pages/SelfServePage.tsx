// SelfServePage.tsx: the customer's page, at /self-serve.
//
// App.tsx wraps it in <ProtectedRoute role="customer">, and every signed-in
// person is a customer, so anyone signed in can open it.
//
// It's the POS checkout screen in "self-serve" mode: the member on the sale
// is always the signed-in customer, so there's no member lookup, and the
// database only lets a customer buy for themselves.
//
// It uses AppShell (the sidebar layout), useStoreData (loads the data),
// POS (the checkout), and LoadingPanel / LoadErrorNotice while loading or
// when something failed to load.
import { ShoppingCart } from 'lucide-react';
import POS from '../components/POS';
import AppShell, { type NavTab } from '../components/AppShell';
import LoadingPanel from '../components/LoadingPanel';
import LoadErrorNotice from '../components/LoadErrorNotice';
import { useStoreData } from '../hooks/useStoreData';

// The sidebar has just one entry. NavTab<'checkout'> means the tab's id can
// only be the string 'checkout'.
const SELF_SERVE_TABS: NavTab<'checkout'>[] = [
  { id: 'checkout', label: 'Self-Checkout', icon: <ShoppingCart /> },
];

// The page itself. It takes no props.
export default function SelfServePage() {
  // useStoreData is a "custom hook" (a reusable function that uses other
  // hooks). With 'customer' it loads the products with their stock, the
  // batches, and the customer's own member row (for a customer the database
  // returns only their own). It also gives back handleCheckout, which saves a
  // sale and then reloads the stock and points. See hooks/useStoreData.ts.
  const { customers, batches, loading, loadError, loadData, handleCheckout, posProducts } = useStoreData('customer');

  // There's only one tab, so it's always active and switching does nothing.
  return (
    <AppShell role="customer" tabs={SELF_SERVE_TABS} activeTab="checkout" onTabChange={() => {}}>
      {/* Shown only if some data failed to load. */}
      {loadError && <LoadErrorNotice message={loadError} onRetry={() => loadData()} />}
      {/* While loading, a spinner; then the checkout. `a ? b : c` picks b
          when a is true, otherwise c. posProducts is the product list with
          stock that leaves out expired batches (worked out in useStoreData). */}
      {loading ? (
        <LoadingPanel message="Loading store data…" />
      ) : (
        <POS
          mode="self-serve"
          products={posProducts}
          customers={customers}
          batches={batches}
          onCheckout={handleCheckout}
        />
      )}
    </AppShell>
  );
}
