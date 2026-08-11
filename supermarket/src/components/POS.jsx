import React, { useState } from 'react';

export default function POS({ products, customers, onCheckout }) {
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [phoneSearch, setPhoneSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('Cash');

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode.includes(search)
  );

  const addToCart = (product) => {
    if (product.stock_quantity <= 0) return alert('Item is out of stock!');
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock_quantity) {
          alert('Cannot exceed available stock!');
          return prev;
        }
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (id) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const findCustomer = () => {
    const cust = customers.find(c => c.phone === phoneSearch || c.loyalty_id === phoneSearch);
    if (cust) {
      setSelectedCustomer(cust);
    } else {
      alert('Customer not found!');
    }
  };

  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const finalTotal = Math.max(0, total - pointsToRedeem);

  const handleCheckoutSubmit = async () => {
    if (cart.length === 0) return alert('Cart is empty!');
    try {
      await onCheckout({
        cart,
        customerId: selectedCustomer?.id,
        pointsToRedeem,
        paymentMethod
      });
      alert('Checkout completed successfully!');
      setCart([]);
      setSelectedCustomer(null);
      setPointsToRedeem(0);
      setPhoneSearch('');
    } catch (err) {
      alert(err?.message || 'Checkout failed');
    }
  };

  return (
    <div className="pos-layout">
      {/* Product Search and Grid */}
      <div className="pos-left">
        <h2>Items Lookup</h2>
        <input 
          type="text" 
          placeholder="Scan barcode or search product..." 
          className="search-bar"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="product-grid">
          {filteredProducts.map(p => (
            <div key={p.id} className="product-card" onClick={() => addToCart(p)}>
              <h4>{p.name}</h4>
              <p>₱{p.price.toFixed(2)}</p>
              <small>Stock: {p.stock_quantity}</small>
            </div>
          ))}
        </div>
      </div>

      {/* Cart and Payment Section */}
      <div className="pos-right">
        <h2>Active Basket</h2>
        
        {/* Customer Lookup */}
        <div className="customer-panel">
          <input 
            placeholder="Phone / Loyalty ID" 
            value={phoneSearch} 
            onChange={e => setPhoneSearch(e.target.value)} 
          />
          <button onClick={findCustomer}>Lookup Member</button>
        </div>

        {selectedCustomer && (
          <div className="member-info">
            👤 <strong>{selectedCustomer.name}</strong> | Points: {selectedCustomer.points_balance}
            {selectedCustomer.points_balance > 0 && (
              <div className="points-redeem">
                <label>Redeem Points (₱1/pt): </label>
                <input 
                  type="number" 
                  max={Math.min(selectedCustomer.points_balance, total)} 
                  min="0"
                  value={pointsToRedeem}
                  onChange={e => setPointsToRedeem(Number(e.target.value))}
                />
              </div>
            )}
          </div>
        )}

        {/* Cart Contents */}
        <div className="cart-list">
          {cart.length === 0 ? <p className="empty-cart">Basket is empty</p> : cart.map(item => (
            <div key={item.id} className="cart-item">
              <div>
                <strong>{item.name}</strong>
                <small> x{item.quantity}</small>
              </div>
              <div>
                <span>₱{(item.price * item.quantity).toFixed(2)} </span>
                <button className="btn-sm btn-danger" onClick={() => removeFromCart(item.id)}>×</button>
              </div>
            </div>
          ))}
        </div>

        {/* Summary & Actions */}
        <div className="summary">
          <div>Subtotal: ₱{total.toFixed(2)}</div>
          <div>Discount: -₱{pointsToRedeem.toFixed(2)}</div>
          <h3>Total: ₱{finalTotal.toFixed(2)}</h3>

          <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
            <option value="Cash">Cash</option>
            <option value="Card">Card</option>
            <option value="Loyalty Points">Loyalty Points</option>
          </select>

          <button className="btn-primary checkout-btn" onClick={handleCheckoutSubmit}>
            Complete Transaction
          </button>
        </div>
      </div>
    </div>
  );
}