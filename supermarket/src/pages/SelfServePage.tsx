import { ShoppingCart } from 'lucide-react';
import POS from '../components/POS';
import AppShell, { type NavTab } from '../components/AppShell';
import LoadingPanel from '../components/LoadingPanel';
import { useStoreData } from '../hooks/useStoreData';

const SELF_SERVE_TABS: NavTab<'checkout'>[] = [
  { id: 'checkout', label: 'Self-Checkout', icon: <ShoppingCart /> },
];

export default function SelfServePage() {
  const { customers, batches, loading, handleCheckout, posProducts } = useStoreData('customer');

  return (
    <AppShell role="customer" tabs={SELF_SERVE_TABS} activeTab="checkout" onTabChange={() => {}}>
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
