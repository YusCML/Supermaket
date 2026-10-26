import { useState, useEffect } from 'react';
import POS from '../components/POS';
import Inventory from '../components/Inventory';
import Loyalty from '../components/Loyalty';
import Navbar, { type Tab } from '../components/Navbar';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import type {
  Product,
  Customer,
  LoyaltyLog,
  CheckoutPayload,
  NewProductInput,
  ProductBatch,
  ProductInventorySummary,
  ReceiveStockInput,
} from '../types/app';
import '../App.css';

export default function AppPage() {
  const { user, signOut, isAdmin, roleLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<Tab>('pos');
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<ProductInventorySummary[]>([]);
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [logs, setLogs] = useState<LoyaltyLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Pull fresh products, members, batches, and inventory summaries after sales
  // and stock changes so the POS and Inventory screens stay current.
  const loadData = async () => {
    try {
      setLoading(true);
      const [prodData, custData, logData, inventoryData, batchData] = await Promise.all([
        api.getProducts(),
        api.getCustomers(),
        api.getLoyaltyLogs(),
        api.getInventoryOverview(),
        api.getProductBatches(),
      ]);
      setProducts(prodData);
      setInventory(inventoryData);
      setBatches(batchData);
      setCustomers(custData);
      setLogs(logData);
    } catch (err) {
      console.error('Error loading Supabase data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Watch the user's id rather than the whole session object to avoid
  // reloading during token refreshes.
  useEffect(() => {
    if (user) loadData();
  }, [user?.id]);

  // If the user is no longer an admin, return them to the POS tab.
  useEffect(() => {
    if (!roleLoading && !isAdmin && activeTab !== 'pos') {
      setActiveTab('pos');
    }
  }, [isAdmin, roleLoading, activeTab]);

  // Refresh member records when an admin opens Loyalty & Rewards.
  useEffect(() => {
    if (activeTab !== 'loyalty' || !isAdmin) return;

    let cancelled = false;
    Promise.all([api.getCustomers(), api.getLoyaltyLogs()])
      .then(([custData, logData]) => {
        if (cancelled) return;
        setCustomers(custData);
        setLogs(logData);
      })
      .catch((err) => console.error('Error refreshing loyalty data:', err));

    return () => {
      cancelled = true;
    };
  }, [activeTab, isAdmin]);

  useEffect(() => {
    if (activeTab !== 'inventory' || !isAdmin) return;

    let cancelled = false;
    api.processExpiredBatches()
      .then(() => {
        if (!cancelled) return loadData();
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Could not process expired inventory on page load:', err);
          alert(err instanceof Error ? err.message : 'Could not process expired inventory');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, isAdmin]);

  const handleCheckout = async (payload: CheckoutPayload) => {
    await api.processCheckout(payload);
    await loadData();
  };

  const handleAddProduct = async (product: NewProductInput) => {
    await api.addProduct(product);
    await loadData();
  };

  const handleReceiveStock = async (input: ReceiveStockInput) => {
    await api.receiveStock(input);
    await loadData();
  };

  const handleProcessExpired = async () => {
    await api.processExpiredBatches();
    await loadData();
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <span className="user-info">
          Signed in as <strong>{user?.email}</strong>
          {isAdmin && <span className="admin-badge">Admin</span>}
        </span>
        <button className="signout-btn" onClick={signOut}>
          Sign out
        </button>
      </header>

      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="content">
        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>
            Loading store data…
          </div>
        ) : (
          <>
            {activeTab === 'pos' && (
              <POS
                products={inventory}
                customers={customers}
                onCheckout={handleCheckout}
              />
            )}
            {activeTab === 'inventory' && isAdmin && (
              <Inventory
                products={products}
                inventory={inventory}
                batches={batches}
                onAddProduct={handleAddProduct}
                onReceiveStock={handleReceiveStock}
                onProcessExpired={handleProcessExpired}
                onRefresh={loadData}
              />
            )}
            {activeTab === 'loyalty' && isAdmin && (
              <Loyalty
                customers={customers}
                logs={logs}
                onRefresh={loadData}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}