import React, { useState, useEffect } from 'react';
import POS from './components/POS';
import Inventory from './components/Inventory';
import Loyalty from './components/Loyalty';
import Navbar from './components/Navbar';
import { api } from './components/services/api';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('pos');
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const [prodData, custData] = await Promise.all([
        api.getProducts(),
        api.getCustomers()
      ]);
      setProducts(prodData || []);
      setCustomers(custData || []);
    } catch (err) {
      console.error('Error loading Supabase data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCheckout = async (checkoutData) => {
    await api.processCheckout(checkoutData);
    await loadData();
  };

  const handleAddProduct = async (newProduct) => {
    await api.addProduct(newProduct);
    await loadData();
  };

  return (
    <div className="app-container">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="content">
        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>Loading store data...</div>
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
              customers={customers || []} 
              onRefresh={loadData} 
            />
          )}
          </>
        )}
      </main>
    </div>
  );
}