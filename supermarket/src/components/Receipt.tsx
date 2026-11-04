// Receipt.tsx: the receipt pop-up shown after a sale, which can also be
// printed or downloaded as a PDF.
//
// Last step of the checkout flow. POS.tsx sends the basket to the database
// (process_pos_checkout), and the database sends back a CheckoutReceipt:
// the saved order number, every line with the price actually charged, the
// totals, and the member's new points balance. POS keeps it in its `receipt`
// state and shows this component until the cashier closes it.
//
// Every number here comes from the database, not from the POS preview, so
// the receipt always matches what was really saved.
//
// The receipt reads top to bottom like a paper one, most important last:
//   shop name + logo -> receipt number and time -> member -> items
//   -> subtotal and discounts -> TOTAL PAID (the biggest line) -> how it was
//   paid -> loyalty points -> thank-you line.
//
// Three buttons:
//   Close         closes it (Escape does too; clicking the dark background
//                 does nothing, so a receipt isn't lost by a stray click).
//   Print         the browser's print window, set up by the print rules in
//                 App.css so ONLY the receipt prints, at receipt width.
//   Download PDF  saves receipt-<number>.pdf straight away (see downloadPdf).
//
// It's a hand-built pop-up (not ui/dialog.tsx), drawn into document.body
// with a "portal" (createPortal) instead of inside the POS. That lets the
// print rules hide the whole app (#root) and leave just the receipt, with no
// blank second page.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, LoaderCircle, Printer, X } from 'lucide-react';
import type { CheckoutReceipt } from '../types/app';
import { PESO_VALUE_PER_POINT } from '../lib/loyalty';
import { useNotify } from '../contexts/NotifyContext';
import { Button } from './ui/button';

interface ReceiptProps {
  // What the database sent back for the saved sale.
  receipt: CheckoutReceipt;
  // The cash the customer handed over (null for Card / Points), used to
  // show the change. POS passes receipt.cash_received here.
  cashReceived: number | null;
  // Called when the receipt should close (POS then clears its `receipt` state).
  onClose: () => void;
}

// Pesos with thousands separators and 2 decimals, e.g. ₱1,234.50.
const money = (amount: number) =>
  `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// The order's date and time, in Philippine time whatever time zone the
// computer is set to: "Nov 1, 2026" and "8:23 PM".
const dateFormat = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' });
const timeFormat = new Intl.DateTimeFormat('en-PH', { timeStyle: 'short', timeZone: 'Asia/Manila' });

// How the payment method is written on the receipt.
const PAID_BY: Record<CheckoutReceipt['payment_method'], string> = {
  Cash: 'Cash',
  Card: 'Card',
  'Loyalty Points': 'Loyalty points',
};

// The PDF is the width of a till receipt roll: 80 mm.
const PDF_WIDTH_MM = 80;

// Small grey heading inside the receipt, e.g. "ITEMS (3)".
function SectionLabel({ children }: { children: string }) {
  return <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-ink-muted uppercase">{children}</h3>;
}

// One "label ........ amount" line. `className` changes its colour or weight.
function Line({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`flex justify-between gap-3 ${className ?? ''}`}>
      <dt>{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

export default function Receipt({ receipt, cashReceived, onClose }: ReceiptProps) {
  const { notify } = useNotify();
  // The receipt "paper" (everything between the buttons and the bottom).
  // useRef gives a box whose .current is that element once it's on screen;
  // downloadPdf takes its picture.
  const paperRef = useRef<HTMLDivElement>(null);
  // True while the PDF is being made, so the button can show a spinner.
  const [savingPdf, setSavingPdf] = useState(false);

  const savedAt = new Date(receipt.created_at);
  // How many units were bought in total (3 milk + 2 bread = 5).
  const unitCount = receipt.items.reduce((sum, item) => sum + item.quantity, 0);

  // Escape closes the receipt, like the other pop-up windows.
  // useEffect runs code after the component appears on screen. Here it starts
  // listening for key presses on the whole window, and the function it
  // returns ("cleanup") stops listening when the receipt closes, or just
  // before the effect runs again because onClose changed. That way old
  // listeners don't pile up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // "Download PDF": takes a sharp picture of the receipt paper exactly as it
  // looks on screen (fonts, ₱ signs and logo included) and puts it on an
  // 80 mm wide PDF page as tall as the receipt, then the browser downloads it.
  //   html-to-image  draws an element into a PNG picture. pixelRatio 3 makes
  //                  it 3× sharper than the screen, so it prints crisply.
  //   jspdf          builds the PDF file around that picture.
  // Both are loaded only now, with import(), so they aren't downloaded until
  // someone actually wants a PDF. If anything fails, a message suggests the
  // Print button instead (the print window can also "Save as PDF").
  const downloadPdf = async () => {
    const paper = paperRef.current;
    if (!paper || savingPdf) return;
    setSavingPdf(true);
    try {
      const [{ toPng }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
      const picture = await toPng(paper, { pixelRatio: 3, backgroundColor: '#ffffff' });
      // Keep the receipt's shape: height in mm = width in mm × (height ÷ width on screen).
      const heightMm = (paper.offsetHeight / paper.offsetWidth) * PDF_WIDTH_MM;
      const pdf = new jsPDF({ unit: 'mm', format: [PDF_WIDTH_MM, heightMm], orientation: 'portrait' });
      pdf.setProperties({ title: `SuperMarket Express receipt #${receipt.order_id}` });
      pdf.addImage(picture, 'PNG', 0, 0, PDF_WIDTH_MM, heightMm);
      pdf.save(`receipt-${receipt.order_id}.pdf`);
    } catch (err) {
      console.error('Could not make the receipt PDF:', err);
      notify('Could not create the PDF. Use Print and choose "Save as PDF" instead.', 'error');
    } finally {
      setSavingPdf(false);
    }
  };

  // createPortal(what, where) draws the pop-up straight into <body>, outside
  // the app's #root element (see the note at the top of the file).
  return createPortal(
    // receipt-print-overlay / receipt-print-root / receipt-print-scroll are
    // used by the print rules in App.css.
    <div className="receipt-print-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <section
        className="receipt-print-root flex max-h-[92vh] w-full max-w-sm flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-title"
      >
        {/* Buttons (never printed). "Download PDF" starts with the keyboard
            focus (autoFocus), so pressing Enter downloads it straight away. */}
        <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-subtle px-4 py-3 print:hidden">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X aria-hidden="true" />
            Close
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer aria-hidden="true" />
              Print
            </Button>
            <Button size="sm" onClick={downloadPdf} disabled={savingPdf} autoFocus>
              {savingPdf ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
              {savingPdf ? 'Saving…' : 'Download PDF'}
            </Button>
          </div>
        </div>

        {/* The receipt paper. The outer box scrolls on screen if the receipt
            is long; the paper inside keeps its full height, so the PDF
            picture and the printout always include every line. */}
        <div className="receipt-print-scroll overflow-y-auto">
          <div ref={paperRef} className="bg-white px-6 pt-7 pb-6 text-sm text-ink tabular-nums">
            {/* ── Shop ── */}
            <header className="flex flex-col items-center text-center">
              <img src="/logo.svg" alt="" className="size-11" />
              <h2 id="receipt-title" className="mt-2 text-base font-bold tracking-tight">
                SuperMarket <span className="text-brand-strong">Express</span>
              </h2>
              <p className="text-xs text-ink-muted">Official receipt</p>
            </header>

            {/* ── Receipt number and when ── */}
            <div className="mt-5 flex items-end justify-between gap-3 border-y border-dashed border-gray-300 py-3">
              <div>
                <div className="text-[11px] font-semibold tracking-wider text-ink-muted uppercase">Receipt no.</div>
                <div className="text-lg leading-tight font-bold">#{receipt.order_id}</div>
              </div>
              <time className="text-right text-xs leading-snug text-ink-muted" dateTime={receipt.created_at}>
                {dateFormat.format(savedAt)}
                <br />
                {timeFormat.format(savedAt)} PHT
              </time>
            </div>

            {/* ── Member: name, then loyalty ID (or email if they have no ID) ── */}
            <div className="flex items-start justify-between gap-3 border-b border-dashed border-gray-300 py-3 text-xs">
              <span className="text-ink-muted">Member</span>
              <span className="min-w-0 text-right">
                <strong className="block text-sm font-semibold break-all text-ink">{receipt.member_name}</strong>
                <span className="font-mono text-ink-muted">{receipt.member_loyalty_id ?? receipt.member_email}</span>
              </span>
            </div>

            {/* ── Items ── */}
            {/* One entry per saved order line: the name and line total on top,
                "qty × price each" underneath. A near-expiry line shows the
                normal price struck through and the discount in amber. The
                same product can appear twice (e.g. 2 marked-down + 1 full
                price, or two batches), so the key adds the position (index)
                to the name to stay unique. */}
            <section className="border-b border-dashed border-gray-300 py-3">
              <SectionLabel>{`Items (${unitCount})`}</SectionLabel>
              <ul className="space-y-2.5">
                {receipt.items.map((item, index) => {
                  const markedDown = item.near_expiry_discount > 0;
                  return (
                    <li key={`${item.product_name}-${index}`}>
                      <div className="flex justify-between gap-3 font-semibold">
                        <span className="min-w-0">{item.product_name}</span>
                        <span>{money(item.subtotal)}</span>
                      </div>
                      <div className="text-xs text-ink-muted">
                        {item.quantity} × {money(item.unit_price)}
                        {markedDown && <s className="ml-1.5 text-ink-subtle">{money(item.original_unit_price)}</s>}
                        {item.batch_code && <span className="font-mono"> · Batch {item.batch_code}</span>}
                      </div>
                      {markedDown && (
                        <div className="text-xs font-medium text-warning-strong">
                          {item.near_expiry_percent_off}% near-expiry discount −{money(item.near_expiry_discount)}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* ── Totals ── */}
            {/* Subtotal at normal prices, minus the discounts (only shown when
                there are any), then the one number that matters most, TOTAL
                PAID, between two solid rules. */}
            <dl className="space-y-1 py-3 text-ink-muted">
              <Line label="Subtotal" value={money(receipt.subtotal)} />
              {receipt.near_expiry_savings > 0 && (
                <Line label="Near-expiry discount" value={`−${money(receipt.near_expiry_savings)}`} className="text-warning-strong" />
              )}
              {receipt.points_discount > 0 && (
                <Line
                  label={`Points (${receipt.points_redeemed} × ₱${PESO_VALUE_PER_POINT})`}
                  value={`−${money(receipt.points_discount)}`}
                  className="text-brand-strong"
                />
              )}
            </dl>
            <div className="flex items-baseline justify-between gap-3 border-y-2 border-ink py-3">
              <span className="text-sm font-bold tracking-wide uppercase">Total paid</span>
              <span className="text-2xl font-extrabold tracking-tight">{money(receipt.total_paid)}</span>
            </div>

            {/* ── Payment. For cash, the change is cash received − total paid. ── */}
            <dl className="space-y-1 border-b border-dashed border-gray-300 py-3">
              {/* "Cash + loyalty points" when points paid part of the bill. */}
              <Line
                label="Paid by"
                value={
                  PAID_BY[receipt.payment_method] +
                  (receipt.payment_method !== 'Loyalty Points' && receipt.points_redeemed > 0 ? ' + loyalty points' : '')
                }
              />
              {receipt.payment_method === 'Cash' && cashReceived !== null && (
                <>
                  <Line label="Cash received" value={money(cashReceived)} className="text-ink-muted" />
                  <Line label="Change" value={money(cashReceived - receipt.total_paid)} className="font-semibold" />
                </>
              )}
            </dl>

            {/* ── Loyalty points: used, earned (1 per full ₱100 actually paid,
                worked out by the database) and the new, already-saved balance. ── */}
            <section className="border-b border-dashed border-gray-300 py-3">
              <SectionLabel>Loyalty points</SectionLabel>
              <div className="grid grid-cols-3 text-center">
                <div>
                  <div className="text-[11px] text-ink-muted">Used</div>
                  <div className="font-bold">{receipt.points_redeemed > 0 ? `−${receipt.points_redeemed}` : '0'}</div>
                </div>
                <div>
                  <div className="text-[11px] text-ink-muted">Earned</div>
                  <div className="font-bold text-brand-strong">+{receipt.points_earned}</div>
                </div>
                <div>
                  <div className="text-[11px] text-ink-muted">New balance</div>
                  <div className="font-bold">{receipt.points_balance}</div>
                </div>
              </div>
            </section>

            <footer className="pt-4 text-center text-xs leading-relaxed text-ink-muted">
              <p className="font-semibold text-ink">Thank you for shopping with us!</p>
              <p>Earn 1 point for every ₱100 paid. Each point takes ₱{PESO_VALUE_PER_POINT} off.</p>
            </footer>
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}
