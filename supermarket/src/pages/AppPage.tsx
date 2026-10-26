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
  const { user, signOut, isAdmin, roleLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<Tab>('pos');
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [logs, setLogs] = useState<LoyaltyLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Pulls fresh products, members and the points log from the database.
  // Called on login and again after every sale / new product, so stock levels
  // and point balances on screen always match what's saved.
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

  // Watch the user's id, not the whole user object. Supabase hands us a new
  // user object every time it refreshes the session (about once an hour, and
  // when you switch back to the browser tab). Reloading on each of those would
  // flash the loading screen and wipe out the cashier's basket mid-sale.
  useEffect(() => {
    if (user) loadData();
  }, [user?.id]);

  // If the user loses admin rights (or was never admin) and is on an admin tab,
  // kick them back to POS.
  useEffect(() => {
    if (!roleLoading && !isAdmin && activeTab !== 'pos') {
      setActiveTab('pos');
    }
  }, [isAdmin, roleLoading, activeTab]);

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
                products={products}
                customers={customers}
                onCheckout={handleCheckout}
              />
            )}
            {activeTab === 'inventory' && isAdmin && (
              <Inventory
                products={products}
                onAddProduct={handleAddProduct}
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