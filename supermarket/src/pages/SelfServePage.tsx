import { ShoppingCart } from 'lucide-react';
import POS from '../components/POS';
import Navbar, { type NavTab } from '../components/Navbar';
import AppHeader from '../components/AppHeader';
import { useStoreData } from '../hooks/useStoreData';

const SELF_SERVE_TABS: NavTab<'checkout'>[] = [
  { id: 'checkout', label: 'Self-Checkout', icon: <ShoppingCart /> },
];

export default function SelfServePage() {
  const { customers, batches, loading, handleCheckout, posProducts } = useStoreData('customer');

  return (
    <div className="flex min-h-screen flex-col bg-[#F5F5F5] font-sans antialiased text-[#333333] selection:bg-[#2E7D32]/15 selection:text-[#2E7D32]">
      <AppHeader role="customer" />

      <Navbar tabs={SELF_SERVE_TABS} activeTab="checkout" setActiveTab={() => {}} />

      <main className="flex-1 p-6">
        {loading ? (
          <div className="flex items-center justify-center rounded-2xl border border-gray-200/80 bg-[#FFFFFF] p-12 text-center text-xs font-semibold text-[#333333]/60 shadow-xs">
            Loading store data…
          </div>
        ) : (
          <POS
            mode="self-serve"
            products={posProducts}
            customers={customers}
            batches={batches}
            onCheckout={handleCheckout}
          />
        )}
      </main>
    </div>
  );
}