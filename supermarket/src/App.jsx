import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import POS from './components/POS';
import Inventory from './components/Inventory';
import Loyalty from './components/Loyalty';
import { api } from './services/api';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('pos');
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const refreshData = async () => {
    try {
      const [prodData, custData, logData] = await Promise.all([
        api.getProducts(),
        api.getCustomers(),
        api.getLoyaltyLogs()
      ]);
      setProducts(prodData);
      setCustomers(custData);
      setLogs(logData);
    } catch (err) {
      console.error('Error fetching data from Supabase:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const handleUpdateStock = async (id, delta) => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    try {
      await api.updateStock(id, product.stock_quantity, delta);
      await refreshData();
    } catch (err) {
      alert(`Error updating stock: ${err.message}`);
    }
  };

  const handleAddProduct = async (product) => {
    try {
      await api.addProduct(product);
      await refreshData();
    } catch (err) {
      alert(`Error adding product: ${err.message}`);
    }
  };

  const handleCheckout = async (payload) => {
    try {
      await api.processCheckout(payload);
      await refreshData();
    } catch (err) {
      throw err;
    }
  };

  if (loading) {
    return <div style={{ padding: '2rem', textStyle: 'center' }}>Loading SuperMarket Express...</div>;
  }

  return (
    <div className="app-container">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="main-content">
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
            onUpdateStock={handleUpdateStock} 
            onAddProduct={handleAddProduct} 
          />
        )}
        {activeTab === 'loyalty' && (
          <Loyalty 
            customers={customers} 
            logs={logs} 
          />
        )}
      </main>
    </div>
  );
}