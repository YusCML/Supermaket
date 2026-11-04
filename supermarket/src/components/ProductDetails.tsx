// ProductDetails.tsx: the pop-up that opens when you click a product at
// checkout (on its picture or name in ProductMenu).
//
// It shows the picture, barcode, price and stock facts, lets the cashier (or
// self-serve customer) pick WHICH batch to sell from and HOW MANY to add,
// then calls onAdd. POS.tsx's onAdd puts that into the basket with
// addToCart(product, quantity, batch) and closes the pop-up.
//
// This component never changes the basket itself. POS owns the basket and
// passes in just what's needed: how many are already in it (inBasket,
// inBasketForBatch) and what to do on "Add" (onAdd).
//
// React words used here:
//   props    = the inputs a parent passes in (ProductDetailsProps below).
//   useState = a value React remembers between redraws; calling its setter
//              redraws the pop-up with the new value.
//   useRef   = a box ({ current: … }) React keeps between redraws without
//              redrawing. Passed as ref={…}, it holds a real page element.
import { useRef, useState, type ReactNode } from 'react';
import { CalendarClock, ImageIcon, Minus, Plus, ShoppingBasket, Tag } from 'lucide-react';
import type { ProductBatch, ProductInventorySummary } from '../types/app';
import { daysUntilExpiry, describeExpiry, formatExpiry, isNearExpiry } from '../lib/expiry';
import { markedDownPrice, NEAR_EXPIRY_DAYS, NEAR_EXPIRY_PERCENT_OFF } from '../lib/pricing';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { StatusText } from './ui/status-text';
import BarcodeImage from './BarcodeImage';

interface ProductDetailsProps {
  // The product to show, plus its stock and expiry numbers from the
  // inventory summary (get_product_inventory in the database).
  product: ProductInventorySummary;
  // This product's batches that can still be sold, soonest expiry first
  // (POS passes sellableBatches() from lib/expiry). Empty if the product
  // has no batch records.
  batches: ProductBatch[];
  // How many of this product are already in the basket (all batches together).
  inBasket: number;
  // How many units from one particular batch are already in the basket.
  inBasketForBatch: (batchId: number) => number;
  // "Add" was pressed: add `quantity` units, from `batch` if one was picked.
  onAdd: (quantity: number, batch?: ProductBatch) => void;
  // The pop-up should close (Escape, ×, or a click outside).
  onClose: () => void;
}

// Money is always shown with 2 decimals, e.g. ₱12.50.
const peso = (amount: number) => `₱${amount.toFixed(2)}`;

// One "label: value" line in the facts list.
// `children` is whatever is written between <Fact> and </Fact> (the value);
// `className` lets one fact style its value differently (e.g. red text).
function Fact({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className={cn('text-sm font-semibold text-ink', className)}>{children}</dd>
    </div>
  );
}

// The pop-up that opens when a product is picked at checkout: picture, price,
// stock facts, which batch to sell from, and how many to add.
export default function ProductDetails({
  product,
  batches,
  inBasket,
  inBasketForBatch,
  onAdd,
  onClose,
}: ProductDetailsProps) {
  // Units of a batch that are NOT already in the basket, i.e. how many more
  // can still be taken from it.
  const freeIn = (batch: ProductBatch) => batch.quantity_remaining - inBasketForBatch(batch.id);

  // Which batch card is ticked. It starts on the first batch that still has
  // free units; since `batches` is in selling order, that's the soonest-
  // expiring one. (Passing a function to useState means it's worked out only
  // once, when the pop-up opens, not on every redraw.)
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(
    () => batches.find((b) => freeIn(b) > 0)?.id ?? null
  );
  // How many to add, as set with the − / + buttons. Starts at 1.
  const [quantity, setQuantity] = useState(1);
  // The "Add" button gets the keyboard focus when the window opens, so
  // pressing Enter straight away adds one to the basket.
  const addButtonRef = useRef<HTMLButtonElement>(null);

  const hasBatches = batches.length > 0;
  const selectedBatch = batches.find((b) => b.id === selectedBatchId) ?? null;
  // Stock of this product that isn't in the basket yet (never below 0).
  const productRoomLeft = Math.max(0, product.stock_quantity - inBasket);

  // The most that can be added right now:
  //  - with batches: limited by BOTH the product's free stock and the
  //    chosen batch's free units (0 if no batch is chosen);
  //  - without batches: just the product's free stock.
  const canAdd = hasBatches
    ? selectedBatch
      ? Math.min(productRoomLeft, freeIn(selectedBatch))
      : 0
    : productRoomLeft;

  // The 15%-off price (lib/pricing.ts). It only applies to units from a batch
  // that expires within 7 days.
  const salePrice = markedDownPrice(product.price);
  const selectedIsMarkedDown = selectedBatch ? isNearExpiry(selectedBatch.expiry_date) : false;
  // Show the sale price at the top? With batches: only if the chosen batch is
  // marked down. Without: if the product has any near-expiry units at all.
  const showSale = hasBatches ? selectedIsMarkedDown : product.near_expiry_count > 0;

  // Price of what's about to be added, shown next to the Add button.
  // (Without batches the database decides which units are marked down, so
  // the preview uses the normal price.)
  const unitPrice = hasBatches && selectedIsMarkedDown ? salePrice : product.price;
  const addTotal = unitPrice * Math.min(quantity, canAdd);

  // Ticks a batch card. A batch with nothing free can't be picked. The
  // quantity is squeezed to fit the new batch (at least 1, at most what's
  // free in that batch and in the product's stock).
  const selectBatch = (batch: ProductBatch) => {
    if (freeIn(batch) <= 0) return;
    setSelectedBatchId(batch.id);
    setQuantity((q) => Math.max(1, Math.min(q, freeIn(batch), productRoomLeft)));
  };

  // The − / + buttons. Keeps the quantity between 1 and canAdd.
  const changeQuantity = (next: number) => {
    setQuantity(Math.max(1, Math.min(next, canAdd)));
  };

  return (
    // Escape, the × button and clicking outside all close the window.
    // `open` is always true here: POS only draws this component while a
    // product is chosen, and onClose clears that choice, which removes it.
    // initialFocus={addButtonRef} puts the keyboard focus on "Add" at the start.
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-0 p-0 sm:max-w-2xl" initialFocus={addButtonRef}>
        {/* ── Header ── (pr-14 leaves room for the × close button) */}
        {/* Brand (small, above), the name, then category and SKU. */}
        <div className="border-b border-gray-100 px-6 pt-6 pb-4 pr-14">
          {product.brand && (
            <div className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{product.brand}</div>
          )}
          <DialogTitle>{product.name}</DialogTitle>
          <DialogDescription className="mt-0.5">
            {[product.category, product.sku && `SKU ${product.sku}`].filter(Boolean).join(' · ')}
          </DialogDescription>
        </div>

        <div className="space-y-6 overflow-y-auto px-6 py-5">
          {/* ── Picture + price/facts side by side ── */}
          <div className="grid gap-5 sm:grid-cols-[13rem_1fr]">
            <div className="space-y-2">
              <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-subtle">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="size-12 text-ink-subtle" aria-hidden="true" />
                )}
              </div>
              <div className="flex justify-center rounded-md border border-gray-200 bg-white px-2 py-1.5">
                <BarcodeImage value={product.barcode} height={36} barWidth={1.3} fontSize={12} />
              </div>
            </div>

            <div className="space-y-4">
              {/* Price: the 15%-off price with the normal one crossed out
                  and a line saying why, or just the normal price. */}
              <div>
                {showSale ? (
                  <>
                    <div className="flex flex-wrap items-baseline gap-2 tabular-nums">
                      <strong className="text-3xl font-bold tracking-tight text-brand-strong">{peso(salePrice)}</strong>
                      <span className="text-base text-ink-muted line-through">{peso(product.price)}</span>
                      <StatusText tone="warning" icon={<Tag />} className="text-sm">
                        {NEAR_EXPIRY_PERCENT_OFF}% off
                      </StatusText>
                    </div>
                    <p className="mt-1 text-sm text-ink-muted">
                      {hasBatches
                        ? `Batch ${selectedBatch?.batch_code} expires within ${NEAR_EXPIRY_DAYS} days, so it's ${NEAR_EXPIRY_PERCENT_OFF}% off.`
                        : `${NEAR_EXPIRY_PERCENT_OFF}% off the ${product.near_expiry_count} unit${product.near_expiry_count === 1 ? '' : 's'} expiring within ${NEAR_EXPIRY_DAYS} days. After those, ${peso(product.price)} each.`}
                    </p>
                  </>
                ) : (
                  <strong className="text-3xl font-bold tracking-tight text-ink tabular-nums">{peso(product.price)}</strong>
                )}
              </div>

              {/* The product's description (set in Inventory), if it has one. */}
              {product.description && <p className="text-sm leading-relaxed text-ink-muted">{product.description}</p>}

              {/* Facts. <dl> is HTML's "description list": pairs of a term
                  (<dt>) and its value (<dd>), built by <Fact> above. Rows
                  that wouldn't say anything useful (no expired units, no
                  barcode) are left out. */}
              <dl className="divide-y divide-gray-100 border-y border-gray-100">
                <Fact label="In stock">
                  {product.stock_quantity}
                  {hasBatches && (
                    <span className="font-normal text-ink-muted">
                      {' '}in {batches.length} batch{batches.length === 1 ? '' : 'es'}
                    </span>
                  )}
                </Fact>
                <Fact label="Already in basket">{inBasket}</Fact>
                <Fact label="Next expiry">{formatExpiry(product.earliest_expiry_date)}</Fact>
                {product.expired_quantity > 0 && (
                  <Fact label="Expired (not for sale)" className="text-danger-strong">
                    {product.expired_quantity}
                  </Fact>
                )}
                {product.barcode && (
                  <Fact label="Barcode" className="font-mono text-xs">
                    {product.barcode}
                  </Fact>
                )}
              </dl>
            </div>
          </div>

          {/* ── Batch picker: one card per batch ── */}
          {hasBatches && (
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-ink">Choose the batch to sell from</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {batches.map((batch, index) => {
                  // Units of this batch not yet in the basket.
                  const free = freeIn(batch);
                  const isSelected = batch.id === selectedBatchId;
                  // Everything in this batch is already in the basket.
                  const isEmpty = free <= 0;
                  // Days until expiry (null = no expiry date), for the colour.
                  const days = batch.expiry_date ? daysUntilExpiry(batch.expiry_date) : null;
                  // Expires within 7 days -> sells at 15% off.
                  const markedDown = isNearExpiry(batch.expiry_date);

                  return (
                    // The whole card is a <label>, so clicking anywhere on it picks the batch.
                    // Inside is a real radio button (name="batch" groups them, so only one
                    // can be ticked). It's a controlled input: `checked` comes from our
                    // selectedBatchId state, and onChange updates that state.
                    // has-focus-visible:… draws the focus ring around the whole card when
                    // the radio inside is reached with the keyboard.
                    <label
                      key={batch.id}
                      className={cn(
                        'flex cursor-pointer gap-3 rounded-md border p-3 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand',
                        isSelected ? 'border-brand bg-brand/5' : 'border-gray-200 hover:border-gray-300 hover:bg-subtle',
                        isEmpty && 'cursor-not-allowed opacity-50 hover:bg-transparent'
                      )}
                    >
                      <input
                        type="radio"
                        name="batch"
                        className="mt-0.5 size-4 shrink-0 accent-brand"
                        checked={isSelected}
                        disabled={isEmpty}
                        onChange={() => selectBatch(batch)}
                      />
                      <span className="min-w-0 flex-1 space-y-0.5">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="font-mono text-sm font-semibold text-ink">{batch.batch_code}</span>
                          <span className="text-sm text-ink tabular-nums">
                            <strong className="font-semibold">{free}</strong>
                            <span className="text-ink-muted"> available</span>
                          </span>
                        </span>
                        <span
                          className={cn(
                            'flex items-center gap-1 text-xs',
                            days !== null && days <= NEAR_EXPIRY_DAYS ? 'font-medium text-warning-strong' : 'text-ink-muted'
                          )}
                        >
                          <CalendarClock className="size-3.5" aria-hidden="true" />
                          {describeExpiry(batch.expiry_date)}
                        </span>
                        {/* Notes as plain coloured text. "Sells first" marks the
                            first card: batches arrive in selling order (soonest
                            expiry first), the same order the menu's quick "+"
                            takes stock in. */}
                        <span className="flex flex-wrap gap-x-3 text-xs font-semibold">
                          {index === 0 && <span className="text-brand-strong">Sells first</span>}
                          {markedDown && <span className="text-warning-strong">{NEAR_EXPIRY_PERCENT_OFF}% off</span>}
                          {free < batch.quantity_remaining && (
                            <span className="text-ink-muted">{batch.quantity_remaining - free} already in basket</span>
                          )}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}
        </div>

        {/* ── Footer: quantity + add ── */}
        {/* If nothing more can be added (sold out, or it's all in the basket
            already), a short note replaces the controls. aria-live="polite"
            makes screen readers read out the number when it changes. The Add
            button passes Math.min(quantity, canAdd) as a last safety net, in
            case the limit dropped after the quantity was chosen. */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 bg-subtle/60 px-6 py-4">
          {canAdd > 0 ? (
            <>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 rounded-full border border-gray-300 bg-white p-1 shadow-2xs">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => changeQuantity(quantity - 1)}
                    disabled={quantity <= 1}
                    aria-label="One less"
                  >
                    <Minus />
                  </Button>
                  <span className="w-8 text-center text-sm font-semibold text-ink tabular-nums" aria-live="polite">
                    {quantity}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => changeQuantity(quantity + 1)}
                    disabled={quantity >= canAdd}
                    aria-label="One more"
                  >
                    <Plus />
                  </Button>
                </div>
                <span className="text-xs text-ink-muted">up to {canAdd}</span>
              </div>

              <Button ref={addButtonRef} size="lg" onClick={() => onAdd(Math.min(quantity, canAdd), selectedBatch ?? undefined)}>
                <ShoppingBasket aria-hidden="true" />
                {selectedBatch ? `Add from ${selectedBatch.batch_code}` : 'Add to basket'}
                <span className="tabular-nums opacity-90">· {peso(addTotal)}</span>
              </Button>
            </>
          ) : (
            <span className="text-sm font-medium text-ink-muted">
              {product.stock_quantity <= 0 ? 'Out of stock.' : 'All available stock is already in the basket.'}
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
