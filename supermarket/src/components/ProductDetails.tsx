import { useEffect, useState } from 'react';
import type { ProductBatch, ProductInventorySummary } from '../types/app';
import { daysUntilExpiry, formatExpiry, isNearExpiry } from '../lib/expiry';
import { markedDownPrice, NEAR_EXPIRY_DAYS, NEAR_EXPIRY_PERCENT_OFF } from '../lib/pricing';

interface ProductDetailsProps {
  product: ProductInventorySummary;
  // This product's batches. Staff only: customers can't see batches, so for
  // them this is empty and the window shows the summary instead.
  batches: ProductBatch[];
  // How many of it are already in the basket (so we don't offer more than the shelf has).
  inBasket: number;
  onAdd: (quantity: number) => void;
  onClose: () => void;
}

// The window that opens when a product is picked at checkout: price (and any
// near-expiry markdown), stock, expiry dates and batches, plus Add to basket.
export default function ProductDetails({ product, batches, inBasket, onAdd, onClose }: ProductDetailsProps) {
  const [quantity, setQuantity] = useState(1);

  // What can still go into the basket without going over the shelf stock.
  const canAdd = Math.max(0, product.stock_quantity - inBasket);
  const nearExpiryUnits = product.near_expiry_count;
  const salePrice = markedDownPrice(product.price);

  // Batches that can still be sold (not expired: expiry after today, or no
  // expiry date), in the order they'll be sold: soonest expiry first,
  // no-expiry-date last. Same rules as the database.
  const sellableBatches = batches
    .filter((b) => b.status === 'active' && b.quantity_remaining > 0)
    .filter((b) => !b.expiry_date || daysUntilExpiry(b.expiry_date) > 0)
    .sort((a, b) => {
      if (!a.expiry_date) return 1;
      if (!b.expiry_date) return -1;
      return a.expiry_date.localeCompare(b.expiry_date);
    });

  // Esc closes the window.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
          {nearExpiryUnits > 0 ? (
            <>
              <span className="price-old">₱{product.price.toFixed(2)}</span>{' '}
              <strong className="price-sale">₱{salePrice.toFixed(2)}</strong>{' '}
              <span className="badge badge-sale">{NEAR_EXPIRY_PERCENT_OFF}% off</span>
              <p className="product-details-note">
                {NEAR_EXPIRY_PERCENT_OFF}% off the {nearExpiryUnits} unit{nearExpiryUnits === 1 ? '' : 's'} expiring
                within {NEAR_EXPIRY_DAYS} days. After those, ₱{product.price.toFixed(2)} each.
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

        {sellableBatches.length > 0 && (
          <table className="data-table product-details-batches">
            <thead>
              <tr>
                <th>Batch</th>
                <th>Left</th>
                <th>Expiry</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sellableBatches.map((batch, index) => (
                <tr key={batch.id}>
                  <td>{batch.batch_code}</td>
                  <td>{batch.quantity_remaining}</td>
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
                    {index === 0 && <span className="badge badge-ok">Sold next</span>}{' '}
                    {isNearExpiry(batch.expiry_date) && (
                      <span className="badge badge-sale">{NEAR_EXPIRY_PERCENT_OFF}% off</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
              <button className="btn-primary" onClick={() => onAdd(quantity)} autoFocus>
                Add to basket
              </button>
            </>
          ) : (
            <span className="product-details-note">
              {product.stock_quantity <= 0 ? 'Out of stock.' : 'All available stock is already in the basket.'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
