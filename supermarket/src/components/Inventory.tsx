import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { NewProductInput, Product, ProductBatch, ProductInventorySummary, ReceiveStockInput, UpdateProductInput, WriteOffStockInput } from '../types/app';
import { useNotify } from '../contexts/NotifyContext';
import { formatExpiry, sellableBatches } from '../lib/expiry';
import { NEAR_EXPIRY_PERCENT_OFF } from '../lib/pricing';
import BatchBreakdown from './BatchBreakdown';
import BarcodeImage from './BarcodeImage';

interface InventoryProps {
  products: Product[];
  inventory: ProductInventorySummary[];
  batches: ProductBatch[];
  // Cashiers get this screen read-only: they can check stock levels, expiry
  // dates and batches, but only admins add products or restock. The database
  // enforces that too; hiding the forms just keeps cashiers from hitting errors.
  readOnly?: boolean;
  // Admin actions. Not needed (and not passed) when readOnly is on.
  // They return what the database generated: the saved product (with its
  // barcode) and the new batch code.
  onAddProduct?: (product: NewProductInput) => Promise<Product>;
  onUpdateProduct?: (productId: number, product: UpdateProductInput) => Promise<void>;
  onReceiveStock?: (input: ReceiveStockInput) => Promise<string>;
  onWriteOffStock?: (input: WriteOffStockInput) => Promise<void>;
  onProcessExpired?: () => Promise<void>;
  onRefresh?: () => void;
}

// No barcode or batch code boxes: the database always generates both, and
// keeps them unique.
const emptyForm = {
  sku: '',
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
};

const emptyWriteOff = {
  product_id: '',
  batch_id: '',
  quantity: '',
  kind: 'damaged' as WriteOffStockInput['kind'],
  reason: '',
};

export default function Inventory({ products, inventory, batches, readOnly = false, onAddProduct, onUpdateProduct, onReceiveStock, onWriteOffStock, onProcessExpired, onRefresh }: InventoryProps) {
  const [form, setForm] = useState(emptyForm);
  const [receiveForm, setReceiveForm] = useState(emptyReceive);
  const [writeOffForm, setWriteOffForm] = useState(emptyWriteOff);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState<UpdateProductInput | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  // The edit form opens at the top of the page, but the Edit buttons are in
  // the table further down. Scroll it into view, or it looks like nothing happened.
  const editFormRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (editingProduct) editFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [editingProduct]);
  const [processingExpired, setProcessingExpired] = useState(false);
  const { notify, askToConfirm } = useNotify();

  const inventoryMap = useMemo(
    () => Object.fromEntries(inventory.map((item) => [item.id, item])),
    [inventory]
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const saved = await onAddProduct({
        sku: form.sku,
        name: form.name,
        category: form.category,
        price: parseFloat(form.price),
        cost: parseFloat(form.cost),
        stock_quantity: parseInt(form.stock_quantity, 10),
        reorder_level: parseInt(form.reorder_level, 10),
      });
      setForm(emptyForm);
      notify(`${form.name} was added to the catalog with barcode ${saved?.barcode ?? '(assigned)'}.`, 'success');
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
      const batchCode = await onReceiveStock({
        product_id: Number(receiveForm.product_id),
        quantity: Number(receiveForm.quantity),
        expiry_date: receiveForm.expiry_date,
      });
      setReceiveForm(emptyReceive);
      notify(batchCode ? `Stock received as batch ${batchCode}.` : 'Stock received.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not receive stock', 'error');
    }
  };

  const writeOffBatchChoices = batches.filter((batch) =>
    batch.product_id === Number(writeOffForm.product_id) &&
    batch.status === 'active' &&
    batch.quantity_remaining > 0
  );

  const handleWriteOff = async (e: FormEvent) => {
    e.preventDefault();
    if (!onWriteOffStock || !writeOffForm.batch_id) {
      notify('Select a product batch to write off.', 'error');
      return;
    }

    const quantity = Number(writeOffForm.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      notify('Enter a whole number greater than zero.', 'error');
      return;
    }
    if (!writeOffForm.reason.trim()) {
      notify('Enter a reason for writing off this stock.', 'error');
      return;
    }

    const batch = writeOffBatchChoices.find((item) => item.id === Number(writeOffForm.batch_id));
    if (!batch) {
      notify('The selected batch is no longer available.', 'error');
      return;
    }

    const confirmed = await askToConfirm({
      title: 'Confirm stock write-off',
      message: `Write off ${quantity} unit${quantity === 1 ? '' : 's'} from ${batch.batch_code}? This will reduce stock and record the loss.`,
      confirmLabel: 'Write off stock',
    });
    if (!confirmed) return;

    try {
      await onWriteOffStock({
        batch_id: batch.id,
        quantity,
        kind: writeOffForm.kind,
        reason: writeOffForm.reason.trim(),
      });
      notify(`${quantity} unit${quantity === 1 ? '' : 's'} written off from ${batch.batch_code}.`, 'success');
      setWriteOffForm(emptyWriteOff);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not write off stock.', 'error');
    }
  };

  const startEditing = (product: Product) => {
    setEditingProduct(product);
    setEditForm({
      sku: product.sku,
      name: product.name,
      category: product.category,
      price: product.price,
      cost: product.cost,
      reorder_level: product.reorder_level,
    });
  };

  const cancelEditing = () => {
    setEditingProduct(null);
    setEditForm(null);
  };

  const handleUpdateProduct = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingProduct || !editForm || !onUpdateProduct || savingEdit) return;

    setSavingEdit(true);
    try {
      await onUpdateProduct(editingProduct.id, editForm);
      notify(`${editForm.name} was updated.`, 'success');
      cancelEditing();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update the product.', 'error');
    } finally {
      setSavingEdit(false);
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
          {editingProduct && editForm && (
            <form ref={editFormRef} className="form-card" onSubmit={handleUpdateProduct} autoComplete="off">
              <h3>Edit {editingProduct.name}</h3>
              <div className="form-grid">
                <input
                  placeholder="SKU"
                  value={editForm.sku}
                  onChange={(e) => setEditForm({ ...editForm, sku: e.target.value })}
                  required
                />
                <input
                  placeholder="Product Name"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                />
                <input
                  placeholder="Category"
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  required
                />
                <input
                  aria-label="Price"
                  placeholder="Price (₱)"
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.price}
                  onChange={(e) => setEditForm({ ...editForm, price: Number(e.target.value) })}
                  required
                />
                <input
                  aria-label="Cost"
                  placeholder="Cost (₱)"
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.cost}
                  onChange={(e) => setEditForm({ ...editForm, cost: Number(e.target.value) })}
                  required
                />
                <input
                  aria-label="Reorder level"
                  placeholder="Reorder Level"
                  type="number"
                  min="0"
                  step="1"
                  value={editForm.reorder_level}
                  onChange={(e) => setEditForm({ ...editForm, reorder_level: Number(e.target.value) })}
                  required
                />
              </div>
              <div className="inventory-toolbar">
                <button type="submit" className="btn-primary" disabled={savingEdit}>
                  {savingEdit ? 'Saving…' : 'Save Changes'}
                </button>
                <button type="button" className="btn-secondary" onClick={cancelEditing} disabled={savingEdit}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* autoComplete="off" on both forms: no browser pop-up of values
              typed into these boxes before. */}
          <form className="form-card" onSubmit={handleSubmit} autoComplete="off">
            <h3>Add New Product</h3>
            <div className="form-grid">
              <input placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required />
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
            </div>
            <button type="submit" className="btn-primary">Receive Stock</button>
          </form>

          <form className="form-card" onSubmit={handleWriteOff} autoComplete="off">
            <h3>Write Off Damaged / Spoiled Stock</h3>
            <div className="form-grid">
              <select
                aria-label="Product"
                value={writeOffForm.product_id}
                onChange={(e) => setWriteOffForm({ ...writeOffForm, product_id: e.target.value, batch_id: '' })}
                required
              >
                <option value="">Select product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.name}</option>
                ))}
              </select>
              <select
                aria-label="Batch"
                value={writeOffForm.batch_id}
                onChange={(e) => setWriteOffForm({ ...writeOffForm, batch_id: e.target.value })}
                disabled={!writeOffForm.product_id}
                required
              >
                <option value="">Select active batch</option>
                {writeOffBatchChoices.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.batch_code} — {batch.quantity_remaining} remaining
                  </option>
                ))}
              </select>
              <input
                aria-label="Write-off quantity"
                type="number"
                min="1"
                max={writeOffBatchChoices.find((batch) => batch.id === Number(writeOffForm.batch_id))?.quantity_remaining}
                step="1"
                placeholder="Quantity"
                value={writeOffForm.quantity}
                onChange={(e) => setWriteOffForm({ ...writeOffForm, quantity: e.target.value })}
                required
              />
              <select
                aria-label="Write-off type"
                value={writeOffForm.kind}
                onChange={(e) => setWriteOffForm({ ...writeOffForm, kind: e.target.value as WriteOffStockInput['kind'] })}
                required
              >
                <option value="damaged">Damaged</option>
                <option value="spoiled">Spoiled</option>
              </select>
              <input
                aria-label="Reason"
                placeholder="Reason"
                value={writeOffForm.reason}
                onChange={(e) => setWriteOffForm({ ...writeOffForm, reason: e.target.value })}
                required
              />
            </div>
            <button type="submit" className="btn-danger">Write Off Stock</button>
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
            {!readOnly && <th>Actions</th>}
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
                <td>
                  {p.sku}
                  {/* The barcode as real bars (number underneath), ready to scan or print. */}
                  <div className="inventory-barcode">
                    <BarcodeImage value={p.barcode} height={30} barWidth={1} fontSize={11} />
                  </div>
                </td>
                <td><strong>{p.name}</strong></td>
                <td>{p.category}</td>
                <td>₱{p.price.toFixed(2)}</td>
                <td>
                  {summary.available_quantity}
                  {/* How that total splits across batches, e.g. 13 = B-3: 10 + B-1: 3. */}
                  <BatchBreakdown
                    batches={sellableBatches(batches.filter((batch) => batch.product_id === p.id))}
                  />
                </td>
                <td>
                  {formatExpiry(summary.earliest_expiry_date)}
                  {summary.near_expiry_count > 0 && (
                    <div className="expiry-note">
                      {summary.near_expiry_count} of {summary.available_quantity} stocks nearing expiry
                      {` · ${NEAR_EXPIRY_PERCENT_OFF}% off at checkout`}
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
                {!readOnly && (
                  <td>
                    <button className="btn-sm" onClick={() => startEditing(p)}>Edit</button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}