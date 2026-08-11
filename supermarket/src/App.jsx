'use client';

import React, { useState } from 'react';
import Navbar from './components/Navbar';
import POS from './components/POS';
import Inventory from './components/Inventory';
import Loyalty from './components/Loyalty';
import { api } from './components/services/mockApi';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('pos');
  const [products, setProducts] = useState(api.getProducts());
  const [customers, setCustomers] = useState(api.getCustomers());
  const [logs, setLogs] = useState(api.getLoyaltyLogs());

  const refreshData = () => {
    setProducts(api.getProducts());
    setCustomers(api.getCustomers());
    setLogs(api.getLoyaltyLogs());
  };

  const handleUpdateStock = (id, delta) => {
    api.updateStock(id, delta);
    refreshData();
  };

  const handleAddProduct = (product) => {
    api.addProduct(product);
    refreshData();
  };

  const handleCheckout = (payload) => {
    api.processCheckout(payload);
    refreshData();
  };

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