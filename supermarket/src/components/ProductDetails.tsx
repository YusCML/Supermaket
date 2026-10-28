import { useEffect, useState } from 'react';
import type { ProductBatch, ProductInventorySummary } from '../types/app';
import { daysUntilExpiry, formatExpiry, isNearExpiry } from '../lib/expiry';
import { markedDownPrice, NEAR_EXPIRY_DAYS, NEAR_EXPIRY_PERCENT_OFF } from '../lib/pricing';
import BarcodeImage from './BarcodeImage';

interface ProductDetailsProps {
  product: ProductInventorySummary;
  // This product's batches that can still be sold, soonest expiry first.
  // Shown at the till and at self-serve. If it's empty (batches couldn't be
  // loaded), the window shows the summary and the database picks the batch.
  batches: ProductBatch[];
  // How many of this product are already in the basket, in total and per batch,
  // so we never offer more than the shelf (or the batch) has.
  inBasket: number;
  inBasketForBatch: (batchId: number) => number;
  // `batch` is the one picked in the list; undefined if there's no list.
  onAdd: (quantity: number, batch?: ProductBatch) => void;
  onClose: () => void;
}

// The window that opens when a product is picked at checkout: price (and any
// near-expiry markdown), stock, expiry dates, and a list of batches to choose
// from, plus a quantity and Add to basket.
export default function ProductDetails({
  product,
  batches,
  inBasket,
  inBasketForBatch,
  onAdd,
  onClose,
}: ProductDetailsProps) {
  // Units of a batch that aren't in the basket yet.
  const freeIn = (batch: ProductBatch) => batch.quantity_remaining - inBasketForBatch(batch.id);

  // Starts on the batch that would be sold first anyway (soonest expiry) that
  // still has units left. The cashier can pick another one in the list.
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(
    () => batches.find((b) => freeIn(b) > 0)?.id ?? null
  );
  const [quantity, setQuantity] = useState(1);

  const hasBatches = batches.length > 0;
  const selectedBatch = batches.find((b) => b.id === selectedBatchId) ?? null;
  const productRoomLeft = Math.max(0, product.stock_quantity - inBasket);

  // How many can still go into the basket: limited by the product's stock and,
  // when a batch is picked, by what's left in that batch.
  const canAdd = hasBatches
    ? selectedBatch
      ? Math.min(productRoomLeft, freeIn(selectedBatch))
      : 0
    : productRoomLeft;

  // The price shown: with a batch picked, it's 15% off only if that batch is
  // near expiry. Without a batch list, the markdown applies to however
  // many units are near expiry, and the note explains it.
  const salePrice = markedDownPrice(product.price);
  const selectedIsMarkedDown = selectedBatch ? isNearExpiry(selectedBatch.expiry_date) : false;
  const showSale = hasBatches ? selectedIsMarkedDown : product.near_expiry_count > 0;

  // Esc closes the window.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Picking another batch: keep the quantity, but not more than that batch has.
  const selectBatch = (batch: ProductBatch) => {
    if (freeIn(batch) <= 0) return;
    setSelectedBatchId(batch.id);
    setQuantity((q) => Math.max(1, Math.min(q, freeIn(batch), productRoomLeft)));
  };

  const changeQuantity = (next: number) => {
    setQuantity(Math.max(1, Math.min(next, canAdd)));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 font-sans antialiased text-[#333333] selection:bg-[#2E7D32]/15 selection:text-[#2E7D32]"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-[#FFFFFF] p-6 shadow-xl space-y-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-details-title"
        // Clicks inside the window shouldn't count as clicking the dark background.
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-gray-100 pb-3">
          <div>
            <h3 id="product-details-title" className="text-xl font-bold tracking-tight text-[#333333]">
              {product.name}
            </h3>
            <small className="text-xs text-[#333333]/60">
              {[product.category, product.sku && `SKU ${product.sku}`, product.barcode && `Barcode ${product.barcode}`]
                .filter(Boolean)
                .join(' · ')}
            </small>
          </div>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-semibold text-[#333333]/50 hover:bg-[#F5F5F5] hover:text-[#333333] transition-colors"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto space-y-5 pr-1">
          {/* Barcode Display */}
          <div className="flex justify-center rounded-xl bg-[#F5F5F5] p-3 border border-gray-200/60">
            <BarcodeImage value={product.barcode} />
          </div>

          {/* Pricing Info */}
          <div className="space-y-1">
            {showSale ? (
              <div>
                <div className="flex items-center gap-2">
                  <span className="line-through text-xs text-[#333333]/50">₱{product.price.toFixed(2)}</span>
                  <strong className="text-lg font-bold text-[#2E7D32]">₱{salePrice.toFixed(2)}</strong>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                    {NEAR_EXPIRY_PERCENT_OFF}% off
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#333333]/70">
                  {hasBatches
                    ? `Batch ${selectedBatch?.batch_code} expires within ${NEAR_EXPIRY_DAYS} days, so it's ${NEAR_EXPIRY_PERCENT_OFF}% off.`
                    : `${NEAR_EXPIRY_PERCENT_OFF}% off the ${product.near_expiry_count} unit${product.near_expiry_count === 1 ? '' : 's'} expiring within ${NEAR_EXPIRY_DAYS} days. After those, ₱${product.price.toFixed(2)} each.`}
                </p>
              </div>
            ) : (
              <strong className="text-lg font-bold text-[#333333]">₱{product.price.toFixed(2)}</strong>
            )}
          </div>

          {/* Key Facts Grid */}
          <dl className="grid grid-cols-2 gap-3 rounded-xl border border-gray-200 bg-[#F5F5F5] p-3 text-xs">
            <div>
              <dt className="text-[10px] font-bold text-[#333333]/50 uppercase tracking-wider">In stock</dt>
              <dd className="font-semibold text-[#333333]">
                {product.stock_quantity}
                {hasBatches && (
                  <span className="text-[11px] font-normal text-[#333333]/70">
                    {' '}in {batches.length} batch{batches.length === 1 ? '' : 'es'}
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold text-[#333333]/50 uppercase tracking-wider">In basket</dt>
              <dd className="font-semibold text-[#333333]">{inBasket}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold text-[#333333]/50 uppercase tracking-wider">Next expiry</dt>
              <dd className="font-semibold text-[#333333]">{formatExpiry(product.earliest_expiry_date)}</dd>
            </div>
            {product.expired_quantity > 0 && (
              <div>
                <dt className="text-[10px] font-bold text-red-600/70 uppercase tracking-wider">Expired (not for sale)</dt>
                <dd className="font-semibold text-red-600">{product.expired_quantity}</dd>
              </div>
            )}
          </dl>

          {/* Batches Table */}
          {hasBatches && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#333333]/80">Choose the batch to sell from:</p>
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-[#FFFFFF]">
                <table className="w-full text-left text-xs text-[#333333]">
                  <thead className="bg-[#F5F5F5] border-b border-gray-200 text-[#333333]/70 font-semibold">
                    <tr>
                      <th className="px-3 py-2 w-8"></th>
                      <th className="px-3 py-2">Batch</th>
                      <th className="px-3 py-2">Available</th>
                      <th className="px-3 py-2">Expiry</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {batches.map((batch, index) => {
                      const free = freeIn(batch);
                      const isSelected = batch.id === selectedBatchId;
                      return (
                        <tr
                          key={batch.id}
                          className={`transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-[#2E7D32]/10 font-medium'
                              : free <= 0
                              ? 'opacity-40 bg-gray-50 cursor-not-allowed'
                              : 'hover:bg-gray-50'
                          }`}
                          onClick={() => selectBatch(batch)}
                        >
                          <td className="px-3 py-2 text-center">
                            <input
                              type="radio"
                              name="batch"
                              className="accent-[#2E7D32] cursor-pointer"
                              checked={isSelected}
                              disabled={free <= 0}
                              onChange={() => selectBatch(batch)}
                              aria-label={`Sell from batch ${batch.batch_code}`}
                            />
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px]">{batch.batch_code}</td>
                          <td className="px-3 py-2">
                            {free}
                            {free < batch.quantity_remaining && (
                              <span className="text-[10px] text-[#333333]/60">
                                {' '}
                                ({batch.quantity_remaining - free} in basket)
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-[11px]">
                            {batch.expiry_date
                              ? daysUntilExpiry(batch.expiry_date) <= 7
                                ? `${batch.expiry_date} · ${formatExpiry(batch.expiry_date)}`
                                : batch.expiry_date
                              : formatExpiry(null)}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1">
                              {index === 0 && (
                                <span className="rounded-full bg-[#2E7D32]/10 px-2 py-0.5 text-[9px] font-bold text-[#2E7D32] border border-[#2E7D32]/20">
                                  Expires first
                                </span>
                              )}
                              {isNearExpiry(batch.expiry_date) && (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-800 border border-amber-200">
                                  {NEAR_EXPIRY_PERCENT_OFF}% off
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
          )}
        </div>

        {/* Modal Actions */}
        <div className="pt-2 border-t border-gray-100 flex items-center justify-end gap-3">
          {canAdd > 0 ? (
            <>
              <div className="flex items-center gap-1 rounded-xl border border-gray-300 bg-[#FFFFFF] p-1 shadow-2xs">
                <button
                  className="h-7 w-7 rounded-lg text-xs font-bold text-[#333333] hover:bg-gray-100 disabled:opacity-30 transition-colors flex items-center justify-center"
                  onClick={() => changeQuantity(quantity - 1)}
                  disabled={quantity <= 1}
                  aria-label="One less"
                >
                  −
                </button>
                <span className="w-8 text-center text-xs font-bold text-[#333333]">{quantity}</span>
                <button
                  className="h-7 w-7 rounded-lg text-xs font-bold text-[#333333] hover:bg-gray-100 disabled:opacity-30 transition-colors flex items-center justify-center"
                  onClick={() => changeQuantity(quantity + 1)}
                  disabled={quantity >= canAdd}
                  aria-label="One more"
                >
                  +
                </button>
              </div>

              {/* Focused when the window opens, so Enter adds it straight away. */}
              <button
                className="rounded-xl bg-[#2E7D32] px-5 py-2.5 text-xs font-bold text-[#FFFFFF] shadow-xs hover:bg-[#246628] transition-colors cursor-pointer"
                onClick={() => onAdd(Math.min(quantity, canAdd), selectedBatch ?? undefined)}
                autoFocus
              >
                {selectedBatch ? `Add from ${selectedBatch.batch_code}` : 'Add to basket'}
              </button>
            </>
          ) : (
            <span className="text-xs font-semibold text-[#333333]/60">
              {product.stock_quantity <= 0
                ? 'Out of stock.'
                : 'All available stock is already in the basket.'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}