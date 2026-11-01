import type { ProductBatch } from '../types/app';
import { formatExpiry, isNearExpiry } from '../lib/expiry';

interface BatchBreakdownProps {
  // A product's sellable batches, in the order they're sold (use
  // sellableBatches() from lib/expiry). Their counts add up to the stock total.
  batches: ProductBatch[];
}

// Shows how a product's stock is split across its batches, e.g. a total of 13
// as "B-3: 10 · B-1: 3". Near-expiry batches (15% off) are shown in amber.
export default function BatchBreakdown({ batches }: BatchBreakdownProps) {
  if (batches.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mt-1">
      {batches.map((batch, index) => {
        const nearExpiry = isNearExpiry(batch.expiry_date);
        
        return (
          <span key={batch.id} className="inline-flex items-center text-[10px] font-medium">
            {/* Add a dot separator between batches */}
            {index > 0 && <span className="text-[#333333]/30 mr-1.5">·</span>}
            
            <span 
              className={`font-mono ${nearExpiry ? 'text-amber-700 font-bold' : 'text-[#333333]/70'}`}
              title={`Batch ${batch.batch_code}: ${batch.quantity_remaining} left · ${formatExpiry(batch.expiry_date)}`}
            >
              {batch.batch_code}: {batch.quantity_remaining}
            </span>
          </span>
        );
      })}
    </div>
  );
}