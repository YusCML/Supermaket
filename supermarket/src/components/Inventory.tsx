import { useMemo, useState, type FormEvent } from 'react';
import type { NewProductInput, Product, ProductBatch, ProductInventorySummary, ReceiveStockInput } from '../types/app';
import { useNotify } from '../contexts/NotifyContext';

interface InventoryProps {
  products: Product[];
  inventory: ProductInventorySummary[];
  batches: ProductBatch[];
  // Cashiers get this screen read-only: they can check stock levels, expiry
  // dates and batches, but only admins add products or restock. The database
  // enforces that too; hiding the forms just keeps cashiers from hitting errors.
  readOnly?: boolean;
  // Admin actions. Not needed (and not passed) when readOnly is on.
  onAddProduct?: (product: NewProductInput) => Promise<void>;
  onReceiveStock?: (input: ReceiveStockInput) => Promise<void>;
  onProcessExpired?: () => Promise<void>;
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

const emptyReceive = {
  product_id: '',
  quantity: '',
  expiry_date: '',
  batch_code: '',
};

function phtToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day));
}

function formatExpiry(expiryDate: string | null) {
  if (!expiryDate) return 'No expiry date';
  const [year, month, day] = expiryDate.split('-').map(Number);
  const daysUntilExpiry = Math.floor(
    (Date.UTC(year, month - 1, day) - phtToday()) / 86_400_000
  );
  if (daysUntilExpiry === 0) return 'Expired today';
  if (daysUntilExpiry === 1) return 'Expires tomorrow';
  if (daysUntilExpiry > 1 && daysUntilExpiry <= 7) return `Expires in ${daysUntilExpiry} days`;
  if (daysUntilExpiry < 0) return `Expired ${Math.abs(daysUntilExpiry)} days ago`;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString();
}

export default function Inventory({ products, inventory, batches, readOnly = false, onAddProduct, onReceiveStock, onProcessExpired, onRefresh }: InventoryProps) {
  const [form, setForm] = useState(emptyForm);
  const [receiveForm, setReceiveForm] = useState(emptyReceive);
  const [processingExpired, setProcessingExpired] = useState(false);
  const { notify } = useNotify();

  const inventoryMap = useMemo(
    () => Object.fromEntries(inventory.map((item) => [item.id, item])),
    [inventory]
  );

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
      setForm(emptyForm);
      notify(`${form.name} was added to the catalog.`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save the product', 'error');
    }
  };

  const handleReceive = async (e: FormEvent) => {
    e.preventDefault();
    if (!receiveForm.product_id || !receiveForm.quantity || !receiveForm.expiry_date) {
      notify('Select a product, quantity, and expiry date before receiving stock.', 'error');
      return;
    }

    try {
      await onReceiveStock({
        product_id: Number(receiveForm.product_id),
        quantity: Number(receiveForm.quantity),
        expiry_date: receiveForm.expiry_date,
        batch_code: receiveForm.batch_code || undefined,
      });
      setReceiveForm(emptyReceive);
      notify('Stock received.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not receive stock', 'error');
    }
  };

  const handleProcessExpired = async () => {
    if (processingExpired) return;
    setProcessingExpired(true);
    try {
      await onProcessExpired();
      notify('Expired stock has been processed.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not process expired stock', 'error');
    } finally {
      setProcessingExpired(false);
    }
  };

  return (
    <div className="tab-content">
      <h2>Catalog & Stock Control</h2>

      {readOnly && (
        <p className="read-only-note">
          View only. Adding products and restocking are done by an admin.
        </p>
      )}

      {!readOnly && (
        <>
          {/* autoComplete="off" on both forms: no browser pop-up of values
              typed into these boxes before. */}
          <form className="form-card" onSubmit={handleSubmit} autoComplete="off">
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

          <form className="form-card" onSubmit={handleReceive} autoComplete="off">
            <h3>Receive Stock by Batch</h3>
            <div className="form-grid">
              <select value={receiveForm.product_id} onChange={(e) => setReceiveForm({ ...receiveForm, product_id: e.target.value })} required>
                <option value="">Select product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.name}</option>
                ))}
              </select>
              <input type="number" min="1" placeholder="Batch quantity" value={receiveForm.quantity} onChange={(e) => setReceiveForm({ ...receiveForm, quantity: e.target.value })} required />
              <input type="date" value={receiveForm.expiry_date} onChange={(e) => setReceiveForm({ ...receiveForm, expiry_date: e.target.value })} required />
              <input placeholder="Optional batch code" value={receiveForm.batch_code} onChange={(e) => setReceiveForm({ ...receiveForm, batch_code: e.target.value })} />
            </div>
            <button type="submit" className="btn-primary">Receive Stock</button>
          </form>
        </>
      )}

      <div className="inventory-toolbar">
        {!readOnly && (
          <button className="btn-primary" onClick={handleProcessExpired} disabled={processingExpired}>
            {processingExpired ? 'Processing…' : 'Process expired stock'}
          </button>
        )}
        {onRefresh && <button className="btn-secondary" onClick={onRefresh}>Refresh</button>}
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>SKU / Barcode</th>
            <th>Name</th>
            <th>Category</th>
            <th>Price</th>
            <th>Stock Level</th>
            <th>Expiry</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => {
            const summary = inventoryMap[p.id] ?? {
              available_quantity: p.stock_quantity,
              expired_quantity: 0,
              near_expiry_count: 0,
              earliest_expiry_date: null,
              expires_soon: false,
              has_expired_batches: false,
            };
            const isOutOfStock = summary.available_quantity === 0;
            const isLow = !isOutOfStock && summary.available_quantity <= p.reorder_level;
            const isExpiring = summary.near_expiry_count > 0 || summary.expires_soon;
            return (
              <tr
                key={p.id}
                className={[
                  isOutOfStock ? 'out-of-stock-row' : '',
                  isLow || isExpiring ? 'low-stock-row' : '',
                ].filter(Boolean).join(' ')}
              >
                <td>{p.sku} / {p.barcode}</td>
                <td><strong>{p.name}</strong></td>
                <td>{p.category}</td>
                <td>₱{p.price.toFixed(2)}</td>
                <td>{summary.available_quantity}</td>
                <td>
                  {formatExpiry(summary.earliest_expiry_date)}
                  {summary.near_expiry_count > 0 && (
                    <div className="expiry-note">
                      {summary.near_expiry_count} of {summary.available_quantity} stocks nearing expiry
                    </div>
                  )}
                  <details className="batch-details">
                    <summary>Batch details</summary>
                    <ul>
                      {batches.filter((batch) => batch.product_id === p.id).map((batch) => (
                        <li key={batch.id}>
                          {batch.batch_code}: {batch.quantity_remaining}/{batch.quantity_received}
                          {' · '}{formatExpiry(batch.expiry_date)}
                          {' · '}{batch.status}
                        </li>
                      ))}
                      {!batches.some((batch) => batch.product_id === p.id) && <li>No batches recorded</li>}
                    </ul>
                  </details>
                </td>
                <td>
                  {isOutOfStock && <span className="badge badge-no-stock">No Stock</span>}
                  {isLow && (
                    <span className="badge badge-low-stock">
                      <span className="stock-warning-icon" aria-hidden="true">⚠︎</span>
                      {' '}Low Stock
                    </span>
                  )}
                  {isExpiring && <span className="badge badge-warn">⏳ Expires soon</span>}
                  {!isOutOfStock && !isLow && !isExpiring && <span className="badge badge-ok">OK</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}