import POS from '../components/POS';
import Navbar, { type NavTab } from '../components/Navbar';
import AppHeader from '../components/AppHeader';
import { useStoreData } from '../hooks/useStoreData';
import '../App.css';

const SELF_SERVE_TABS: NavTab<'checkout'>[] = [
  { id: 'checkout', label: '🛒 Self-Checkout' },
];

// The customer interface (/self-serve). Everyone can open it, since every
// account is a loyalty customer. You scan your own items and the sale goes
// on your own account, so you earn (and can spend) your own points. Like the
// till, you can pick which batch of a product you're buying.
export default function SelfServePage() {
  const { customers, batches, loading, handleCheckout, posProducts } = useStoreData('customer');

  return (
    <div className="app-container">
      <AppHeader role="customer" />

      {/* Just the one tab for now, so there's nothing to switch to. */}
      <Navbar tabs={SELF_SERVE_TABS} activeTab="checkout" setActiveTab={() => {}} />

      <main className="content">
        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>
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
