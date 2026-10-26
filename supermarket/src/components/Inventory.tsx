import { useState, type FormEvent } from 'react';
import type { Product, NewProductInput } from '../types/app';

interface InventoryProps {
  products: Product[];
  onAddProduct: (product: NewProductInput) => Promise<void>;
  onRefresh?: () => void;
}

const emptyForm = {
  sku: '',
  barcode: '',
  name: '',
  category: '',
  price: '',
  cost: '',
  stock_quantity: '',
  reorder_level: '',
};

export default function Inventory({ products, onAddProduct, onRefresh }: InventoryProps) {
  const [form, setForm] = useState(emptyForm);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await onAddProduct({
        sku: form.sku,
        barcode: form.barcode,
        name: form.name,
        category: form.category,
        price: parseFloat(form.price),
        cost: parseFloat(form.cost),
        stock_quantity: parseInt(form.stock_quantity, 10),
        reorder_level: parseInt(form.reorder_level, 10),
      });
      // Only clear the form once the product is actually saved, so a failed
      // save (duplicate SKU, negative price...) doesn't lose what was typed.
      setForm(emptyForm);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not save the product');
    }
  };

  return (
    <div className="tab-content">
      <h2>Catalog & Stock Control</h2>

      <form className="form-card" onSubmit={handleSubmit}>
        <h3>Add New Product</h3>
        <div className="form-grid">
          <input placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required />
          <input placeholder="Barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} required />
          <input placeholder="Product Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required />
          <input placeholder="Price (₱)" type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
          <input placeholder="Cost (₱)" type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} required />
          <input placeholder="Stock Quantity" type="number" value={form.stock_quantity} onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })} required />
          <input placeholder="Reorder Level" type="number" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} required />
        </div>
        <button type="submit" className="btn-primary">Save Product</button>
      </form>

      <table className="data-table">
        <thead>
          <tr>
            <th>SKU / Barcode</th>
            <th>Name</th>
            <th>Category</th>
            <th>Price</th>
            <th>Stock Level</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => {
            const isLow = p.stock_quantity <= p.reorder_level;
            return (
              <tr key={p.id} className={isLow ? 'low-stock-row' : ''}>
                <td>{p.sku} / {p.barcode}</td>
                <td><strong>{p.name}</strong></td>
                <td>{p.category}</td>
                <td>₱{p.price.toFixed(2)}</td>
                <td>{p.stock_quantity}</td>
                <td>
                  {isLow ? (
                    <span className="badge badge-warn">⚠️ Low Stock (≤{p.reorder_level})</span>
                  ) : (
                    <span className="badge badge-ok">OK</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}