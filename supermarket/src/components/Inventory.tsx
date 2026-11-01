import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, Clock, ImageIcon } from 'lucide-react';
import type { NewProductInput, Product, ProductBatch, ProductInventorySummary, ReceiveStockInput, UpdateProductInput, WriteOffStockInput } from '../types/app';
import { api } from '../lib/api';
import { useNotify } from '../contexts/NotifyContext';
import { formatExpiry, sellableBatches } from '../lib/expiry';
import { NEAR_EXPIRY_PERCENT_OFF } from '../lib/pricing';
import BatchBreakdown from './BatchBreakdown';
import BarcodeImage from './BarcodeImage';

interface InventoryProps {
  products: Product[];
  inventory: ProductInventorySummary[];
  batches: ProductBatch[];
  readOnly?: boolean;
  onAddProduct?: (product: NewProductInput) => Promise<Product>;
  onUpdateProduct?: (productId: number, product: UpdateProductInput) => Promise<void>;
  onReceiveStock?: (input: ReceiveStockInput) => Promise<string>;
  onWriteOffStock?: (input: WriteOffStockInput) => Promise<void>;
  onProcessExpired?: () => Promise<void>;
  onRefresh?: () => void;
}

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

export default function Inventory({
  products,
  inventory,
  batches,
  readOnly = false,
  onAddProduct,
  onUpdateProduct,
  onReceiveStock,
  onWriteOffStock,
  onProcessExpired,
  onRefresh,
}: InventoryProps) {
  const [form, setForm] = useState(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  
  const [receiveForm, setReceiveForm] = useState(emptyReceive);
  const [writeOffForm, setWriteOffForm] = useState(emptyWriteOff);
  
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState<UpdateProductInput | null>(null);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  
  const [savingEdit, setSavingEdit] = useState(false);
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
    if (!onAddProduct) return;
    try {
      let imageUrl = null;
      if (imageFile) {
        imageUrl = await api.uploadProductImage(imageFile);
      }

      const saved = await onAddProduct({
        sku: form.sku,
        name: form.name,
        category: form.category,
        price: parseFloat(form.price),
        cost: parseFloat(form.cost),
        stock_quantity: parseInt(form.stock_quantity, 10),
        reorder_level: parseInt(form.reorder_level, 10),
        image_url: imageUrl,
      });
      setForm(emptyForm);
      setImageFile(null);
      notify(`${form.name} was added to the catalog with barcode ${saved?.barcode ?? '(assigned)'}.`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save the product', 'error');
    }
  };

  const handleReceive = async (e: FormEvent) => {
    e.preventDefault();
    if (!onReceiveStock) return;
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

  const writeOffBatchChoices = batches.filter(
    (batch) =>
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
    setEditImageFile(null);
  };

  const cancelEditing = () => {
    setEditingProduct(null);
    setEditForm(null);
    setEditImageFile(null);
  };

  const handleUpdateProduct = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingProduct || !editForm || !onUpdateProduct || savingEdit) return;

    setSavingEdit(true);
    try {
      let newImageUrl = editingProduct.image_url;
      
      if (editImageFile) {
        newImageUrl = await api.uploadProductImage(editImageFile);
      }

      await onUpdateProduct(editingProduct.id, {
        ...editForm,
        image_url: newImageUrl,
      });
      
      notify(`${editForm.name} was updated.`, 'success');
      cancelEditing();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update the product.', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleProcessExpired = async () => {
    if (processingExpired || !onProcessExpired) return;
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

  const inputStyle =
    'w-full rounded-lg border border-gray-300 bg-[#FFFFFF] px-3 py-2 text-xs text-[#333333] placeholder-[#333333]/40 outline-none transition-all focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20';

  return (
    <div className="p-6 space-y-6 min-h-screen bg-[#F5F5F5] text-[#333333] font-sans antialiased selection:bg-[#2E7D32]/15 selection:text-[#2E7D32]">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-[#333333]">
          Catalog & Stock Control
        </h2>
      </div>

      {readOnly && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">
          View only. Adding products and restocking are done by an admin.
        </div>
      )}

      {!readOnly && (
        <div className="space-y-6">
          
          {editingProduct && editForm && (
            <form
              ref={editFormRef}
              className="rounded-2xl border border-[#2E7D32]/30 bg-[#FFFFFF] p-5 shadow-xs space-y-4"
              onSubmit={handleUpdateProduct}
              autoComplete="off"
            >
              <h3 className="text-base font-bold text-[#333333] border-b border-gray-100 pb-2">
                Edit {editingProduct.name}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <input
                  placeholder="SKU"
                  value={editForm.sku}
                  onChange={(e) => setEditForm({ ...editForm, sku: e.target.value })}
                  className={inputStyle}
                  required
                />
                <input
                  placeholder="Product Name"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className={inputStyle}
                  required
                />
                <input
                  placeholder="Category"
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  className={inputStyle}
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
                  className={inputStyle}
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
                  className={inputStyle}
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
                  className={inputStyle}
                  required
                />
              </div>
              
              <div className="pt-2">
                <label className="block text-[11px] font-bold text-[#333333]/60 uppercase tracking-wider mb-1">
                  Update Image (Leave blank to keep current)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setEditImageFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-[#333333] file:mr-4 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#2E7D32]/10 file:text-[#2E7D32] hover:file:bg-[#2E7D32]/20 cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  className="rounded-lg bg-[#2E7D32] px-4 py-2 text-xs font-semibold text-[#FFFFFF] shadow-xs hover:bg-[#246628] transition-colors disabled:opacity-50"
                  disabled={savingEdit}
                >
                  {savingEdit ? 'Saving…' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-gray-300 bg-[#FFFFFF] px-4 py-2 text-xs font-semibold text-[#333333] hover:bg-gray-50 transition-colors shadow-2xs disabled:opacity-50"
                  onClick={cancelEditing}
                  disabled={savingEdit}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            <form
              className="rounded-2xl border border-gray-200/80 bg-[#FFFFFF] p-5 shadow-xs space-y-4 flex flex-col justify-between"
              onSubmit={handleSubmit}
              autoComplete="off"
            >
              <div className="space-y-4">
                <h3 className="text-base font-bold text-[#333333] border-b border-gray-100 pb-2">
                  Add New Product
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                  <input
                    placeholder="SKU"
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    className={inputStyle}
                    required
                  />
                  <input
                    placeholder="Product Name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={inputStyle}
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
                    className={inputStyle}
                    required
                  />
                  
                  <div className="pt-2">
                    <label className="block text-[11px] font-bold text-[#333333]/60 uppercase tracking-wider mb-1">
                      Product Image
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                      className="w-full text-xs text-[#333333] file:mr-4 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#2E7D32]/10 file:text-[#2E7D32] hover:file:bg-[#2E7D32]/20 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
              <button
                type="submit"
                className="w-full rounded-lg bg-[#2E7D32] py-2.5 text-xs font-semibold text-[#FFFFFF] shadow-xs hover:bg-[#246628] transition-colors mt-4"
              >
                Save Product
              </button>
            </form>

            <form
              className="rounded-2xl border border-gray-200/80 bg-[#FFFFFF] p-5 shadow-xs space-y-4 flex flex-col justify-between"
              onSubmit={handleReceive}
              autoComplete="off"
            >
              <div className="space-y-4">
                <h3 className="text-base font-bold text-[#333333] border-b border-gray-100 pb-2">
                  Receive Stock by Batch
                </h3>
                <div className="space-y-3">
                  <select
                    value={receiveForm.product_id}
                    onChange={(e) => setReceiveForm({ ...receiveForm, product_id: e.target.value })}
                    className={inputStyle}
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
                </div>
              </div>
              <button
                type="submit"
                className="w-full rounded-lg bg-[#2E7D32] py-2.5 text-xs font-semibold text-[#FFFFFF] shadow-xs hover:bg-[#246628] transition-colors mt-4"
              >
                Receive Stock
              </button>
            </form>

            <form
              className="rounded-2xl border border-gray-200/80 bg-[#FFFFFF] p-5 shadow-xs space-y-4 flex flex-col justify-between"
              onSubmit={handleWriteOff}
              autoComplete="off"
            >
              <div className="space-y-4">
                <h3 className="text-base font-bold text-[#333333] border-b border-gray-100 pb-2">
                  Write Off Damaged / Spoiled Stock
                </h3>
                <div className="space-y-3">
                  <select
                    aria-label="Product"
                    value={writeOffForm.product_id}
                    onChange={(e) =>
                      setWriteOffForm({ ...writeOffForm, product_id: e.target.value, batch_id: '' })
                    }
                    className={inputStyle}
                    required
                  >
                    <option value="">Select product</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label="Batch"
                    value={writeOffForm.batch_id}
                    onChange={(e) => setWriteOffForm({ ...writeOffForm, batch_id: e.target.value })}
                    disabled={!writeOffForm.product_id}
                    className={`${inputStyle} disabled:bg-gray-100 disabled:cursor-not-allowed`}
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
                    max={
                      writeOffBatchChoices.find((batch) => batch.id === Number(writeOffForm.batch_id))
                        ?.quantity_remaining
                    }
                    step="1"
                    placeholder="Quantity"
                    value={writeOffForm.quantity}
                    onChange={(e) => setWriteOffForm({ ...writeOffForm, quantity: e.target.value })}
                    className={inputStyle}
                    required
                  />

                  <select
                    aria-label="Write-off type"
                    value={writeOffForm.kind}
                    onChange={(e) =>
                      setWriteOffForm({ ...writeOffForm, kind: e.target.value as WriteOffStockInput['kind'] })
                    }
                    className={inputStyle}
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
                    className={inputStyle}
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full rounded-lg bg-red-600 py-2.5 text-xs font-semibold text-[#FFFFFF] shadow-xs hover:bg-red-700 transition-colors mt-4"
              >
                Write Off Stock
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        {!readOnly && (          <button
            className="rounded-lg bg-[#2E7D32] px-4 py-2 text-xs font-semibold text-[#FFFFFF] shadow-xs hover:bg-[#246628] disabled:opacity-50 transition-colors"
            onClick={handleProcessExpired}
            disabled={processingExpired}
          >
            {processingExpired ? 'Processing…' : 'Process expired stock'}
          </button>
        )}
        {onRefresh && (
          <button
            className="rounded-lg border border-gray-300 bg-[#FFFFFF] px-4 py-2 text-xs font-semibold text-[#333333] hover:bg-gray-50 transition-colors shadow-2xs"
            onClick={onRefresh}
          >
            Refresh
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-[#FFFFFF] shadow-xs">
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
                {!readOnly && <th className="px-4 py-3 text-right">Actions</th>}
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
                    <td className="px-4 py-3 font-mono text-[11px] text-[#333333]/70 space-y-1">
                      <div>{p.sku}</div>
                      <div className="mt-1">
                        <BarcodeImage value={p.barcode} height={30} barWidth={1} fontSize={11} />
                      </div>
                    </td>
                    
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[#F5F5F5] flex items-center justify-center shrink-0 overflow-hidden border border-gray-200/60">
                          {p.image_url ? (
                            <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon className="size-4 text-[#333333]/20" />
                          )}
                        </div>
                        <span className="font-semibold text-[#333333]">{p.name}</span>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-[#333333]/70">{p.category}</td>
                    <td className="px-4 py-3 font-medium">₱{p.price.toFixed(2)}</td>
                    <td className="px-4 py-3 font-bold space-y-1">
                      <div>{summary.available_quantity}</div>
                      <BatchBreakdown
                        batches={sellableBatches(batches.filter((batch) => batch.product_id === p.id))}
                      />
                    </td>
                    <td className="px-4 py-3 space-y-1">
                      <div>{formatExpiry(summary.earliest_expiry_date)}</div>
                      {summary.near_expiry_count > 0 && (
                        <div className="text-[10px] font-semibold text-amber-700">
                          {summary.near_expiry_count} of {summary.available_quantity} stocks nearing expiry
                          {` · ${NEAR_EXPIRY_PERCENT_OFF}% off at checkout`}
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
                      <div className="flex flex-wrap gap-2">
                        {isOutOfStock && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-red-700">
                            No Stock
                          </span>
                        )}
                        {isLow && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                            <AlertTriangle className="size-3" /> Low Stock
                          </span>
                        )}
                        {isExpiring && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                            <Clock className="size-3" /> Expires soon
                          </span>
                        )}
                        {!isOutOfStock && !isLow && !isExpiring && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#2E7D32]">
                            OK
                          </span>
                        )}
                      </div>
                    </td>
                    {!readOnly && (
                      <td className="px-4 py-3 text-right">
                        <button
                          className="rounded-lg border border-gray-300 bg-[#FFFFFF] px-2.5 py-1 text-xs font-semibold text-[#333333] hover:bg-gray-50 transition-colors shadow-2xs"
                          onClick={() => startEditing(p)}
                        >
                          Edit
                        </button>
                      </td>
                    )}
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