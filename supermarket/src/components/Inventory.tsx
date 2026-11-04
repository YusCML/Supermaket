// ════════════════════════════════════════════════════════════════════════════
// Inventory.tsx: the "Catalog & Stock Control" screen.
//
// Who sees it:
//   Admin    AdminPage, "Inventory" tab. Sees everything: four forms (Add a
//            product, Edit a product, Receive stock, Write off stock), the
//            "Process expired stock" button, and the product table.
//   Cashier  CashierPage, "Stock Levels" tab. The same table, read-only:
//            CashierPage passes `readOnly`, which hides the forms, the
//            "Process expired stock" button and the Edit column.
//
// Where the data comes from: nothing is loaded here. The page passes three
// lists in as "props" (the inputs a parent component gives a child, like
// function arguments). useStoreData() loads them through lib/api.ts:
//   products   every product row (api.getProducts -> the `products` table)
//   inventory  stock numbers per product, worked out by the database function
//              get_product_inventory() (newest version in
//              supabase/migrations/20261101150000_fix_inventory_access_and_counts.sql):
//              units that can still be sold, units expiring within 7 days,
//              the soonest expiry date, and so on
//   batches    every delivery of every product (api.getProductBatches -> the
//              `product_batches` table)
//
// Saving: each form calls one of the on...() functions it was given. AdminPage
// turns each into one api.ts call and then reloads all the data, so the table
// shows the change straight away. The database checks everything again
// (admins only, sensible numbers), so these forms are the friendly first
// check, not the only one.
//
// Stock is tracked per BATCH: one delivery with its own code (e.g. "B-12")
// and expiry date. A product's stock is what's left in its batches that
// haven't expired. That's why the Edit form has no stock box: stock only
// changes by receiving a batch, selling, writing off, or expiring.
// ════════════════════════════════════════════════════════════════════════════
import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, Check, ChevronDown, Clock, ImageIcon, Info, PackageX, Pencil, RefreshCw, Search } from 'lucide-react';
import type { NewProductInput, Product, ProductBatch, ProductInventorySummary, ReceiveStockInput, UpdateProductInput, WriteOffStockInput } from '../types/app';
import { api } from '../lib/api';
import { useNotify } from '../contexts/NotifyContext';
import { daysUntilExpiry, describeExpiry, formatExpiry, isNearExpiry, sellableBatches, todayInManila } from '../lib/expiry';
import { NEAR_EXPIRY_DAYS, NEAR_EXPIRY_PERCENT_OFF } from '../lib/pricing';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Input, Textarea } from './ui/input';
import { Field, invalidProps } from './ui/field';
import { RichSelect, type RichSelectOption } from './ui/rich-select';
import { StatusText, type StatusTone } from './ui/status-text';
import { CategoryInput } from './ui/category-input';
import { DatePicker, type DatePreset } from './ui/date-picker';
import { ImagePicker } from './ui/image-picker';
import { categorySuggestions, matchCategory } from '../lib/categories';
import {
  editProductSchema,
  fieldErrors,
  imageFileSchema,
  newProductSchema,
  receiveStockSchema,
  writeOffSchema,
} from '../lib/validation';
import PageHeader from './PageHeader';
import BatchBreakdown from './BatchBreakdown';
import BarcodeImage from './BarcodeImage';

// The props this component accepts. In TypeScript an `interface` describes
// the shape of an object; `?` means the prop may be left out. The functions
// that change data (onAddProduct … onProcessExpired) are only given by
// AdminPage; the cashier view only gets onRefresh. They return a Promise (a
// value that arrives later), so the forms can `await` them and show "Saving…"
// until the database answers.
interface InventoryProps {
  products: Product[];
  inventory: ProductInventorySummary[];
  batches: ProductBatch[];
  // true = cashier view: table only, nothing can be changed.
  readOnly?: boolean;
  // Add form. Resolves to the saved product (with its new barcode).
  onAddProduct?: (product: NewProductInput) => Promise<Product>;
  // Edit form.
  onUpdateProduct?: (productId: number, product: UpdateProductInput) => Promise<void>;
  // Receive form. Resolves to the new batch's code, e.g. "B-12".
  onReceiveStock?: (input: ReceiveStockInput) => Promise<string>;
  // Write-off form.
  onWriteOffStock?: (input: WriteOffStockInput) => Promise<void>;
  // "Process expired stock" button.
  onProcessExpired?: () => Promise<void>;
  // "Refresh" button: load everything again.
  onRefresh?: () => void;
}

// ── Blank forms ────────────────────────────────────────────────────────────
// What each form holds when it's empty, and what it goes back to after a
// successful save. Every value is TEXT, even prices and quantities, because
// that's what a text box gives us; the zod rules in lib/validation.ts turn
// them into real numbers when the form is submitted.
//
// Add New Product.
const emptyForm = {
  sku: '',
  name: '',
  brand: '',
  category: '',
  price: '',
  cost: '',
  stock_quantity: '',
  // Expiry date of the starting stock ('YYYY-MM-DD'); needed when stock > 0.
  expiry_date: '',
  reorder_level: '',
  description: '',
};

// Receive Stock by Batch. (product_id is text too: dropdown values are text.)
const emptyReceive = {
  product_id: '',
  quantity: '',
  expiry_date: '',
};

// Write Off. `kind` starts as 'damaged'. `as WriteOffStockInput['kind']` tells
// TypeScript this is the 'damaged' | 'spoiled' type, not just any text.
const emptyWriteOff = {
  product_id: '',
  batch_id: '',
  quantity: '',
  kind: 'damaged' as WriteOffStockInput['kind'],
  reason: '',
};

// The filter buttons above the table.
// StatusFilter is a "union type": only these four words are allowed.
// What each one keeps is decided by matchesStatus() further down.
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

// Quick picks under the expiry-date calendar, counted from today: most
// deliveries are dated a week to a year ahead.
const EXPIRY_PRESETS: DatePreset[] = [
  { label: 'In 1 week', days: 7 },
  { label: 'In 1 month', months: 1 },
  { label: 'In 3 months', months: 3 },
  { label: 'In 6 months', months: 6 },
  { label: 'In 1 year', months: 12 },
];

// What "Reorder level" means, shown under that box in the Add and Edit forms.
const REORDER_HINT = 'When units in stock drop to this number or fewer, the product is marked Low stock, so you know to reorder.';

// What state a batch is in, in words, e.g. "Active", "15% off", "Expired".
// Used in the batch table under each product. `tone` is the colour
// (see ui/status-text.tsx). The database keeps a status on every batch:
//   'expired'  expiry processing removed what was left (it now has 0)
//   'spoiled'  a write-off took its last unit (damaged OR spoiled; the
//              database uses 'spoiled' for both), so it reads "Written off"
//   'manual'   allowed by the database, but none of the migrations set it
//   'active'   still in use; the checks after that say how it's doing
// "Past expiry" = the expiry date is today or earlier (stock that expires
// today already counts as expired) but expiry processing hasn't removed it
// yet. It can't be sold even though its status is still 'active'.
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

// A date-and-time from the database written as "Oct 5, 2026" (or "—" when
// there's none). Used for the day a batch was received.
const shortDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

// The table that opens under a product row: one line per batch, with a bar
// showing how much of the delivery is left.
// It gets ALL of the product's batches (sold out, expired and written off
// ones too), so the admin can see the full history of deliveries.
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
            // How much of the delivery is left, 0–100, for the bar's width.
            // (The check avoids dividing by zero.)
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

// The Edit form's values: the product's details, with the three number boxes
// kept as typed text (see editForm below).
type EditFormValues = Omit<UpdateProductInput, 'price' | 'cost' | 'reorder_level'> & {
  price: string;
  cost: string;
  reorder_level: string;
};

// ── The screen ─────────────────────────────────────────────────────────────
// `readOnly = false` is a default value: if the page doesn't pass readOnly,
// it's treated as false (the full admin version).
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
  // useState makes the component remember a value between redraws. It gives
  // back [current value, function to change it]; changing it redraws the
  // screen. Every typed letter goes into one of these, so React always knows
  // what is in each box ("controlled" inputs).
  //
  // What's typed in the Add New Product form.
  const [form, setForm] = useState(emptyForm);
  // The picture chosen in the Add form (a File from the computer), if any.
  // Kept apart from `form` because a file isn't text.
  const [imageFile, setImageFile] = useState<File | null>(null);

  // What's chosen/typed in the Receive Stock form.
  const [receiveForm, setReceiveForm] = useState(emptyReceive);
  // What's chosen/typed in the Write Off form.
  const [writeOffForm, setWriteOffForm] = useState(emptyWriteOff);

  // The product whose Edit button was pressed (null = not editing). While it
  // is set, the Edit form appears at the top of the page.
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  // The Edit form's boxes. It starts as a copy of that product's details.
  // Price, cost and reorder level are kept as the TEXT that's typed (like the
  // other forms), so an emptied box stays empty and the rules in
  // lib/validation.ts can say "Enter the price" instead of silently saving 0.
  const [editForm, setEditForm] = useState<EditFormValues | null>(null);
  // A new picture chosen in the Edit form (null = keep the current one).
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  // True when "Remove" was pressed on the product's CURRENT picture in the
  // Edit form: saving then clears the picture (unless a new one is chosen).
  const [editRemoveImage, setEditRemoveImage] = useState(false);

  // True while the Edit form is saving, to disable its buttons.
  const [savingEdit, setSavingEdit] = useState(false);
  // useRef gives a handle to the real <form> element on the page (it's
  // filled in by `ref={editFormRef}` on the form), without causing redraws.
  const editFormRef = useRef<HTMLFormElement>(null);
  // useEffect runs code AFTER React has drawn the screen, and again whenever
  // something in its [list] changes. Here: when Edit is pressed on a product,
  // smoothly scroll up to the Edit form, since the button may be far down the
  // table. (It runs after drawing because the form must exist first.)
  useEffect(() => {
    if (editingProduct) editFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [editingProduct]);
  // True while "Process expired stock" is running, so it can't be pressed twice.
  const [processingExpired, setProcessingExpired] = useState(false);
  // notify() shows a short pop-up message; askToConfirm() opens an
  // "Are you sure?" box and gives back true or false (NotifyContext.tsx).
  const { notify, askToConfirm } = useNotify();

  // Which of the three forms is currently saving. While it is, its button is
  // disabled, so a double-click can't add the same product twice.
  const [busyForm, setBusyForm] = useState<'add' | 'receive' | 'writeoff' | null>(null);

  // Messages to show under the form boxes, one object per form, e.g.
  // { price: 'Price must be more than ₱0' }. Filled when a form is submitted
  // with mistakes (see lib/validation.ts), emptied once it passes.
  // `Record<string, string>` = an object with text keys and text values.
  // Each box reads its own message, e.g. <Field error={addErrors.price}>.
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [receiveErrors, setReceiveErrors] = useState<Record<string, string>>({});
  const [writeOffErrors, setWriteOffErrors] = useState<Record<string, string>>({});

  // Search box and status filter for the table.
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Which products have their batch table opened (several can be open at once).
  // A Set is a collection with no duplicates and a quick `.has(x)` check;
  // here it holds the ids of the opened products.
  const [openBatchRows, setOpenBatchRows] = useState<Set<number>>(new Set());
  // Opens or closes one product's batch table. It builds a NEW Set from the
  // old one instead of changing the old one, because React only notices a
  // change (and redraws) when the state becomes a different object.
  const toggleBatchRow = (productId: number) => {
    setOpenBatchRows((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  // The stock numbers from get_product_inventory(), as a lookup by product
  // id: inventoryMap[5] is product 5's summary. (Object.fromEntries turns a
  // list of [key, value] pairs into an object.)
  // useMemo remembers a calculated value and only works it out again when
  // something in its [list] changes (here: when `inventory` is reloaded),
  // instead of on every redraw (every key press in a form).
  const inventoryMap = useMemo(
    () => Object.fromEntries(inventory.map((item) => [item.id, item])),
    [inventory]
  );

  // Categories to suggest in the Category box: the starter ones plus every
  // category a product already uses (so new ones appear right after saving).
  const knownCategories = useMemo(() => categorySuggestions(products), [products]);
  // ── Duplicate checks for the Add and Edit forms (live, while typing) ──
  // Two texts are "the same" ignoring capitals and spaces around them.
  const sameText = (a: string | null | undefined, b: string | null | undefined) =>
    (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
  // How a product is named in the warnings: "Bear Brand Fortified … (SKU …)".
  const productLabel = (p: Product) => `${p.brand ? `${p.brand} ` : ''}${p.name} (SKU ${p.sku})`;
  // The product (other than `exceptId`, the one being edited) that already
  // uses this SKU, if any. SKUs must be unique; the database refuses
  // duplicates too, this just says so before saving.
  const productWithSku = (sku: string, exceptId?: number) =>
    sku.trim() ? products.find((p) => p.id !== exceptId && sameText(p.sku, sku)) : undefined;
  // A product that looks like the SAME thing: same name and same brand.
  // Allowed (it could be a different size), but the form warns and asks first.
  const lookAlike = (name: string, brand: string) =>
    name.trim() && brand.trim() ? products.find((p) => sameText(p.name, name) && sameText(p.brand, brand)) : undefined;
  const addSkuTaken = productWithSku(form.sku);
  const addLookAlike = lookAlike(form.name, form.brand);
  const editSkuTaken = editingProduct && editForm ? productWithSku(editForm.sku, editingProduct.id) : undefined;

  // The earliest expiry date the calendars allow: tomorrow (Philippine time),
  // since stock that expires today already counts as expired.
  const tomorrow = new Date(Date.parse(`${todayInManila()}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

  // ── Saving the forms ─────────────────────────────────────────────────────
  // How validation works (the same in all four forms):
  //   1. Every box's text lives in that form's state object (`form`, …).
  //   2. On submit, `schema.safeParse(values)` checks it against the rules in
  //      lib/validation.ts. zod is a library for checking data. safeParse
  //      never throws an error: it returns either
  //        { success: true, data }   data = cleaned values (text trimmed,
  //                                  "12.50" turned into the number 12.5)
  //        { success: false, error } error.issues = every rule that failed
  //   3. fieldErrors(error) turns those issues into one message per box,
  //      e.g. { price: 'Price must be more than ₱0' }, and that object is
  //      saved in addErrors / editErrors / receiveErrors / writeOffErrors.
  //   4. Each box is wrapped in <Field error={…}> (ui/field.tsx), which shows
  //      the message in red under it. `invalidProps(id, error)` marks the box
  //      itself as invalid (red border) and links it to the message so
  //      screen readers read it out.
  //   5. Only if everything passes is anything sent to the database, which
  //      checks again.
  // The forms have `noValidate`, which turns off the browser's own pop-up
  // warnings so only these messages appear. Attributes like maxLength and
  // min still help: maxLength stops typing past the limit.
  //
  // Each handler gets a FormEvent. e.preventDefault() stops the browser's
  // normal form behaviour (reloading the page) so we can handle it ourselves.
  //
  // ADD NEW PRODUCT.
  // In the database: api.uploadProductImage() first puts the picture in
  // Supabase Storage (the "product-images" bucket, under a random file name)
  // and gives back its web address. Then AdminPage -> api.addProduct()
  // inserts one row into the `products` table (row-level security lets only
  // admins do that). Two database triggers (code that runs automatically when
  // a row is saved) then:
  //   - give the product a new in-store barcode (EAN-13 starting with "2");
  //     a barcode is never typed in (20261027160000_batch_choice_and_generated_codes.sql)
  //   (the product is saved with 0 in stock, so the old "INITIAL-<id>" batch
  //   with no expiry date is never made; the starting stock is received
  //   afterwards as a normal batch WITH its expiry date, see step 2 below)
  // A SKU that's already used is refused by the database; api.ts turns that
  // into "A product with that SKU already exists."
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!onAddProduct) return;

    // 1. Check what was typed (and the picture) against the rules.
    // The picture is only checked if one was chosen (JPG/PNG/WEBP/GIF, max
    // 5 MB). Its message goes under the picture box as `errors.image`.
    // newProductSchema is a function that BUILDS the rules: it's handed the
    // "is this date after today?" check (Philippine time, lib/expiry.ts) for
    // the starting stock's expiry date.
    const check = newProductSchema((date) => daysUntilExpiry(date) > 0).safeParse(form);
    const imageCheck = imageFile ? imageFileSchema.safeParse(imageFile) : null;
    if (!check.success || (imageCheck && !imageCheck.success)) {
      const errors = check.success ? {} : fieldErrors(check.error);
      if (imageCheck && !imageCheck.success) errors.image = imageCheck.error.issues[0].message;
      setAddErrors(errors);
      return;
    }
    // A SKU another product already uses: stop here with the same message
    // the warning under the box shows (the database would refuse it too).
    if (addSkuTaken) {
      setAddErrors({ sku: `Already used by ${productLabel(addSkuTaken)}` });
      return;
    }
    setAddErrors({});
    const values = check.data; // numbers are real numbers now, text is trimmed

    // Same name and brand as a product already in the catalogue: probably a
    // duplicate. Ask first (askToConfirm waits for the answer); more stock of
    // an existing product belongs in "Receive Stock" instead.
    if (addLookAlike) {
      const addAnyway = await askToConfirm({
        title: 'This product may already exist',
        message: `${productLabel(addLookAlike)} is already in the catalogue. To add more of it, use Receive Stock instead. Add "${values.brand} ${values.name}" as a separate product anyway?`,
        confirmLabel: 'Add anyway',
        cancelLabel: 'Go back',
      });
      if (!addAnyway) return;
    }

    // 2. Save it, in two steps:
    //    a) the product itself, with 0 in stock;
    //    b) if there's starting stock, receive it as a batch with its expiry
    //       date, through onReceiveStock (the same as the "Receive stock"
    //       form, so it gets a proper batch code and the same checks).
    // try / catch / finally: if anything inside `try` fails, `catch` shows
    // the error; `finally` runs either way, so the button always comes back.
    setBusyForm('add');
    try {
      const imageUrl = imageFile ? await api.uploadProductImage(imageFile) : null;
      const saved = await onAddProduct({
        sku: values.sku,
        name: values.name,
        brand: values.brand,
        // Re-use an existing category's spelling if it matches; otherwise
        // this creates a new category.
        category: matchCategory(values.category, knownCategories),
        price: values.price,
        cost: values.cost,
        // 0 here: the starting stock arrives in step b with its expiry date.
        stock_quantity: 0,
        reorder_level: values.reorder_level,
        image_url: imageUrl,
        // Only sent when filled in, so an empty description isn't saved as "".
        // (`...` spreads an object's fields in here; spreading {} adds nothing.)
        ...(values.description ? { description: values.description } : {}),
      });

      // Step b. If it fails, the product still exists (step a worked), so
      // the message says so and points to "Receive stock" to finish the job.
      let batchCode = '';
      if (values.stock_quantity > 0 && onReceiveStock) {
        try {
          batchCode = await onReceiveStock({
            product_id: saved.id,
            quantity: values.stock_quantity,
            expiry_date: values.expiry_date,
          });
        } catch (err) {
          setForm(emptyForm);
          setImageFile(null);
          notify(
            `${values.name} was added, but its starting stock wasn't saved (${err instanceof Error ? err.message : 'unknown error'}). Use Receive Stock to add it.`,
            'error'
          );
          return;
        }
      }

      // Saved: empty the form, and show the barcode the database made (and
      // the starting stock's batch code, if any).
      setForm(emptyForm);
      setImageFile(null);
      notify(
        `${values.name} was added to the catalog with barcode ${saved?.barcode ?? '(assigned)'}` +
          (batchCode ? `, starting stock in batch ${batchCode}.` : '.'),
        'success'
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save the product', 'error');
    } finally {
      setBusyForm(null);
    }
  };

  // RECEIVE STOCK BY BATCH: a delivery of one product arrives, with one
  // expiry date.
  // In the database: AdminPage -> api.receiveStock() calls the SQL function
  // receive_stock() (newest version in
  // 20261101150000_fix_inventory_access_and_counts.sql). It:
  //   - refuses anyone who isn't an admin, a quantity of 0 or less, and an
  //     expiry date of today or earlier (Philippine date)
  //   - locks the product row, so two deliveries saved at the same moment
  //     can't get mixed up
  //   - makes the next batch code (B-1, B-2, …); codes are never typed in
  //   - inserts a `product_batches` row (received = remaining = quantity)
  //   - adds the quantity to the product's stock_quantity
  //   - returns { success: true, batch_code }, shown in the success message.
  const handleReceive = async (e: FormEvent) => {
    e.preventDefault();
    if (!onReceiveStock) return;

    // The expiry date must be after today (in Philippine time).
    // receiveStockSchema is a function that BUILDS the rules: we hand it the
    // "is this date after today?" check from lib/expiry.ts, then safeParse.
    const check = receiveStockSchema((date) => daysUntilExpiry(date) > 0).safeParse(receiveForm);
    if (!check.success) {
      setReceiveErrors(fieldErrors(check.error));
      return;
    }
    setReceiveErrors({});

    setBusyForm('receive');
    try {
      // The dropdown gave the product id as text, so it's turned into a number.
      const batchCode = await onReceiveStock({
        product_id: Number(check.data.product_id),
        quantity: check.data.quantity,
        expiry_date: check.data.expiry_date,
      });
      setReceiveForm(emptyReceive);
      notify(batchCode ? `Stock received as batch ${batchCode}.` : 'Stock received.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not receive stock', 'error');
    } finally {
      setBusyForm(null);
    }
  };

  // The batches the Write Off form may pick from: those of the chosen
  // product that are still active and have units left. (Past-expiry batches
  // not yet processed are included; they show in red in the dropdown.)
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
  // `[...list]` copies the list first, because sort() reorders a list in place.
  // Dates are 'YYYY-MM-DD' text, which sorts in date order; a batch with no
  // date is treated as '9999' so it goes last. cn() (lib/utils) joins class
  // names and skips the ones whose condition is false.
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

  // The batch currently picked in the Write Off form (null if none), used to
  // show its expiry date under the Batch box.
  const selectedWriteOffBatch = writeOffBatchChoices.find((batch) => batch.id === Number(writeOffForm.batch_id)) ?? null;

  // WRITE OFF DAMAGED / SPOILED STOCK: remove units that can't be sold and
  // record the loss.
  // In the database: AdminPage -> api.writeOffStock() calls the SQL function
  // write_off_stock() (20261028100000_write_off_stock.sql). It:
  //   - refuses anyone who isn't an admin, a kind other than damaged/spoiled,
  //     and an empty reason
  //   - locks the product and then the batch, and checks the batch is still
  //     active and has enough units left
  //   - takes the units off the batch (if none are left, the batch's status
  //     becomes 'spoiled', shown as "Written off") and off the product's
  //     stock_quantity
  //   - adds a `spoilage_logs` row: how many, the cost price, the loss
  //     (quantity x cost), the kind and the reason. Analytics adds these rows
  //     up as the Spoiled / Damaged losses.
  const handleWriteOff = async (e: FormEvent) => {
    e.preventDefault();
    if (!onWriteOffStock) return;

    // You can't write off more than the chosen batch has left.
    // writeOffSchema builds its rules around that limit. If no batch is
    // picked yet, 100,000 is just a placeholder limit; the "Pick the batch"
    // message will show anyway.
    const batch = writeOffBatchChoices.find((item) => item.id === Number(writeOffForm.batch_id));
    const check = writeOffSchema(batch ? batch.quantity_remaining : 100_000).safeParse(writeOffForm);
    if (!check.success) {
      setWriteOffErrors(fieldErrors(check.error));
      return;
    }
    // A batch id was chosen but it's no longer in the list (e.g. the data was
    // reloaded and that batch sold out in the meantime).
    if (!batch) {
      setWriteOffErrors({ batch_id: 'That batch is no longer available. Pick another.' });
      return;
    }
    setWriteOffErrors({});
    // Take the cleaned values out of check.data ("destructuring").
    const { quantity, kind, reason } = check.data;

    // Writing off can't be undone, so ask first (a red "danger" question).
    const confirmed = await askToConfirm({
      title: 'Confirm stock write-off',
      message: `Write off ${quantity} unit${quantity === 1 ? '' : 's'} from ${batch.batch_code}? This will reduce stock and record the loss.`,
      confirmLabel: 'Write off stock',
      danger: true,
    });
    if (!confirmed) return;

    setBusyForm('writeoff');
    try {
      await onWriteOffStock({ batch_id: batch.id, quantity, kind, reason });
      notify(`${quantity} unit${quantity === 1 ? '' : 's'} written off from ${batch.batch_code}.`, 'success');
      setWriteOffForm(emptyWriteOff);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not write off stock.', 'error');
    } finally {
      setBusyForm(null);
    }
  };

  // The Edit button on a table row: open the Edit form filled with that
  // product's current details, with no new picture and no old messages.
  // (Stock isn't copied: the Edit form can't change stock.)
  const startEditing = (product: Product) => {
    setEditingProduct(product);
    setEditForm({
      sku: product.sku,
      name: product.name,
      // Products saved before brands existed have none: an empty box.
      brand: product.brand ?? '',
      category: product.category,
      price: String(product.price),
      // Only admins have a cost; an empty box makes the rules ask for one.
      cost: product.cost == null ? '' : String(product.cost),
      reorder_level: String(product.reorder_level),
      description: product.description ?? '',
    });
    setEditImageFile(null);
    setEditRemoveImage(false);
    setEditErrors({});
  };

  // Close the Edit form and forget everything in it (Cancel, or after saving).
  const cancelEditing = () => {
    setEditingProduct(null);
    setEditForm(null);
    setEditImageFile(null);
    setEditRemoveImage(false);
    setEditErrors({});
  };

  // EDIT PRODUCT.
  // In the database: AdminPage -> api.updateProduct() updates that product's
  // row in the `products` table (row-level security lets only admins edit
  // products). SKU, name and category are trimmed first. Stock is NOT
  // changed here. The barcode isn't sent either, and even if it were, a
  // database trigger keeps the old one so printed labels still scan. A SKU
  // another product already uses is refused ("A product with that SKU
  // already exists.").
  const handleUpdateProduct = async (e: FormEvent) => {
    e.preventDefault();
    // Stop if there's nothing to save, or a save is already running
    // (savingEdit), so a double-click can't save twice.
    if (!editingProduct || !editForm || !onUpdateProduct || savingEdit) return;

    // 1. Check the changes (and a new picture, if one was chosen).
    const check = editProductSchema.safeParse(editForm);
    const imageCheck = editImageFile ? imageFileSchema.safeParse(editImageFile) : null;
    if (!check.success || (imageCheck && !imageCheck.success)) {
      const errors = check.success ? {} : fieldErrors(check.error);
      if (imageCheck && !imageCheck.success) errors.image = imageCheck.error.issues[0].message;
      setEditErrors(errors);
      return;
    }
    // A SKU another product already uses (the same check as the warning
    // under the box; the database refuses it too).
    if (editSkuTaken) {
      setEditErrors({ sku: `Already used by ${productLabel(editSkuTaken)}` });
      return;
    }
    setEditErrors({});
    const values = check.data;

    // 2. Save it.
    setSavingEdit(true);
    try {
      // The picture: a newly chosen one is uploaded; "Remove" on the current
      // one saves no picture (null); otherwise the old address is kept.
      const newImageUrl = editImageFile
        ? await api.uploadProductImage(editImageFile)
        : editRemoveImage
          ? null
          : editingProduct.image_url;

      // Send the description if there is one now, or if there was one before
      // (so it can be cleared). Otherwise leave it out.
       const descriptionChange =
        values.description || editingProduct.description ? { description: values.description ?? null } : {};

      await onUpdateProduct(editingProduct.id, {
        sku: values.sku,
        name: values.name,
        brand: values.brand,
        category: matchCategory(values.category, knownCategories),
        price: values.price,
        cost: values.cost,
        reorder_level: values.reorder_level,
        image_url: newImageUrl,
        ...descriptionChange,
      });

      notify(`${values.name} was updated.`, 'success');
      cancelEditing();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update the product.', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  // "PROCESS EXPIRED STOCK" button.
  // In the database: AdminPage -> api.processExpiredBatches() calls the SQL
  // function process_expired_batches() (admins only), which runs
  // _process_expired_batches() (newest version in 20261026120500_fefo_checkout.sql):
  //   - every active batch with units left whose expiry date is today or
  //     earlier (Philippine date) becomes 'expired' with 0 left
  //   - each one gets a `spoilage_logs` row (kind 'expired') with its loss at
  //     cost; Analytics shows these as the Expired losses
  //   - every product's stock_quantity is reset to the units in its batches
  //     that can still be sold
  // The same job also runs by itself every night shortly after midnight
  // (a pg_cron schedule), and AdminPage runs it each time the Inventory tab
  // is opened, so pressing the button is rarely needed.
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
  //
  // How the status words are decided. They come from the product's summary
  // made by get_product_inventory() in the database:
  //   available_quantity  units in active batches with no expiry date or an
  //                       expiry date AFTER today (Philippine date). Expired
  //                       units that haven't been processed yet don't count.
  //   near_expiry_count   units expiring within the next 7 days (these sell
  //                       at 15% off at checkout)
  //   expires_soon        true if any batch with units left expires within 7 days
  // Then:
  //   "No stock"     (red)    available_quantity is 0
  //   "Low stock"    (amber)  not 0, but at or below the product's reorder level
  //   "Expires soon" (amber)  some units expire within 7 days
  //   "OK"           (green)  none of the above
  // "Low stock" and "Expires soon" can both show on the same product.
  const rows = products.map((p) => {
    // If the database sent no summary for this product (e.g. the stock
    // numbers failed to load), fall back to the product's own stock count
    // and assume nothing is expiring.
    const summary = inventoryMap[p.id] ?? {
      available_quantity: p.stock_quantity,
      expired_quantity: 0,
      near_expiry_count: 0,
      earliest_expiry_date: null,
      expires_soon: false,
      has_expired_batches: false,
    };
    // The three flags behind the status words (see the list above).
    const isOutOfStock = summary.available_quantity === 0;
    const isLow = !isOutOfStock && summary.available_quantity <= p.reorder_level;
    const isExpiring = summary.near_expiry_count > 0 || summary.expires_soon;
    return { product: p, summary, isOutOfStock, isLow, isExpiring };
  });

  // ── Search + filter ───────────────────────────────────────────────────
  // Does this row belong in the chosen filter group? Uses the same flags
  // as the status words. `(typeof rows)[number]` means "the type of one item
  // of `rows`", so we don't have to write that type out by hand.
  const matchesStatus = (row: (typeof rows)[number], filter: StatusFilter) =>
    filter === 'all' ||
    (filter === 'low' && row.isLow) ||
    (filter === 'out' && row.isOutOfStock) ||
    (filter === 'expiring' && row.isExpiring);

  // Does the product's name, brand, SKU, barcode or category contain the
  // search text? Both sides are lower-cased so capitals don't matter. An
  // empty search box matches everything.
  const searchText = query.toLowerCase().trim();
  const matchesSearch = (product: Product) =>
    !searchText ||
    [product.name, product.brand, product.sku, product.barcode, product.category].some((field) =>
      (field || '').toLowerCase().includes(searchText)
    );

  // The rows the table shows: they must pass BOTH the filter and the search.
  // Nothing is fetched again; it's all worked out from the lists already here.
  const visibleRows = rows.filter((row) => matchesStatus(row, statusFilter) && matchesSearch(row.product));

  // The "Clear filters" link shown when nothing matches.
  const clearFilters = () => {
    setQuery('');
    setStatusFilter('all');
  };

  return (
    <div className="space-y-6">
      {/* ── Title + buttons ──
          <> … </> is a Fragment: it groups the two buttons without adding an
          extra element. `condition && (...)` shows the part only when the
          condition is true: "Process expired stock" for admins only, Refresh
          only when a refresh function was given. */}
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
              <Button variant="outline" onClick={() => onRefresh?.()}>
                <RefreshCw aria-hidden="true" />
                Refresh
              </Button>
            )}
          </>
        }
      />

      {/* Cashier view only: explain why there are no forms. */}
      {readOnly && (
        <p className="flex items-center gap-2 rounded-md border border-sun bg-sun/25 p-3 text-sm text-brand-ink">
          <Info className="size-4 shrink-0" aria-hidden="true" />
          View only. Adding products and restocking are done by an admin.
        </p>
      )}

      {/* ── The forms (admin only) ── */}
      {!readOnly && (
        <div className="space-y-6">
          {/* ── Edit product (only while editing) ── */}
          {/* Appears at the top when an Edit button in the table is pressed.
              ref={editFormRef} connects this <form> to editFormRef, so the
              useEffect above can scroll to it. scroll-mt-24 leaves a gap above
              it when scrolled to. noValidate: our own messages instead of the
              browser's (see "How validation works" above).
              Every box follows the same pattern: `value` shows what's in
              editForm, and onChange saves a copy of editForm with that one
              field replaced ({ ...editForm, sku: newText }). Number boxes use
              Number(...) because the Edit form keeps real numbers. */}
          {editingProduct && editForm && (
            <form
              ref={editFormRef}
              className="scroll-mt-24 space-y-4 rounded-lg border border-brand/40 bg-white p-5 shadow-xs ring-4 ring-brand/5"
              onSubmit={handleUpdateProduct}
              autoComplete="off"
              noValidate
            >
              <h3 className={formTitleClass}>Edit {editingProduct.name}</h3>
              {/* <Field> = label + box + the red error message (or grey hint)
                  under it. `error={editErrors.sku}` is undefined when there's
                  no problem, so no message shows. */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {/* The SKU's message shows while typing when ANOTHER product
                    already uses it (editSkuTaken). */}
                <Field label="SKU" htmlFor="edit-sku"
                    error={editErrors.sku ?? (editSkuTaken ? `Already used by ${productLabel(editSkuTaken)}` : undefined)}>
                  <Input
                    id="edit-sku" maxLength={32}
                    {...invalidProps('edit-sku', editErrors.sku ?? (editSkuTaken ? 'taken' : undefined))}
                    value={editForm.sku}
                    onChange={(e) => setEditForm({ ...editForm, sku: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Product name" htmlFor="edit-name"
                    error={editErrors.name}>
                  <Input
                    id="edit-name" maxLength={100} {...invalidProps('edit-name', editErrors.name)}
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Brand" htmlFor="edit-brand" error={editErrors.brand}>
                  <Input
                    id="edit-brand" maxLength={60} {...invalidProps('edit-brand', editErrors.brand)}
                    value={editForm.brand}
                    onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                    required
                  />
                </Field>
                {/* A text box with a list of suggested categories. Typing a
                    name that isn't in the list creates a new category on save. */}
                <CategoryInput
                  id="edit-category" error={editErrors.category}
                  label="Category"
                  value={editForm.category}
                  onValueChange={(category) => setEditForm({ ...editForm, category })}
                  suggestions={knownCategories}
                  required
                />
                <Field label="Price (₱)" htmlFor="edit-price"
                    error={editErrors.price}>
                  <Input
                    id="edit-price" {...invalidProps('edit-price', editErrors.price)}
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm.price}
                    onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Cost (₱)" htmlFor="edit-cost"
                    error={editErrors.cost}>
                  <Input
                    id="edit-cost" {...invalidProps('edit-cost', editErrors.cost)}
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm.cost}
                    onChange={(e) => setEditForm({ ...editForm, cost: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Reorder level" htmlFor="edit-reorder"
                    error={editErrors.reorder_level} hint={REORDER_HINT}>
                  <Input
                    id="edit-reorder" {...invalidProps('edit-reorder', editErrors.reorder_level)}
                    type="number"
                    min="0"
                    step="1"
                    value={editForm.reorder_level}
                    onChange={(e) => setEditForm({ ...editForm, reorder_level: e.target.value })}
                    required
                  />
                </Field>
              </div>

              <Field
                label="Description (optional)"
                htmlFor="edit-description"
                    error={editErrors.description}
                hint="Shown under the product on the POS menu."
              >
                <Textarea
                  id="edit-description" {...invalidProps('edit-description', editErrors.description)}
                  maxLength={300}
                  rows={2}
                  placeholder="e.g. Fresh full-cream milk, 1 litre"
                  value={editForm.description ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                />
              </Field>

              {/* The photo (ui/image-picker.tsx): shows the current one;
                  "Change photo" picks a new one (Remove takes that back), and
                  "Remove" on the current photo saves the product without one.
                  Nothing changes until Save. */}
              <Field label="Product photo" htmlFor="edit-image"
                    error={editErrors.image}
                    hint={editRemoveImage ? 'The photo will be removed when you save.' : undefined}>
                <ImagePicker
                  id="edit-image" {...invalidProps('edit-image', editErrors.image)}
                  file={editImageFile}
                  onFileChange={setEditImageFile}
                  currentUrl={editRemoveImage ? null : editingProduct.image_url}
                  onRemoveCurrent={() => setEditRemoveImage(true)}
                />
              </Field>

              {/* Save submits the form (runs handleUpdateProduct). Cancel is a
                  plain button (our Button is type="button" unless told
                  otherwise), so it just closes the form. Both are off while saving. */}
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
            {/* Submitting runs handleSubmit. Each box reads its text from
                `form` and writes changes back with setForm({ ...form, name: … }),
                a copy of `form` with one field replaced. Prices and numbers
                stay as text here until zod converts them on submit. Under each
                box, <Field error={addErrors.…}> shows that box's message. */}
            <form className={formCardClass} onSubmit={handleSubmit} autoComplete="off" noValidate>
              <div className="space-y-4">
                <h3 className={formTitleClass}>Add New Product</h3>
                <div className="grid grid-cols-2 gap-3">
                  {/* Under the name: an amber note when a product with the
                      same name AND brand already exists (addLookAlike). */}
                  <Field
                    label="Product name"
                    htmlFor="add-name"
                    error={addErrors.name}
                    className="col-span-2"
                    hint={
                      addLookAlike && (
                        <span className="font-medium text-warning-strong">
                          Already in the catalogue: {productLabel(addLookAlike)}. Use Receive Stock to add more of it.
                        </span>
                      )
                    }
                  >
                    <Input id="add-name" maxLength={100} {...invalidProps('add-name', addErrors.name)} placeholder="e.g. Fresh Milk (1 L)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                  </Field>
                  <Field label="Brand" htmlFor="add-brand" error={addErrors.brand}>
                    <Input id="add-brand" maxLength={60} {...invalidProps('add-brand', addErrors.brand)} placeholder="e.g. Magnolia" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} required />
                  </Field>
                  {/* The SKU's message shows WHILE typing when another product
                      already uses it (addSkuTaken), not only after Save. */}
                  {(() => {
                    const skuError = addErrors.sku ?? (addSkuTaken ? `Already used by ${productLabel(addSkuTaken)}` : undefined);
                    return (
                      <Field label="SKU" htmlFor="add-sku" error={skuError} hint="Your own stock code, e.g. DY-MILK-1L.">
                        <Input id="add-sku" maxLength={32} {...invalidProps('add-sku', skuError)} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required />
                      </Field>
                    );
                  })()}
                  <div className="col-span-2">
                    <CategoryInput
                      id="add-category" error={addErrors.category}
                      label="Category"
                      value={form.category}
                      onValueChange={(category) => setForm({ ...form, category })}
                      suggestions={knownCategories}
                      required
                    />
                  </div>
                  <Field label="Price (₱)" htmlFor="add-price"
                    error={addErrors.price}>
                    <Input
                      id="add-price" {...invalidProps('add-price', addErrors.price)}
                      type="number"
                      step="0.01"
                      value={form.price}
                      onChange={(e) => setForm({ ...form, price: e.target.value })}
                      required
                    />
                  </Field>
                  <Field label="Cost (₱)" htmlFor="add-cost"
                    error={addErrors.cost}>
                    <Input
                      id="add-cost" {...invalidProps('add-cost', addErrors.cost)}
                      type="number"
                      step="0.01"
                      value={form.cost}
                      onChange={(e) => setForm({ ...form, cost: e.target.value })}
                      required
                    />
                  </Field>
                  {/* Starting stock and its expiry date, side by side. The
                      stock is saved as the product's first batch with this
                      date (see handleSubmit). The date is required whenever
                      the starting stock is more than 0. */}
                  <Field label="Starting stock" htmlFor="add-stock"
                    error={addErrors.stock_quantity}>
                    <Input
                      id="add-stock" {...invalidProps('add-stock', addErrors.stock_quantity)}
                      type="number"
                      min="0"
                      value={form.stock_quantity}
                      onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                      required
                    />
                  </Field>
                  <Field label="Expiry date" htmlFor="add-expiry"
                    error={addErrors.expiry_date} hint="Of the starting stock.">
                    <DatePicker
                      id="add-expiry" {...invalidProps('add-expiry', addErrors.expiry_date)}
                      value={form.expiry_date}
                      onChange={(date) => setForm({ ...form, expiry_date: date })}
                      today={todayInManila()}
                      min={tomorrow}
                      presets={EXPIRY_PRESETS}
                    />
                  </Field>
                  {/* Reorder level = the low-stock alert (see REORDER_HINT). */}
                  <Field label="Reorder level" htmlFor="add-reorder"
                    error={addErrors.reorder_level} hint={REORDER_HINT} className="col-span-2">
                    <Input
                      id="add-reorder" {...invalidProps('add-reorder', addErrors.reorder_level)}
                      type="number"
                      min="0"
                      placeholder="e.g. 10"
                      value={form.reorder_level}
                      onChange={(e) => setForm({ ...form, reorder_level: e.target.value })}
                      required
                    />
                  </Field>
                  <Field
                    label="Description (optional)"
                    htmlFor="add-description"
                    error={addErrors.description}
                    hint="Shown under the product on the POS menu."
                    className="col-span-2"
                  >
                    <Textarea
                      id="add-description" {...invalidProps('add-description', addErrors.description)}
                      maxLength={300}
                      rows={2}
                      placeholder="e.g. Fresh full-cream milk, 1 litre"
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                    />
                  </Field>
                  {/* Our own photo box (ui/image-picker.tsx): a preview, and
                      "Remove" to take the chosen photo back off. */}
                  <Field label="Product photo (optional)" htmlFor="add-image"
                    error={addErrors.image} className="col-span-2">
                    <ImagePicker
                      id="add-image" {...invalidProps('add-image', addErrors.image)}
                      file={imageFile}
                      onFileChange={setImageFile}
                    />
                  </Field>
                </div>
              </div>
              {/* Off (and reads "Saving…") while this form is saving. */}
              <Button type="submit" className="w-full" disabled={busyForm === 'add'}>
                {busyForm === 'add' ? 'Saving…' : 'Save Product'}
              </Button>
            </form>

            {/* ── Receive stock ── */}
            {/* Pick the product, type how many arrived and their expiry date.
                Submitting runs handleReceive, which saves them as a new batch.
                The product dropdown (RichSelect) shows each product's picture,
                SKU and current stock (productOptions above). */}
            <form className={formCardClass} onSubmit={handleReceive} autoComplete="off" noValidate>
              <div className="space-y-4">
                <h3 className={formTitleClass}>Receive Stock by Batch</h3>
                <div className="space-y-3">
                  <RichSelect
                    label="Product"
                    placeholder="Select product"
                    withImages
                    options={productOptions}
                    value={receiveForm.product_id}
                    error={receiveErrors.product_id}
                    onValueChange={(productId) => setReceiveForm({ ...receiveForm, product_id: productId })}
                    emptyMessage="No products yet."
                  />
                  <Field label="Batch quantity" htmlFor="receive-quantity"
                    error={receiveErrors.quantity}>
                    <Input
                      id="receive-quantity" {...invalidProps('receive-quantity', receiveErrors.quantity)}
                      type="number"
                      min="1"
                      value={receiveForm.quantity}
                      onChange={(e) => setReceiveForm({ ...receiveForm, quantity: e.target.value })}
                      required
                    />
                  </Field>
                  {/* Our own calendar (ui/date-picker.tsx), not the browser's.
                      Days up to today are greyed out: stock that expires
                      today already counts as expired. */}
                  <Field label="Expiry date" htmlFor="receive-expiry"
                    error={receiveErrors.expiry_date}>
                    <DatePicker
                      id="receive-expiry" {...invalidProps('receive-expiry', receiveErrors.expiry_date)}
                      value={receiveForm.expiry_date}
                      onChange={(date) => setReceiveForm({ ...receiveForm, expiry_date: date })}
                      today={todayInManila()}
                      min={tomorrow}
                      presets={EXPIRY_PRESETS}
                    />
                  </Field>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={busyForm === 'receive'}>
                {busyForm === 'receive' ? 'Saving…' : 'Receive Stock'}
              </Button>
            </form>

            {/* ── Write off damaged / spoiled stock ── */}
            {/* Pick the product, then which of its batches, how many units,
                damaged or spoiled, and why. Submitting runs handleWriteOff,
                which asks "Are you sure?" before removing anything. */}
            <form className={formCardClass} onSubmit={handleWriteOff} autoComplete="off" noValidate>
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
                    // (That happens in onValueChange just below: batch_id: ''.)
                    error={writeOffErrors.product_id}
                    onValueChange={(productId) => setWriteOffForm({ ...writeOffForm, product_id: productId, batch_id: '' })}
                    emptyMessage="No products yet."
                  />

                  {/* Only the chosen product's active batches with units left
                      (writeOffBatchOptions above). Switched off until a
                      product is picked. */}
                  <RichSelect
                    label="Batch"
                    placeholder={writeOffForm.product_id ? 'Select active batch' : 'Pick a product first'}
                    options={writeOffBatchOptions}
                    value={writeOffForm.batch_id}
                    error={writeOffErrors.batch_id}
                    onValueChange={(batchId) => setWriteOffForm({ ...writeOffForm, batch_id: batchId })}
                    disabled={!writeOffForm.product_id}
                    emptyMessage="This product has no active batches."
                    // Once a batch is picked, its expiry stays visible under the box.
                    hint={selectedWriteOffBatch && `Expiry: ${describeExpiry(selectedWriteOffBatch.expiry_date)}`}
                  />

                  {/* Quantity: `max` is what the chosen batch has left, so the
                      number arrows can't go past it (zod checks it too).
                      Type: damaged or spoiled; it's saved with the loss so
                      Analytics can split the losses by kind. */}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Quantity" htmlFor="writeoff-quantity"
                    error={writeOffErrors.quantity}>
                      <Input
                        id="writeoff-quantity" {...invalidProps('writeoff-quantity', writeOffErrors.quantity)}
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
                      error={writeOffErrors.kind}
                      onValueChange={(kind) =>
                        setWriteOffForm({ ...writeOffForm, kind: (kind || 'damaged') as WriteOffStockInput['kind'] })
                      }
                      options={[
                        { value: 'damaged', label: 'Damaged', description: 'Broken, dented, torn…' },
                        { value: 'spoiled', label: 'Spoiled', description: 'Gone bad before its date' },
                      ]}
                    />
                  </div>

                  <Field label="Reason" htmlFor="writeoff-reason"
                    error={writeOffErrors.reason}>
                    <Input
                      id="writeoff-reason" maxLength={200} {...invalidProps('writeoff-reason', writeOffErrors.reason)}
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
      {/* Shown to admins and cashiers. Typing updates `query`; the table
          below then shows only visibleRows. */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative md:w-80">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-subtle"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Search products"
            maxLength={100}
            placeholder="Search name, SKU, barcode or category…"
            className="pl-10"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* Each button shows how many products are in that group, so problems
            (low stock, expiring) are visible at a glance. */}
        {/* The counts use ALL products (`rows`), ignoring the search box, so
            they don't change while typing. aria-pressed tells screen readers
            which button is on. */}
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
              {/* Nothing to show: either there are no products at all, or the
                  search/filter hides them all (then offer "Clear filters").
                  colSpan stretches the message across every column: 7, plus
                  the Edit column for admins. */}
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
                // Is this product's batch table open right now?
                const batchesOpen = openBatchRows.has(p.id);

                return (
                  // Fragment: each product is its row plus (when opened) a batch details row under it.
                  // A Fragment groups the two <tr>s without adding a wrapper
                  // element (a table can't have a <div> between rows). It's
                  // written out in full here, instead of <>…</>, because it
                  // needs a `key`.
                  <Fragment key={p.id}>
                    {/* Row colour: pale red when out of stock, pale amber when
                        low or expiring soon. When the batch table is open,
                        `[&>td]:border-b-0` takes the bottom border off this
                        row's cells, so the two rows read as one block. */}
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
                      {/* SKU, with the product's barcode drawn underneath. */}
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
                          {/* Brand (small, grey) above the product name. */}
                          <span className="min-w-0">
                            {p.brand && <span className="block text-[11px] font-medium text-ink-muted">{p.brand}</span>}
                            <span className="block text-sm font-semibold text-ink">{p.name}</span>
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-ink-muted">{p.category}</td>
                      <td className="px-4 py-3 text-right text-sm font-medium tabular-nums">₱{p.price.toFixed(2)}</td>
                      {/* Stock Level: units that can be sold now, and under it
                          how they're split across batches ("B-3: 10 · B-1: 3").
                          sellableBatches() keeps only active, unexpired batches
                          with units left, in the order they'll be sold. */}
                      <td className="space-y-1 px-4 py-3">
                        <div className="text-sm font-bold tabular-nums">{summary.available_quantity}</div>
                        <BatchBreakdown batches={sellableBatches(productBatches)} />
                      </td>
                      {/* Expiry: the soonest date among the batches that can
                          still be sold ("Expires in 3 days"), how many units
                          are near expiry (sold 15% off), and the button that
                          opens the batch table. */}
                      <td className="space-y-1.5 px-4 py-3">
                        <div>{formatExpiry(summary.earliest_expiry_date)}</div>
                        {summary.near_expiry_count > 0 && (
                          <div className="text-[11px] font-semibold text-warning-strong">
                            {summary.near_expiry_count} of {summary.available_quantity} stocks nearing expiry
                            {` · ${NEAR_EXPIRY_PERCENT_OFF}% off at checkout`}
                          </div>
                        )}
                        {/* Opens the batch table under this row. */}
                        {/* aria-expanded / aria-controls tell screen readers the
                            button shows or hides the row with id "batches-<id>".
                            It's switched off when the product has no batches.
                            The arrow icon turns upside down while open. */}
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
                        {/* Which words show is decided by the three flags made
                            in `rows` (see "How the status words are decided"). */}
                        <div className="flex flex-col gap-1">
                          {isOutOfStock && (
                            <StatusText tone="danger" icon={<PackageX />}>
                              No stock
                            </StatusText>
                          )}
                          {/* With the threshold underneath, so it's clear WHY:
                              stock is at or below the product's reorder level. */}
                          {isLow && (
                            <div>
                              <StatusText tone="warning" icon={<AlertTriangle />}>
                                Low stock
                              </StatusText>
                              <div className="text-[11px] text-ink-muted">Reorder level: {p.reorder_level}</div>
                            </div>
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
                      {/* Admins only: opens the Edit form for this product. */}
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
                    {/* A second row with one cell stretched across every
                        column (colSpan), holding the BatchTable defined at
                        the top of this file. */}
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
