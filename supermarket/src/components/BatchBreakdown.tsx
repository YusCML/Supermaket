import type { ProductBatch } from '../types/app';
import { formatExpiry, isNearExpiry } from '../lib/expiry';

interface BatchBreakdownProps {
  // A product's sellable batches, in the order they're sold (use
  // sellableBatches() from lib/expiry). Their counts add up to the stock total.
  batches: ProductBatch[];
}

// Shows how a product's stock is split across its batches, e.g. a total of 13
// as "B-3: 10" and "B-1: 3". Near-expiry batches (15% off) are shown in red.
// Hover a chip to see its expiry.
export default function BatchBreakdown({ batches }: BatchBreakdownProps) {
  if (batches.length === 0) return null;

  return (
    <div className="batch-breakdown">
      {batches.map((batch) => (
        <span
          key={batch.id}
          className={`batch-chip${isNearExpiry(batch.expiry_date) ? ' is-near-expiry' : ''}`}
          title={`Batch ${batch.batch_code}: ${batch.quantity_remaining} left · ${formatExpiry(batch.expiry_date)}`}
        >
          {batch.batch_code}: {batch.quantity_remaining}
        </span>
      ))}
    </div>
  );
}
