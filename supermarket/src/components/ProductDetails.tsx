import { useEffect, useState } from 'react';
import type { ProductBatch, ProductInventorySummary } from '../types/app';
import { daysUntilExpiry, formatExpiry, isNearExpiry } from '../lib/expiry';
import { markedDownPrice, NEAR_EXPIRY_DAYS, NEAR_EXPIRY_PERCENT_OFF } from '../lib/pricing';

interface ProductDetailsProps {
  product: ProductInventorySummary;
  // This product's batches that can still be sold, soonest expiry first.
  // Staff only: customers can't see batches, so at self-serve this is empty
  // and the window shows the summary instead (the database picks the batch).
  batches: ProductBatch[];
  // How many of this product are already in the basket, in total and per batch,
  // so we never offer more than the shelf (or the batch) has.
  inBasket: number;
  inBasketForBatch: (batchId: number) => number;
  // `batch` is the one picked in the list; undefined at self-serve.
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
  // near expiry. Without batches (self-serve), the markdown applies to however
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
    <div className="confirm-overlay" onMouseDown={onClose}>
      <div
        className="product-details"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-details-title"
        // Clicks inside the window shouldn't count as clicking the dark background.
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="product-details-header">
          <div>
            <h3 id="product-details-title">{product.name}</h3>
            <small>
              {[product.category, product.sku && `SKU ${product.sku}`, product.barcode && `Barcode ${product.barcode}`]
                .filter(Boolean)
                .join(' · ')}
            </small>
          </div>
          <button className="notice-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="product-details-price">
          {showSale ? (
            <>
              <span className="price-old">₱{product.price.toFixed(2)}</span>{' '}
              <strong className="price-sale">₱{salePrice.toFixed(2)}</strong>{' '}
              <span className="badge badge-sale">{NEAR_EXPIRY_PERCENT_OFF}% off</span>
              <p className="product-details-note">
                {hasBatches
                  ? `Batch ${selectedBatch?.batch_code} expires within ${NEAR_EXPIRY_DAYS} days, so it's ${NEAR_EXPIRY_PERCENT_OFF}% off.`
                  : `${NEAR_EXPIRY_PERCENT_OFF}% off the ${product.near_expiry_count} unit${product.near_expiry_count === 1 ? '' : 's'} expiring within ${NEAR_EXPIRY_DAYS} days. After those, ₱${product.price.toFixed(2)} each.`}
              </p>
            </>
          ) : (
            <strong>₱{product.price.toFixed(2)}</strong>
          )}
        </div>

        <dl className="product-details-facts">
          <div>
            <dt>In stock</dt>
            <dd>{product.stock_quantity}</dd>
          </div>
          <div>
            <dt>In basket</dt>
            <dd>{inBasket}</dd>
          </div>
          <div>
            <dt>Next expiry</dt>
            <dd>{formatExpiry(product.earliest_expiry_date)}</dd>
          </div>
          {product.expired_quantity > 0 && (
            <div>
              <dt>Expired (not for sale)</dt>
              <dd>{product.expired_quantity}</dd>
            </div>
          )}
        </dl>

        {hasBatches && (
          <>
            <p className="product-details-note">Choose the batch to sell from:</p>
            <table className="data-table product-details-batches">
              <thead>
                <tr>
                  <th></th>
                  <th>Batch</th>
                  <th>Available</th>
                  <th>Expiry</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch, index) => {
                  const free = freeIn(batch);
                  const isSelected = batch.id === selectedBatchId;
                  return (
                    <tr
                      key={batch.id}
                      className={[
                        'batch-row',
                        isSelected ? 'is-selected' : '',
                        free <= 0 ? 'is-empty' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => selectBatch(batch)}
                    >
                      <td>
                        <input
                          type="radio"
                          name="batch"
                          checked={isSelected}
                          disabled={free <= 0}
                          onChange={() => selectBatch(batch)}
                          aria-label={`Sell from batch ${batch.batch_code}`}
                        />
                      </td>
                      <td>{batch.batch_code}</td>
                      <td>
                        {free}
                        {/* Some of this batch is already in the basket. */}
                        {free < batch.quantity_remaining && (
                          <small> ({batch.quantity_remaining - free} in basket)</small>
                        )}
                      </td>
                      <td>
                        {/* The date, plus "Expires in 3 days" when it's within a
                            week (further out, the label would just repeat the date). */}
                        {batch.expiry_date
                          ? daysUntilExpiry(batch.expiry_date) <= 7
                            ? `${batch.expiry_date} · ${formatExpiry(batch.expiry_date)}`
                            : batch.expiry_date
                          : formatExpiry(null)}
                      </td>
                      <td>
                        {index === 0 && <span className="badge badge-ok">Expires first</span>}{' '}
                        {isNearExpiry(batch.expiry_date) && (
                          <span className="badge badge-sale">{NEAR_EXPIRY_PERCENT_OFF}% off</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        <div className="product-details-actions">
          {canAdd > 0 ? (
            <>
              <div className="qty-control">
                <button
                  className="btn-sm"
                  onClick={() => changeQuantity(quantity - 1)}
                  disabled={quantity <= 1}
                  aria-label="One less"
                >
                  −
                </button>
                <span className="qty-value">{quantity}</span>
                <button
                  className="btn-sm"
                  onClick={() => changeQuantity(quantity + 1)}
                  disabled={quantity >= canAdd}
                  aria-label="One more"
                >
                  +
                </button>
              </div>
              {/* Focused when the window opens, so Enter adds it straight away. */}
              <button
                className="btn-primary"
                onClick={() => onAdd(Math.min(quantity, canAdd), selectedBatch ?? undefined)}
                autoFocus
              >
                {selectedBatch ? `Add from ${selectedBatch.batch_code}` : 'Add to basket'}
              </button>
            </>
          ) : (
            <span className="product-details-note">
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
