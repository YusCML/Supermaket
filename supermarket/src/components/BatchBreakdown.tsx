// BatchBreakdown.tsx: a one-line "stock per batch" summary.
//
// Stock arrives in batches, each with its own expiry date (see the
// product_batches table in STUDY_GUIDE.md). This small component lists how
// many units are left in each batch. It's used in the Inventory table's
// stock column, under the product's total.
import type { ProductBatch } from '../types/app';
import { formatExpiry, isNearExpiry } from '../lib/expiry';

// Props = the inputs a parent passes to this component.
interface BatchBreakdownProps {
  // A product's sellable batches, in the order they're sold (use
  // sellableBatches() from lib/expiry). Their counts add up to the stock total.
  batches: ProductBatch[];
}

// Shows how a product's stock is split across its batches, e.g. a total of 13
// as "B-3: 10 · B-1: 3". Near-expiry batches (15% off) are shown in amber.
// Built from <span>s (not <div>s) so it's also allowed inside a button or
// other inline element (HTML doesn't allow a <div> inside a <button>).
// Today it's only used in the Inventory table; the checkout menu doesn't
// show it.
export default function BatchBreakdown({ batches }: BatchBreakdownProps) {
  // No batches -> show nothing at all (returning null draws nothing).
  if (batches.length === 0) return null;

  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
      {batches.map((batch, index) => {
        // Expires within 7 days (but not yet) -> this batch sells at 15% off.
        const nearExpiry = isNearExpiry(batch.expiry_date);

        return (
          // key: React needs a unique key on each item of a list so it can
          // tell the items apart when the list changes. The batch id is unique.
          <span key={batch.id} className="inline-flex items-center text-[11px] font-medium">
            {/* Dot separator between batches */}
            {index > 0 && <span className="mr-1.5 text-ink-subtle" aria-hidden="true">·</span>}

            {/* "B-3: 10". Hovering shows a tooltip (title) with the expiry. */}
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
