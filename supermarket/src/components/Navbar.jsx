import React from 'react';

export default function Navbar({ activeTab, setActiveTab }) {
  return (
    <nav className="navbar">
      <div className="brand">⚡ SuperMarket </div>
      <div className="nav-links">
        <button 
          className={activeTab === 'pos' ? 'active' : ''} 
          onClick={() => setActiveTab('pos')}
        >
          🛒 POS Checkout
        </button>
        <button 
          className={activeTab === 'inventory' ? 'active' : ''} 
          onClick={() => setActiveTab('inventory')}
        >
          📦 Inventory Management
        </button>
        <button 
          className={activeTab === 'loyalty' ? 'active' : ''} 
          onClick={() => setActiveTab('loyalty')}
        >
          ⭐ Loyalty & Rewards
        </button>
      </div>
    </nav>
  );
}