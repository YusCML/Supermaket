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
} from '../types/app';
import '../App.css';

export default function AppPage() {
  const { user, signOut } = useAuth();

  const [activeTab, setActiveTab] = useState<Tab>('pos');
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [logs, setLogs] = useState<LoyaltyLog[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const [prodData, custData, logData] = await Promise.all([
        api.getProducts(),
        api.getCustomers(),
        api.getLoyaltyLogs(),
      ]);
      setProducts(prodData);
      setCustomers(custData);
      setLogs(logData);
    } catch (err) {
      console.error('Error loading Supabase data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const handleCheckout = async (payload: CheckoutPayload) => {
    await api.processCheckout(payload);
    await loadData();
  };

  const handleAddProduct = async (product: NewProductInput) => {
    await api.addProduct(product);
    await loadData();
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <span className="user-info">
          Signed in as <strong>{user?.email}</strong>
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
                products={products}
                customers={customers}
                onCheckout={handleCheckout}
              />
            )}
            {activeTab === 'inventory' && (
              <Inventory
                products={products}
                onAddProduct={handleAddProduct}
                onRefresh={loadData}
              />
            )}
            {activeTab === 'loyalty' && (
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