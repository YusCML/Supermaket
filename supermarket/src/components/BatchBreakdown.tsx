import type { ProductBatch } from '../types/app';
import { formatExpiry, isNearExpiry } from '../lib/expiry';

interface BatchBreakdownProps {
  // A product's sellable batches, in the order they're sold (use
  // sellableBatches() from lib/expiry). Their counts add up to the stock total.
  batches: ProductBatch[];
}

// Shows how a product's stock is split across its batches, e.g. a total of 13
// as "B-3: 10 · B-1: 3". Near-expiry batches (15% off) are shown in amber.
// Built from <span>s (not <div>s) so it can sit inside a button, like the
// product cards at checkout.
export default function BatchBreakdown({ batches }: BatchBreakdownProps) {
  if (batches.length === 0) return null;

  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
      {batches.map((batch, index) => {
        const nearExpiry = isNearExpiry(batch.expiry_date);

        return (
          <span key={batch.id} className="inline-flex items-center text-[11px] font-medium">
            {/* Dot separator between batches */}
            {index > 0 && <span className="mr-1.5 text-ink-subtle" aria-hidden="true">·</span>}

            <span
              className={`font-mono ${nearExpiry ? 'font-bold text-warning-strong' : 'text-ink-muted'}`}
              title={`Batch ${batch.batch_code}: ${batch.quantity_remaining} left · ${formatExpiry(batch.expiry_date)}`}
            >
              {batch.batch_code}: {batch.quantity_remaining}
            </span>
          </span>
        );
      })}
    </span>
  );
}
