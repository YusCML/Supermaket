import { useMemo, useState, type FormEvent } from 'react';
import type { NewProductInput, Product, ProductBatch, ProductInventorySummary, ReceiveStockInput } from '../types/app';

interface InventoryProps {
  products: Product[];
  inventory: ProductInventorySummary[];
  batches: ProductBatch[];
  onAddProduct: (product: NewProductInput) => Promise<void>;
  onReceiveStock: (input: ReceiveStockInput) => Promise<void>;
  onProcessExpired: () => Promise<void>;
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

export default function Inventory({
  products,
  inventory,
  batches,
  onAddProduct,
  onReceiveStock,
  onProcessExpired,
  onRefresh,
}: InventoryProps) {
  const [form, setForm] = useState(emptyForm);
  const [receiveForm, setReceiveForm] = useState(emptyReceive);
  const [processingExpired, setProcessingExpired] = useState(false);

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
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not save the product');
    }
  };

  const handleReceive = async (e: FormEvent) => {
    e.preventDefault();
    if (!receiveForm.product_id || !receiveForm.quantity || !receiveForm.expiry_date) {
      alert('Select a product, quantity, and expiry date before receiving stock.');
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
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not receive stock');
    }
  };

  const handleProcessExpired = async () => {
    if (processingExpired) return;
    setProcessingExpired(true);
    try {
      await onProcessExpired();
      alert('Expired stock has been processed.');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not process expired stock');
    } finally {
      setProcessingExpired(false);
    }
  };

  const inputStyle =
    'w-full rounded-lg border border-gray-300 bg-[#FFFFFF] px-3 py-2 text-xs text-[#333333] placeholder-[#333333]/40 outline-none transition-all focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20';

  return (
    <div className="p-6 space-y-6 min-h-screen bg-[#F5F5F5] text-[#333333] font-sans antialiased selection:bg-[#2E7D32]/15 selection:text-[#2E7D32]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-[#333333]">
          Catalog & Stock Control
        </h2>
      </div>

      {/* Forms Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Add Product Form */}
        <form
          className="rounded-2xl border border-gray-200/80 bg-[#FFFFFF] p-5 shadow-sm space-y-4"
          onSubmit={handleSubmit}
        >
          <h3 className="text-base font-bold text-[#333333] border-b border-gray-100 pb-2">
            Add New Product
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              placeholder="SKU"
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              className={inputStyle}
              required
            />
            <input
              placeholder="Barcode"
              value={form.barcode}
              onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              className={inputStyle}
              required
            />
            <input
              placeholder="Product Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={`${inputStyle} sm:col-span-2`}
              required
            />
            <input
              placeholder="Category"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className={inputStyle}
              required
            />
            <input
              placeholder="Price (₱)"
              type="number"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              className={inputStyle}
              required
            />
            <input
              placeholder="Cost (₱)"
              type="number"
              step="0.01"
              value={form.cost}
              onChange={(e) => setForm({ ...form, cost: e.target.value })}
              className={inputStyle}
              required
            />
            <input
              placeholder="Stock Quantity"
              type="number"
              value={form.stock_quantity}
              onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
              className={inputStyle}
              required
            />
            <input
              placeholder="Reorder Level"
              type="number"
              value={form.reorder_level}
              onChange={(e) => setForm({ ...form, reorder_level: e.target.value })}
              className={`${inputStyle} sm:col-span-2`}
              required
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-[#2E7D32] py-2.5 text-xs font-semibold text-[#FFFFFF] shadow-sm hover:bg-[#246628] transition-colors"
          >
            Save Product
          </button>
        </form>

        {/* Receive Stock Form */}
        <form
          className="rounded-2xl border border-gray-200/80 bg-[#FFFFFF] p-5 shadow-sm space-y-4 flex flex-col justify-between"
          onSubmit={handleReceive}
        >
          <div className="space-y-4">
            <h3 className="text-base font-bold text-[#333333] border-b border-gray-100 pb-2">
              Receive Stock by Batch
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select
                value={receiveForm.product_id}
                onChange={(e) => setReceiveForm({ ...receiveForm, product_id: e.target.value })}
                className={`${inputStyle} sm:col-span-2`}
                required
              >
                <option value="">Select product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                placeholder="Batch quantity"
                value={receiveForm.quantity}
                onChange={(e) => setReceiveForm({ ...receiveForm, quantity: e.target.value })}
                className={inputStyle}
                required
              />
              <input
                type="date"
                value={receiveForm.expiry_date}
                onChange={(e) => setReceiveForm({ ...receiveForm, expiry_date: e.target.value })}
                className={inputStyle}
                required
              />
              <input
                placeholder="Optional batch code"
                value={receiveForm.batch_code}
                onChange={(e) => setReceiveForm({ ...receiveForm, batch_code: e.target.value })}
                className={`${inputStyle} sm:col-span-2`}
              />
            </div>
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-[#2E7D32] py-2.5 text-xs font-semibold text-[#FFFFFF] shadow-sm hover:bg-[#246628] transition-colors mt-4"
          >
            Receive Stock
          </button>
        </form>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 pt-2">
        <button
          className="rounded-lg bg-[#2E7D32] px-4 py-2 text-xs font-semibold text-[#FFFFFF] shadow-sm hover:bg-[#246628] disabled:opacity-50 transition-colors"
          onClick={handleProcessExpired}
          disabled={processingExpired}
        >
          {processingExpired ? 'Processing…' : 'Process expired stock'}
        </button>
        {onRefresh && (
          <button
            className="rounded-lg border border-gray-300 bg-[#FFFFFF] px-4 py-2 text-xs font-semibold text-[#333333] hover:bg-gray-50 transition-colors shadow-xs"
            onClick={onRefresh}
          >
            Refresh
          </button>
        )}
      </div>

      {/* Inventory Data Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-[#FFFFFF] shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#333333]">
            <thead className="bg-[#F5F5F5] border-b border-gray-200 text-[#333333]/70 font-semibold">
              <tr>
                <th className="px-4 py-3">SKU / Barcode</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Stock Level</th>
                <th className="px-4 py-3">Expiry</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
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
                    className={`transition-colors ${
                      isOutOfStock
                        ? 'bg-red-50/40 hover:bg-red-50/70'
                        : isLow || isExpiring
                        ? 'bg-amber-50/40 hover:bg-amber-50/70'
                        : 'hover:bg-gray-50/60'
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-[11px] text-[#333333]/70">
                      {p.sku} / {p.barcode}
                    </td>
                    <td className="px-4 py-3 font-semibold text-[#333333]">{p.name}</td>
                    <td className="px-4 py-3 text-[#333333]/70">{p.category}</td>
                    <td className="px-4 py-3 font-medium">₱{p.price.toFixed(2)}</td>
                    <td className="px-4 py-3 font-bold">{summary.available_quantity}</td>
                    <td className="px-4 py-3 space-y-1">
                      <div>{formatExpiry(summary.earliest_expiry_date)}</div>
                      {summary.near_expiry_count > 0 && (
                        <div className="text-[10px] font-semibold text-amber-700">
                          {summary.near_expiry_count} of {summary.available_quantity} stocks nearing expiry
                        </div>
                      )}
                      <details className="cursor-pointer text-[11px] text-[#2E7D32] hover:underline">
                        <summary className="font-medium outline-none">Batch details</summary>
                        <ul className="mt-1 space-y-1 pl-2 text-[10px] text-[#333333]/80 border-l border-gray-200">
                          {batches
                            .filter((batch) => batch.product_id === p.id)
                            .map((batch) => (
                              <li key={batch.id}>
                                <span className="font-mono font-semibold">{batch.batch_code}</span>:{' '}
                                {batch.quantity_remaining}/{batch.quantity_received}
                                {' · '}
                                {formatExpiry(batch.expiry_date)}
                                {' · '}
                                <span className="capitalize">{batch.status}</span>
                              </li>
                            ))}
                          {!batches.some((batch) => batch.product_id === p.id) && (
                            <li className="text-gray-400">No batches recorded</li>
                          )}
                        </ul>
                      </details>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {isOutOfStock && (
                          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[10px] font-bold text-red-700 border border-red-200">
                            No Stock
                          </span>
                        )}
                        {isLow && (
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200 inline-flex items-center gap-1">
                            <span>⚠︎</span> Low Stock
                          </span>
                        )}
                        {isExpiring && (
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                            ⏳ Expires soon
                          </span>
                        )}
                        {!isOutOfStock && !isLow && !isExpiring && (
                          <span className="rounded-full bg-[#2E7D32]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#2E7D32] border border-[#2E7D32]/20">
                            OK
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}