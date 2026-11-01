import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, Check, ChevronDown, Clock, ImageIcon, Info, PackageX, Pencil, RefreshCw, Search } from 'lucide-react';
import type { NewProductInput, Product, ProductBatch, ProductInventorySummary, ReceiveStockInput, UpdateProductInput, WriteOffStockInput } from '../types/app';
import { api } from '../lib/api';
import { useNotify } from '../contexts/NotifyContext';
import { daysUntilExpiry, describeExpiry, formatExpiry, isNearExpiry, sellableBatches } from '../lib/expiry';
import { NEAR_EXPIRY_DAYS, NEAR_EXPIRY_PERCENT_OFF } from '../lib/pricing';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Input, Textarea } from './ui/input';
import { Field } from './ui/field';
import { RichSelect, type RichSelectOption } from './ui/rich-select';
import { StatusText, type StatusTone } from './ui/status-text';
import { CategoryInput } from './ui/category-input';
import { categorySuggestions, matchCategory } from '../lib/categories';
import PageHeader from './PageHeader';
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
  description: '',
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

// The filter buttons above the table.
type StatusFilter = 'all' | 'low' | 'out' | 'expiring';
const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'low', label: 'Low stock' },
  { id: 'out', label: 'Out of stock' },
  { id: 'expiring', label: 'Expiring soon' },
];

// Shared look for the three form cards (Add / Receive / Write off).
const formCardClass = 'flex flex-col justify-between gap-5 rounded-lg border border-gray-200 bg-white p-5 shadow-xs';
const formTitleClass = 'border-b border-gray-100 pb-2 text-base font-bold text-ink';
const fileInputClass =
  'w-full text-xs text-ink file:mr-3 file:rounded-full file:border-0 file:bg-brand/10 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-brand-strong hover:file:bg-brand/20';

// What state a batch is in, in words, e.g. "Active", "15% off", "Expired".
function batchState(batch: ProductBatch): { label: string; tone: StatusTone } {
  if (batch.status === 'expired') return { label: 'Expired', tone: 'danger' };
  if (batch.status === 'spoiled') return { label: 'Written off', tone: 'danger' };
  if (batch.status === 'manual') return { label: 'Manual', tone: 'muted' };
  // From here on the batch is 'active'.
  if (batch.quantity_remaining === 0) return { label: 'Sold out', tone: 'muted' };
  if (batch.expiry_date && daysUntilExpiry(batch.expiry_date) <= 0) return { label: 'Past expiry', tone: 'danger' };
  if (isNearExpiry(batch.expiry_date)) return { label: `${NEAR_EXPIRY_PERCENT_OFF}% off`, tone: 'warning' };
  return { label: 'Active', tone: 'success' };
}

const shortDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

// The table that opens under a product row: one line per batch, with a bar
// showing how much of the delivery is left.
function BatchTable({ batches }: { batches: ProductBatch[] }) {
  return (
    <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-gray-200 bg-subtle font-semibold text-ink-muted">
          <tr>
            <th className="px-3 py-2">Batch</th>
            <th className="px-3 py-2">Received</th>
            <th className="px-3 py-2">Left</th>
            <th className="px-3 py-2">Expiry</th>
            <th className="px-3 py-2">State</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {batches.map((batch) => {
            const percentLeft =
              batch.quantity_received > 0 ? Math.round((batch.quantity_remaining / batch.quantity_received) * 100) : 0;
            const state = batchState(batch);
            return (
              <tr key={batch.id}>
                <td className="px-3 py-2 font-mono font-semibold text-ink">{batch.batch_code}</td>
                <td className="px-3 py-2 text-ink-muted">{shortDate(batch.received_at ?? batch.created_at)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-200" aria-hidden="true">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${percentLeft}%` }} />
                    </div>
                    <span className="text-ink tabular-nums">
                      <strong className="font-semibold">{batch.quantity_remaining}</strong>
                      <span className="text-ink-muted"> of {batch.quantity_received}</span>
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-ink-muted">{describeExpiry(batch.expiry_date)}</td>
                <td className="px-3 py-2">
                  <StatusText tone={state.tone}>{state.label}</StatusText>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

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

  // Which of the three forms is currently saving. While it is, its button is
  // disabled, so a double-click can't add the same product twice.
  const [busyForm, setBusyForm] = useState<'add' | 'receive' | 'writeoff' | null>(null);

  // Search box and status filter for the table.
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Which products have their batch table opened (several can be open at once).
  const [openBatchRows, setOpenBatchRows] = useState<Set<number>>(new Set());
  const toggleBatchRow = (productId: number) => {
    setOpenBatchRows((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const inventoryMap = useMemo(
    () => Object.fromEntries(inventory.map((item) => [item.id, item])),
    [inventory]
  );

  // Categories to suggest in the Category box: the starter ones plus every
  // category a product already uses (so new ones appear right after saving).
  const knownCategories = useMemo(() => categorySuggestions(products), [products]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!onAddProduct) return;
    setBusyForm('add');
    try {
      let imageUrl = null;
      if (imageFile) {
        imageUrl = await api.uploadProductImage(imageFile);
      }

      const description = form.description.trim();
      const saved = await onAddProduct({
        sku: form.sku,
        name: form.name,
        // Re-use an existing category's spelling if it matches; otherwise
        // this creates a new category.
        category: matchCategory(form.category, knownCategories),
        price: parseFloat(form.price),
        cost: parseFloat(form.cost),
        stock_quantity: parseInt(form.stock_quantity, 10),
        reorder_level: parseInt(form.reorder_level, 10),
        image_url: imageUrl,
        // Only sent when filled in, so adding products still works on a
        // database that doesn't have the description column yet.
        ...(description ? { description } : {}),
      });
      setForm(emptyForm);
      setImageFile(null);
      notify(`${form.name} was added to the catalog with barcode ${saved?.barcode ?? '(assigned)'}.`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save the product', 'error');
    } finally {
      setBusyForm(null);
    }
  };

  const handleReceive = async (e: FormEvent) => {
    e.preventDefault();
    if (!onReceiveStock) return;
    if (!receiveForm.product_id || !receiveForm.quantity || !receiveForm.expiry_date) {
      notify('Select a product, quantity, and expiry date before receiving stock.', 'error');
      return;
    }

    setBusyForm('receive');
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
    } finally {
      setBusyForm(null);
    }
  };

  const writeOffBatchChoices = batches.filter(
    (batch) =>
      batch.product_id === Number(writeOffForm.product_id) &&
      batch.status === 'active' &&
      batch.quantity_remaining > 0
  );

  // ── Dropdown choices ──────────────────────────────────────────────────
  // Products, with their picture, SKU and how many are in stock.
  const productOptions: RichSelectOption[] = products.map((product) => ({
    value: String(product.id),
    label: product.name,
    description: `SKU ${product.sku} · ${inventoryMap[product.id]?.available_quantity ?? product.stock_quantity} in stock`,
    image: product.image_url,
  }));

  // Batches that can be written off, soonest expiry first, each showing its
  // expiry date. Amber = expires within the near-expiry window, red = already past.
  const writeOffBatchOptions: RichSelectOption[] = [...writeOffBatchChoices]
    .sort((a, b) => (a.expiry_date ?? '9999').localeCompare(b.expiry_date ?? '9999'))
    .map((batch) => {
      const days = batch.expiry_date ? daysUntilExpiry(batch.expiry_date) : null;
      return {
        value: String(batch.id),
        label: `${batch.batch_code} — ${batch.quantity_remaining} remaining`,
        description: (
          <span
            className={cn(
              days !== null && days <= 0 && 'font-medium text-danger-strong',
              days !== null && days > 0 && days <= NEAR_EXPIRY_DAYS && 'font-medium text-warning-strong'
            )}
          >
            {batch.expiry_date ? `Expires ${describeExpiry(batch.expiry_date)}` : 'No expiry date'}
          </span>
        ),
      };
    });

  const selectedWriteOffBatch = writeOffBatchChoices.find((batch) => batch.id === Number(writeOffForm.batch_id)) ?? null;

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
      danger: true,
    });
    if (!confirmed) return;

    setBusyForm('writeoff');
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
    } finally {
      setBusyForm(null);
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
      description: product.description ?? '',
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

      const description = (editForm.description ?? '').trim();
      // Send the description if there is one now, or if there was one before
      // (so it can be cleared). Otherwise leave it out, same reason as above.
      const descriptionChange =
        description || editingProduct.description ? { description: description || null } : {};
      const { description: _typedDescription, ...otherFields } = editForm;

      await onUpdateProduct(editingProduct.id, {
        ...otherFields,
        category: matchCategory(editForm.category, knownCategories),
        image_url: newImageUrl,
        ...descriptionChange,
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

  // ── Table rows ────────────────────────────────────────────────────────
  // Work out each product's stock numbers and warnings once, then use them
  // for the filter counts, the filtering itself, and the table.
  const rows = products.map((p) => {
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
    return { product: p, summary, isOutOfStock, isLow, isExpiring };
  });

  const matchesStatus = (row: (typeof rows)[number], filter: StatusFilter) =>
    filter === 'all' ||
    (filter === 'low' && row.isLow) ||
    (filter === 'out' && row.isOutOfStock) ||
    (filter === 'expiring' && row.isExpiring);

  const searchText = query.toLowerCase().trim();
  const matchesSearch = (product: Product) =>
    !searchText ||
    [product.name, product.sku, product.barcode, product.category].some((field) =>
      (field || '').toLowerCase().includes(searchText)
    );

  const visibleRows = rows.filter((row) => matchesStatus(row, statusFilter) && matchesSearch(row.product));

  const clearFilters = () => {
    setQuery('');
    setStatusFilter('all');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catalog & Stock Control"
        actions={
          <>
            {!readOnly && (
              <Button onClick={handleProcessExpired} disabled={processingExpired}>
                <Clock aria-hidden="true" />
                {processingExpired ? 'Processing…' : 'Process expired stock'}
              </Button>
            )}
            {onRefresh && (
              <Button variant="outline" onClick={onRefresh}>
                <RefreshCw aria-hidden="true" />
                Refresh
              </Button>
            )}
          </>
        }
      />

      {readOnly && (
        <p className="flex items-center gap-2 rounded-md border border-sun bg-sun/25 p-3 text-sm text-brand-ink">
          <Info className="size-4 shrink-0" aria-hidden="true" />
          View only. Adding products and restocking are done by an admin.
        </p>
      )}

      {!readOnly && (
        <div className="space-y-6">
          {/* ── Edit product (only while editing) ── */}
          {editingProduct && editForm && (
            <form
              ref={editFormRef}
              className="scroll-mt-24 space-y-4 rounded-lg border border-brand/40 bg-white p-5 shadow-xs ring-4 ring-brand/5"
              onSubmit={handleUpdateProduct}
              autoComplete="off"
            >
              <h3 className={formTitleClass}>Edit {editingProduct.name}</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="SKU" htmlFor="edit-sku">
                  <Input
                    id="edit-sku"
                    value={editForm.sku}
                    onChange={(e) => setEditForm({ ...editForm, sku: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Product name" htmlFor="edit-name">
                  <Input
                    id="edit-name"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    required
                  />
                </Field>
                <CategoryInput
                  id="edit-category"
                  label="Category"
                  value={editForm.category}
                  onValueChange={(category) => setEditForm({ ...editForm, category })}
                  suggestions={knownCategories}
                  required
                />
                <Field label="Price (₱)" htmlFor="edit-price">
                  <Input
                    id="edit-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm.price}
                    onChange={(e) => setEditForm({ ...editForm, price: Number(e.target.value) })}
                    required
                  />
                </Field>
                <Field label="Cost (₱)" htmlFor="edit-cost">
                  <Input
                    id="edit-cost"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm.cost}
                    onChange={(e) => setEditForm({ ...editForm, cost: Number(e.target.value) })}
                    required
                  />
                </Field>
                <Field label="Reorder level" htmlFor="edit-reorder" hint="Warn when stock drops to this number.">
                  <Input
                    id="edit-reorder"
                    type="number"
                    min="0"
                    step="1"
                    value={editForm.reorder_level}
                    onChange={(e) => setEditForm({ ...editForm, reorder_level: Number(e.target.value) })}
                    required
                  />
                </Field>
              </div>

              <Field
                label="Description (optional)"
                htmlFor="edit-description"
                hint="Shown under the product on the POS menu."
              >
                <Textarea
                  id="edit-description"
                  maxLength={300}
                  rows={2}
                  placeholder="e.g. Fresh full-cream milk, 1 litre"
                  value={editForm.description ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                />
              </Field>

              <Field label="New image" htmlFor="edit-image" hint="Leave empty to keep the current picture.">
                <input
                  id="edit-image"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setEditImageFile(e.target.files?.[0] || null)}
                  className={fileInputClass}
                />
              </Field>

              <div className="flex items-center gap-2 pt-1">
                <Button type="submit" disabled={savingEdit}>
                  {savingEdit ? 'Saving…' : 'Save changes'}
                </Button>
                <Button variant="outline" onClick={cancelEditing} disabled={savingEdit}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* ── Add new product ── */}
            <form className={formCardClass} onSubmit={handleSubmit} autoComplete="off">
              <div className="space-y-4">
                <h3 className={formTitleClass}>Add New Product</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Product name" htmlFor="add-name" className="col-span-2">
                    <Input id="add-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                  </Field>
                  <div className="col-span-2">
                    <CategoryInput
                      id="add-category"
                      label="Category"
                      value={form.category}
                      onValueChange={(category) => setForm({ ...form, category })}
                      suggestions={knownCategories}
                      required
                    />
                  </div>
                  <Field label="SKU" htmlFor="add-sku">
                    <Input id="add-sku" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required />
                  </Field>
                  <Field label="Price (₱)" htmlFor="add-price">
                    <Input
                      id="add-price"
                      type="number"
                      step="0.01"
                      value={form.price}
                      onChange={(e) => setForm({ ...form, price: e.target.value })}
                      required
                    />
                  </Field>
                  <Field label="Cost (₱)" htmlFor="add-cost">
                    <Input
                      id="add-cost"
                      type="number"
                      step="0.01"
                      value={form.cost}
                      onChange={(e) => setForm({ ...form, cost: e.target.value })}
                      required
                    />
                  </Field>
                  <Field label="Starting stock" htmlFor="add-stock">
                    <Input
                      id="add-stock"
                      type="number"
                      value={form.stock_quantity}
                      onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                      required
                    />
                  </Field>
                  <Field label="Reorder level" htmlFor="add-reorder">
                    <Input
                      id="add-reorder"
                      type="number"
                      value={form.reorder_level}
                      onChange={(e) => setForm({ ...form, reorder_level: e.target.value })}
                      required
                    />
                  </Field>
                  <Field
                    label="Description (optional)"
                    htmlFor="add-description"
                    hint="Shown under the product on the POS menu."
                    className="col-span-2"
                  >
                    <Textarea
                      id="add-description"
                      maxLength={300}
                      rows={2}
                      placeholder="e.g. Fresh full-cream milk, 1 litre"
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                    />
                  </Field>
                  <Field label="Product image" htmlFor="add-image" className="col-span-2">
                    <input
                      id="add-image"
                      type="file"
                      accept="image/*"
                      onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                      className={fileInputClass}
                    />
                  </Field>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={busyForm === 'add'}>
                {busyForm === 'add' ? 'Saving…' : 'Save Product'}
              </Button>
            </form>

            {/* ── Receive stock ── */}
            <form className={formCardClass} onSubmit={handleReceive} autoComplete="off">
              <div className="space-y-4">
                <h3 className={formTitleClass}>Receive Stock by Batch</h3>
                <div className="space-y-3">
                  <RichSelect
                    label="Product"
                    placeholder="Select product"
                    withImages
                    options={productOptions}
                    value={receiveForm.product_id}
                    onValueChange={(productId) => setReceiveForm({ ...receiveForm, product_id: productId })}
                    emptyMessage="No products yet."
                  />
                  <Field label="Batch quantity" htmlFor="receive-quantity">
                    <Input
                      id="receive-quantity"
                      type="number"
                      min="1"
                      value={receiveForm.quantity}
                      onChange={(e) => setReceiveForm({ ...receiveForm, quantity: e.target.value })}
                      required
                    />
                  </Field>
                  <Field label="Expiry date" htmlFor="receive-expiry">
                    <Input
                      id="receive-expiry"
                      type="date"
                      value={receiveForm.expiry_date}
                      onChange={(e) => setReceiveForm({ ...receiveForm, expiry_date: e.target.value })}
                      required
                    />
                  </Field>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={busyForm === 'receive'}>
                {busyForm === 'receive' ? 'Saving…' : 'Receive Stock'}
              </Button>
            </form>

            {/* ── Write off damaged / spoiled stock ── */}
            <form className={formCardClass} onSubmit={handleWriteOff} autoComplete="off">
              <div className="space-y-4">
                <h3 className={formTitleClass}>Write Off Damaged / Spoiled Stock</h3>
                <div className="space-y-3">
                  <RichSelect
                    label="Product"
                    placeholder="Select product"
                    withImages
                    options={productOptions}
                    value={writeOffForm.product_id}
                    // Changing the product clears the batch, since batches belong to one product.
                    onValueChange={(productId) => setWriteOffForm({ ...writeOffForm, product_id: productId, batch_id: '' })}
                    emptyMessage="No products yet."
                  />

                  <RichSelect
                    label="Batch"
                    placeholder={writeOffForm.product_id ? 'Select active batch' : 'Pick a product first'}
                    options={writeOffBatchOptions}
                    value={writeOffForm.batch_id}
                    onValueChange={(batchId) => setWriteOffForm({ ...writeOffForm, batch_id: batchId })}
                    disabled={!writeOffForm.product_id}
                    emptyMessage="This product has no active batches."
                    // Once a batch is picked, its expiry stays visible under the box.
                    hint={selectedWriteOffBatch && `Expiry: ${describeExpiry(selectedWriteOffBatch.expiry_date)}`}
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Quantity" htmlFor="writeoff-quantity">
                      <Input
                        id="writeoff-quantity"
                        type="number"
                        min="1"
                        max={
                          writeOffBatchChoices.find((batch) => batch.id === Number(writeOffForm.batch_id))
                            ?.quantity_remaining
                        }
                        step="1"
                        value={writeOffForm.quantity}
                        onChange={(e) => setWriteOffForm({ ...writeOffForm, quantity: e.target.value })}
                        required
                      />
                    </Field>
                    <RichSelect
                      label="Type"
                      placeholder="Choose type"
                      value={writeOffForm.kind}
                      onValueChange={(kind) =>
                        setWriteOffForm({ ...writeOffForm, kind: (kind || 'damaged') as WriteOffStockInput['kind'] })
                      }
                      options={[
                        { value: 'damaged', label: 'Damaged', description: 'Broken, dented, torn…' },
                        { value: 'spoiled', label: 'Spoiled', description: 'Gone bad before its date' },
                      ]}
                    />
                  </div>

                  <Field label="Reason" htmlFor="writeoff-reason">
                    <Input
                      id="writeoff-reason"
                      placeholder="e.g. Dropped during unloading"
                      value={writeOffForm.reason}
                      onChange={(e) => setWriteOffForm({ ...writeOffForm, reason: e.target.value })}
                      required
                    />
                  </Field>
                </div>
              </div>
              {/* Red, because this permanently removes stock. */}
              <Button type="submit" variant="destructive" className="w-full" disabled={busyForm === 'writeoff'}>
                {busyForm === 'writeoff' ? 'Saving…' : 'Write Off Stock'}
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* ── Search + filters ── */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative md:w-80">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-subtle"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Search products"
            placeholder="Search name, SKU, barcode or category…"
            className="pl-10"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* Each button shows how many products are in that group, so problems
            (low stock, expiring) are visible at a glance. */}
        {/* A segmented switch: the chosen filter is the white raised one. */}
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-subtle p-1" role="group" aria-label="Filter by stock status">
          {STATUS_FILTERS.map((filter) => {
            const count = rows.filter((row) => matchesStatus(row, filter.id)).length;
            const isActive = statusFilter === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => setStatusFilter(filter.id)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors',
                  isActive ? 'bg-brand text-white shadow-xs' : 'text-ink-muted hover:text-ink'
                )}
              >
                {filter.label}
                {/* How many products are in this group, as plain text */}
                <span className={cn('tabular-nums', isActive ? 'text-white/80' : 'text-ink-subtle')}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Product table ── */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-ink">
            <thead className="border-b border-gray-200 bg-subtle font-semibold text-ink-muted">
              <tr>
                <th className="px-4 py-3">SKU / Barcode</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3">Stock Level</th>
                <th className="px-4 py-3">Expiry</th>
                <th className="px-4 py-3">Status</th>
                {!readOnly && (
                  <th className="px-4 py-3 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={readOnly ? 7 : 8} className="px-4 py-10 text-center text-sm text-ink-muted">
                    {products.length === 0 ? (
                      'No products yet.'
                    ) : (
                      <span className="inline-flex flex-wrap items-center justify-center gap-2">
                        No products match your search or filter.
                        <Button variant="link" size="sm" className="h-auto px-0" onClick={clearFilters}>
                          Clear filters
                        </Button>
                      </span>
                    )}
                  </td>
                </tr>
              )}

              {visibleRows.map(({ product: p, summary, isOutOfStock, isLow, isExpiring }) => {
                // All batches of this product, soonest expiry first (no date last).
                const productBatches = batches
                  .filter((batch) => batch.product_id === p.id)
                  .sort((a, b) => (a.expiry_date ?? '9999').localeCompare(b.expiry_date ?? '9999'));
                const batchesOpen = openBatchRows.has(p.id);

                return (
                  // Fragment: each product is its row plus (when opened) a batch details row under it.
                  <Fragment key={p.id}>
                    <tr
                      className={cn(
                        'transition-colors',
                        isOutOfStock
                          ? 'bg-danger/5 hover:bg-danger/10'
                          : isLow || isExpiring
                            ? 'bg-warning/10 hover:bg-warning/15'
                            : 'hover:bg-subtle/60',
                        batchesOpen && '[&>td]:border-b-0'
                      )}
                    >
                      <td className="space-y-1 px-4 py-3 font-mono text-[11px] text-ink-muted">
                        <div>{p.sku}</div>
                        <BarcodeImage value={p.barcode} height={30} barWidth={1} fontSize={11} />
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-subtle">
                            {p.image_url ? (
                              <img src={p.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                            ) : (
                              <ImageIcon className="size-4 text-ink-subtle" aria-hidden="true" />
                            )}
                          </div>
                          <span className="text-sm font-semibold text-ink">{p.name}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-ink-muted">{p.category}</td>
                      <td className="px-4 py-3 text-right text-sm font-medium tabular-nums">₱{p.price.toFixed(2)}</td>
                      <td className="space-y-1 px-4 py-3">
                        <div className="text-sm font-bold tabular-nums">{summary.available_quantity}</div>
                        <BatchBreakdown batches={sellableBatches(productBatches)} />
                      </td>
                      <td className="space-y-1.5 px-4 py-3">
                        <div>{formatExpiry(summary.earliest_expiry_date)}</div>
                        {summary.near_expiry_count > 0 && (
                          <div className="text-[11px] font-semibold text-warning-strong">
                            {summary.near_expiry_count} of {summary.available_quantity} stocks nearing expiry
                            {` · ${NEAR_EXPIRY_PERCENT_OFF}% off at checkout`}
                          </div>
                        )}
                        {/* Opens the batch table under this row. */}
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-sm text-xs font-semibold text-brand-strong hover:underline disabled:text-ink-muted disabled:no-underline"
                          onClick={() => toggleBatchRow(p.id)}
                          aria-expanded={batchesOpen}
                          aria-controls={`batches-${p.id}`}
                          disabled={productBatches.length === 0}
                        >
                          <ChevronDown
                            className={cn('size-3.5 transition-transform', batchesOpen && 'rotate-180')}
                            aria-hidden="true"
                          />
                          {productBatches.length === 0
                            ? 'No batches'
                            : `${batchesOpen ? 'Hide' : 'Show'} ${productBatches.length} batch${productBatches.length === 1 ? '' : 'es'}`}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        {/* Plain coloured words with a small icon (no box around them). */}
                        <div className="flex flex-col gap-1">
                          {isOutOfStock && (
                            <StatusText tone="danger" icon={<PackageX />}>
                              No stock
                            </StatusText>
                          )}
                          {isLow && (
                            <StatusText tone="warning" icon={<AlertTriangle />}>
                              Low stock
                            </StatusText>
                          )}
                          {isExpiring && (
                            <StatusText tone="warning" icon={<Clock />}>
                              Expires soon
                            </StatusText>
                          )}
                          {!isOutOfStock && !isLow && !isExpiring && (
                            <StatusText tone="success" icon={<Check />}>
                              OK
                            </StatusText>
                          )}
                        </div>
                      </td>
                      {!readOnly && (
                        <td className="px-4 py-3 text-right">
                          <Button variant="outline" size="sm" onClick={() => startEditing(p)} aria-label={`Edit ${p.name}`}>
                            <Pencil aria-hidden="true" />
                            Edit
                          </Button>
                        </td>
                      )}
                    </tr>

                    {/* ── Batch details (only while opened) ── */}
                    {batchesOpen && (
                      <tr id={`batches-${p.id}`}>
                        <td colSpan={readOnly ? 7 : 8} className="bg-subtle/60 px-4 pt-1 pb-4">
                          <BatchTable batches={productBatches} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
