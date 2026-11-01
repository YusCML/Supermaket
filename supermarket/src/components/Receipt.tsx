import { useEffect } from 'react';
import { Printer, X } from 'lucide-react';
import type { CheckoutReceipt } from '../types/app';
import { Button } from './ui/button';

interface ReceiptProps {
  receipt: CheckoutReceipt;
  cashReceived: number | null;
  onClose: () => void;
}

const money = (amount: number) =>
  `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// One "label ........ amount" line on the receipt.
function Row({ label, value, className }: { label: string; value: string | number; className?: string }) {
  return (
    <div className={`flex justify-between gap-3 ${className ?? ''}`}>
      <span>{label}</span>
      <strong className="font-semibold">{value}</strong>
    </div>
  );
}

export default function Receipt({ receipt, cashReceived, onClose }: ReceiptProps) {
  const date = new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(new Date(receipt.created_at));

  // Escape closes the receipt, like the other pop-up windows.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    // receipt-print-overlay / receipt-print-root are used by the print rules in
    // App.css: when printing, everything else on the page is hidden so only
    // the receipt comes out of the printer.
    <div className="receipt-print-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <section
        className="receipt-print-root flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl print:max-w-none print:rounded-none print:border-none print:shadow-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-title"
      >
        {/* Buttons (not printed) */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-subtle px-6 py-3 print:hidden">
          <Button variant="outline" size="sm" onClick={onClose}>
            <X aria-hidden="true" />
            Close
          </Button>
          <Button size="sm" onClick={() => window.print()} autoFocus>
            <Printer aria-hidden="true" />
            Print receipt
          </Button>
        </div>

        {/* The receipt itself */}
        <article className="space-y-5 overflow-y-auto p-6 text-sm text-ink tabular-nums print:overflow-visible print:p-0">
          <header className="space-y-1 border-b border-dashed border-gray-300 pb-4 text-center">
            <h2 id="receipt-title" className="text-lg font-bold tracking-tight">
              SuperMarket Express
            </h2>
            <div className="font-semibold text-ink-muted">Receipt #{receipt.order_id}</div>
            <time className="block text-xs text-ink-muted" dateTime={receipt.created_at}>
              {date} PHT
            </time>
          </header>

          {/* Member */}
          <div className="flex flex-col items-center rounded-md border border-gray-200 bg-subtle p-3 text-center">
            <span className="text-xs text-ink-muted">Member</span>
            <strong className="font-semibold">{receipt.member_name}</strong>
            {receipt.member_loyalty_id ? (
              <small className="font-mono text-xs font-medium text-brand-strong">{receipt.member_loyalty_id}</small>
            ) : (
              <small className="text-xs text-ink-muted">{receipt.member_email}</small>
            )}
          </div>

          {/* Items */}
          <div className="divide-y divide-gray-100 border-b border-dashed border-gray-300 pb-4">
            {receipt.items.map((item, index) => (
              <div className="space-y-1 py-2 first:pt-0" key={`${item.product_name}-${index}`}>
                <div className="flex items-baseline justify-between gap-2 font-semibold">
                  <span>{item.product_name}</span>
                  {item.batch_code && (
                    <small className="font-mono text-[11px] font-normal text-ink-muted">Batch {item.batch_code}</small>
                  )}
                </div>
                <div className="text-xs text-ink-muted">
                  {item.quantity} × {money(item.original_unit_price)} = {money(item.quantity * item.original_unit_price)}
                </div>
                {item.near_expiry_discount > 0 ? (
                  <div className="flex items-center justify-between rounded-sm border border-warning/50 bg-warning/15 p-1.5 text-xs font-medium text-warning-strong">
                    <span>
                      {item.near_expiry_percent_off}% near-expiry discount: −{money(item.near_expiry_discount)}
                    </span>
                    <span className="font-semibold">Charged {money(item.subtotal)}</span>
                  </div>
                ) : (
                  <div className="text-right text-xs font-medium">Line total: {money(item.subtotal)}</div>
                )}
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="space-y-1.5 border-b border-dashed border-gray-300 pb-4">
            <Row label="Subtotal" value={money(receipt.subtotal)} className="text-ink-muted" />
            {receipt.near_expiry_savings > 0 && (
              <Row label="Near-expiry discount" value={`−${money(receipt.near_expiry_savings)}`} className="text-warning-strong" />
            )}
            {receipt.points_discount > 0 && (
              <Row label="Points discount" value={`−${money(receipt.points_discount)}`} className="text-brand-strong" />
            )}
            <div className="flex justify-between pt-1 text-base font-bold">
              <span>Total paid</span>
              <strong className="text-brand-strong">{money(receipt.total_paid)}</strong>
            </div>
          </div>

          {/* Payment */}
          <div className="space-y-1.5 border-b border-dashed border-gray-300 pb-4">
            <Row label="Payment method" value={receipt.payment_method} />
            {receipt.payment_method === 'Cash' && cashReceived !== null && (
              <>
                <Row label="Cash received" value={money(cashReceived)} />
                <Row label="Change" value={money(cashReceived - receipt.total_paid)} />
              </>
            )}
          </div>

          {/* Loyalty points */}
          <footer className="space-y-1.5 rounded-md border border-brand/20 bg-brand/5 p-3">
            <Row label="Points redeemed" value={receipt.points_redeemed} />
            <Row label="Points earned" value={`+${receipt.points_earned}`} className="text-brand-strong" />
            <Row label="New points balance" value={receipt.points_balance} className="border-t border-brand/20 pt-1" />
          </footer>
        </article>
      </section>
    </div>
  );
}
