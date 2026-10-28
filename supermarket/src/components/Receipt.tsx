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
    <div className="receipt-overlay">
      <section className="receipt-print-root" role="dialog" aria-modal="true" aria-labelledby="receipt-title">
        <div className="receipt-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
          <button type="button" className="btn-primary" onClick={() => window.print()}>Print</button>
        </div>
        <article className="receipt">
          <header className="receipt-header">
            <h2 id="receipt-title">SuperMarket Express</h2>
            <strong>Receipt #{receipt.order_id}</strong>
            <time dateTime={receipt.created_at}>{date} PHT</time>
          </header>

          <div className="receipt-member">
            <span>Member</span>
            <strong>{receipt.member_name}</strong>
            {receipt.member_loyalty_id && <small>{receipt.member_loyalty_id}</small>}
            {!receipt.member_loyalty_id && <small>{receipt.member_email}</small>}
          </div>

          <div className="receipt-items">
            {receipt.items.map((item, index) => (
              <div className="receipt-item" key={`${item.product_name}-${index}`}>
                <div className="receipt-item-heading">
                  <strong>{item.product_name}</strong>
                  {item.batch_code && <small>Batch {item.batch_code}</small>}
                </div>
                <div className="receipt-item-math">
                  {item.quantity} × {money(item.original_unit_price)} ={' '}
                  {money(item.quantity * item.original_unit_price)}
                </div>
                {item.near_expiry_discount > 0 && (
                  <div className="receipt-discount">
                    {item.near_expiry_percent_off}% near-expiry discount: −{money(item.near_expiry_discount)}
                    <span>Charged {money(item.subtotal)}</span>
                  </div>
                )}
                {item.near_expiry_discount <= 0 && (
                  <div className="receipt-item-total">Line total: {money(item.subtotal)}</div>
                )}
              </div>
            ))}
          </div>

          <div className="receipt-totals">
            <div><span>Subtotal</span><strong>{money(receipt.subtotal)}</strong></div>
            {receipt.near_expiry_savings > 0 && (
              <div><span>Near-expiry discount</span><strong>−{money(receipt.near_expiry_savings)}</strong></div>
            )}
            {receipt.points_discount > 0 && (
              <div><span>Points discount</span><strong>−{money(receipt.points_discount)}</strong></div>
            )}
            <div className="receipt-total-paid"><span>Total paid</span><strong>{money(receipt.total_paid)}</strong></div>
          </div>

          <div className="receipt-payment">
            <div><span>Payment method</span><strong>{receipt.payment_method}</strong></div>
            {receipt.payment_method === 'Cash' && cashReceived !== null && (
              <>
                <div><span>Cash received</span><strong>{money(cashReceived)}</strong></div>
                <div><span>Change</span><strong>{money(cashReceived - receipt.total_paid)}</strong></div>
              </>
            )}
          </div>

          <footer className="receipt-points">
            <div><span>Points redeemed</span><strong>{receipt.points_redeemed}</strong></div>
            <div><span>Points earned</span><strong>{receipt.points_earned}</strong></div>
            <div><span>New points balance</span><strong>{receipt.points_balance}</strong></div>
          </footer>
        </article>
      </section>
    </div>
  );
}
