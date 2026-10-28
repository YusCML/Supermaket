import type { CheckoutReceipt } from '../types/app';

interface ReceiptProps {
  receipt: CheckoutReceipt;
  cashReceived: number | null;
  onClose: () => void;
}

const money = (amount: number) =>
  `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Receipt({ receipt, cashReceived, onClose }: ReceiptProps) {
  const date = new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(new Date(receipt.created_at));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 font-sans antialiased text-[#333333] selection:bg-[#2E7D32]/15 selection:text-[#2E7D32] print:bg-white print:p-0">
      <section
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-[#FFFFFF] shadow-xl print:max-h-none print:w-full print:max-w-none print:rounded-none print:border-none print:shadow-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-title"
      >
        {/* Actions header (Hidden when printing) */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-[#F5F5F5] px-6 py-3.5 print:hidden">
          <button
            type="button"
            className="rounded-lg border border-gray-300 bg-[#FFFFFF] px-3.5 py-1.5 text-xs font-semibold text-[#333333] shadow-2xs hover:bg-[#F5F5F5] transition-colors"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="rounded-lg bg-[#2E7D32] px-4 py-1.5 text-xs font-semibold text-[#FFFFFF] shadow-2xs hover:bg-[#246628] transition-colors"
            onClick={() => window.print()}
          >
            Print
          </button>
        </div>

        {/* Printable Receipt Body */}
        <article className="overflow-y-auto p-6 space-y-5 text-xs text-[#333333] print:overflow-visible print:p-0">
          {/* Header */}
          <header className="text-center pb-4 border-b border-dashed border-gray-200 space-y-1">
            <h2 id="receipt-title" className="text-lg font-bold tracking-tight text-[#333333]">
              SuperMarket Express
            </h2>
            <div className="font-semibold text-[#333333]/80">Receipt #{receipt.order_id}</div>
            <time className="block text-[11px] text-[#333333]/60" dateTime={receipt.created_at}>
              {date} PHT
            </time>
          </header>

          {/* Member Info */}
          <div className="flex flex-col rounded-xl bg-[#F5F5F5] p-3 text-center space-y-0.5 border border-gray-200/60">
            <span className="text-[10px] font-bold text-[#333333]/50 uppercase tracking-wider">
              Member
            </span>
            <strong className="text-sm font-semibold text-[#333333]">{receipt.member_name}</strong>
            {receipt.member_loyalty_id && (
              <small className="text-[11px] font-mono text-[#2E7D32] font-medium">
                {receipt.member_loyalty_id}
              </small>
            )}
            {!receipt.member_loyalty_id && (
              <small className="text-[11px] text-[#333333]/70">{receipt.member_email}</small>
            )}
          </div>

          {/* Purchased Items */}
          <div className="space-y-3 divide-y divide-gray-100 border-b border-dashed border-gray-200 pb-4">
            {receipt.items.map((item, index) => (
              <div
                className="pt-2 first:pt-0 space-y-1"
                key={`${item.product_name}-${index}`}
              >
                <div className="flex justify-between items-baseline font-semibold text-[#333333]">
                  <span>{item.product_name}</span>
                  {item.batch_code && (
                    <small className="font-mono text-[10px] text-[#333333]/50">
                      Batch {item.batch_code}
                    </small>
                  )}
                </div>
                <div className="text-[11px] text-[#333333]/70">
                  {item.quantity} × {money(item.original_unit_price)} ={' '}
                  {money(item.quantity * item.original_unit_price)}
                </div>
                {item.near_expiry_discount > 0 && (
                  <div className="flex items-center justify-between text-[11px] font-medium text-amber-700 bg-amber-50 rounded-md p-1.5 border border-amber-200/60">
                    <span>
                      {item.near_expiry_percent_off}% near-expiry discount: −
                      {money(item.near_expiry_discount)}
                    </span>
                    <span className="font-semibold">Charged {money(item.subtotal)}</span>
                  </div>
                )}
                {item.near_expiry_discount <= 0 && (
                  <div className="text-[11px] font-medium text-right text-[#333333]">
                    Line total: {money(item.subtotal)}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Totals Breakdown */}
          <div className="space-y-1.5 border-b border-dashed border-gray-200 pb-4">
            <div className="flex justify-between text-[#333333]/80">
              <span>Subtotal</span>
              <strong className="font-semibold text-[#333333]">{money(receipt.subtotal)}</strong>
            </div>
            {receipt.near_expiry_savings > 0 && (
              <div className="flex justify-between text-amber-700">
                <span>Near-expiry discount</span>
                <strong className="font-semibold">−{money(receipt.near_expiry_savings)}</strong>
              </div>
            )}
            {receipt.points_discount > 0 && (
              <div className="flex justify-between text-[#2E7D32]">
                <span>Points discount</span>
                <strong className="font-semibold">−{money(receipt.points_discount)}</strong>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold text-[#333333] pt-1">
              <span>Total paid</span>
              <strong className="text-[#2E7D32]">{money(receipt.total_paid)}</strong>
            </div>
          </div>

          {/* Payment Method Details */}
          <div className="space-y-1.5 border-b border-dashed border-gray-200 pb-4 text-[#333333]/80">
            <div className="flex justify-between">
              <span>Payment method</span>
              <strong className="font-semibold text-[#333333]">{receipt.payment_method}</strong>
            </div>
            {receipt.payment_method === 'Cash' && cashReceived !== null && (
              <>
                <div className="flex justify-between">
                  <span>Cash received</span>
                  <strong className="font-semibold text-[#333333]">{money(cashReceived)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Change</span>
                  <strong className="font-semibold text-[#333333]">
                    {money(cashReceived - receipt.total_paid)}
                  </strong>
                </div>
              </>
            )}
          </div>

          {/* Loyalty Points Footer */}
          <footer className="space-y-1.5 rounded-xl bg-[#2E7D32]/5 p-3 border border-[#2E7D32]/20 text-[#333333]/80">
            <div className="flex justify-between">
              <span>Points redeemed</span>
              <strong className="font-semibold text-[#333333]">{receipt.points_redeemed}</strong>
            </div>
            <div className="flex justify-between">
              <span>Points earned</span>
              <strong className="font-semibold text-[#2E7D32]">+{receipt.points_earned}</strong>
            </div>
            <div className="flex justify-between border-t border-[#2E7D32]/20 pt-1 font-semibold text-[#333333]">
              <span>New points balance</span>
              <strong className="text-[#2E7D32]">{receipt.points_balance}</strong>
            </div>
          </footer>
        </article>
      </section>
    </div>
  );
}