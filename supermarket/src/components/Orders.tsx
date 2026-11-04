// Orders.tsx: the admin's "Orders" tab, a history of every sale.
//
// Where the data comes from (all loaded by AdminPage.tsx):
//   orders     api.getOrders(): the sales and their lines (admins only)
//   customers  api.getCustomers(): to show the member's name for each sale
//   logs       api.getLoyaltyLogs(): to show the points EARNED on each sale
//   batches    api.getProductBatches(): to show the batch code on each line
//   products   api.getProducts(): a fallback name for very old lines
//
// Each order line remembers its product's name, normal price and cost FROM
// THE MOMENT OF SALE (see OrderLine in types/app.ts), so this history never
// changes when someone edits a product later.
//
// Loyalty.tsx links here: clicking an order number in the audit log opens this
// tab with that order searched for and opened.
import { Fragment, useState } from 'react';
import { ChevronDown, RefreshCw, Search } from 'lucide-react';
import type { Customer, LoyaltyLog, Order, Product, ProductBatch } from '../types/app';
import { NEAR_EXPIRY_PERCENT_OFF } from '../lib/pricing';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { RichSelect } from './ui/rich-select';
import { StatusText } from './ui/status-text';
import PageHeader from './PageHeader';
import LoadingPanel from './LoadingPanel';

interface OrdersProps {
  orders: Order[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  customers: Customer[];
  logs: LoyaltyLog[];
  batches: ProductBatch[];
  products: Product[];
  // What to put in the search box when the tab opens, e.g. "#12" when coming
  // from an order number in the Loyalty audit log.
  initialSearch?: string;
}

// ₱1,234.50
const money = (amount: number) =>
  `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// "Nov 1, 2026, 3:45 PM" in Philippine time (the store's time zone).
const dateTime = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });

// "2026-11-01": the Philippine calendar date of a moment. Used by the
// "Today" filter, so "today" means the store's today, not the computer's.
const manilaDay = (moment: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(moment); //"YYYY-MM-DD"

type Period = 'today' | '7' | '30' | 'all';
const PERIOD_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: 'all', label: 'All loaded orders' },
];
// The payment filter. Cash and Card include sales where points paid part of
// the bill; "Paid fully with points" is the 'Loyalty Points' method; "Used
// points" is any sale where points took something off, whatever the method.
const PAYMENT_OPTIONS = [
  { value: 'all', label: 'All payments' },
  { value: 'Cash', label: 'Cash' },
  { value: 'Card', label: 'Card' },
  { value: 'Loyalty Points', label: 'Paid fully with points' },
  { value: 'used-points', label: 'Used points' },
];

// How an order's payment is written. Points are a discount that works with
// Cash or Card, so a sale where they took something off reads "Cash + Points".
// A sale paid entirely with points is saved with the method 'Loyalty Points'.
function paymentLabel(order: Order): string {
  if (order.payment_method === 'Loyalty Points') return 'Loyalty Points';
  return order.points_redeemed > 0 ? `${order.payment_method} + Points` : order.payment_method;
}

// True if the order was made inside the chosen period.
function inPeriod(order: Order, period: Period): boolean {
  if (period === 'all') return true;
  const made = new Date(order.created_at);
  if (period === 'today') return manilaDay(made) === manilaDay(new Date());
  const days = Number(period);
  return Date.now() - made.getTime() <= days * 24 * 60 * 60 * 1000;
}

export default function Orders({
  orders,
  loading,
  error,
  onRefresh,
  customers,
  logs,
  batches,
  products,
  initialSearch = '',
}: OrdersProps) {
  const [search, setSearch] = useState(initialSearch);
  const [payment, setPayment] = useState('all');
  const [period, setPeriod] = useState<Period>('30');
  // Which orders are opened up to show their lines. Coming from the audit log
  // ("#12"), that order starts opened.
  const [openOrders, setOpenOrders] = useState<Set<number>>(() => {
    const id = Number(initialSearch.replace('#', ''));
    return initialSearch.startsWith('#') && id ? new Set([id]) : new Set();
  });

  const toggleOrder = (orderId: number) => {
    setOpenOrders((previous) => {
      const next = new Set(previous);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  // Look-up tables (id -> thing), built once per render, so each row doesn't
  // search through the whole list again.
  const memberById = new Map(customers.map((member) => [member.id, member]));
  const batchCodeById = new Map(batches.map((batch) => [batch.id, batch.batch_code]));
  const productNameById = new Map(products.map((product) => [product.id, product.name]));
  // Points EARNED per order, from the loyalty audit log.
  const pointsEarnedByOrder = new Map<number, number>();
  for (const log of logs) {
    if (log.type === 'EARNED' && log.order_id) {
      pointsEarnedByOrder.set(log.order_id, (pointsEarnedByOrder.get(log.order_id) ?? 0) + log.points_changed);
    }
  }

  const memberName = (order: Order) => {
    const member = order.customer_id ? memberById.get(order.customer_id) : undefined;
    return member ? member.name || member.email : 'Unknown member';
  };

  // ── Filtering ──
  // "#12" (or just "12") finds that order number exactly; any other text is
  // searched in the member's name, email and loyalty ID.
  const query = search.trim().toLowerCase();
  const orderNumber = /^#?\d+$/.test(query) ? Number(query.replace('#', '')) : null;
  const visibleOrders = orders.filter((order) => {
    // An exact order number ignores the period and payment filters, so an
    // order opened from the audit log always shows up.
    if (orderNumber !== null) return order.id === orderNumber;
    if (!inPeriod(order, period)) return false;
    if (payment === 'used-points' && order.points_redeemed <= 0) return false;
    if (payment !== 'all' && payment !== 'used-points' && order.payment_method !== payment) return false;
    if (!query) return true;
    const member = order.customer_id ? memberById.get(order.customer_id) : undefined;
    return [member?.name, member?.email, member?.loyalty_id].some((text) => (text ?? '').toLowerCase().includes(query));
  });
  const totalTakenIn = visibleOrders.reduce((sum, order) => sum + order.final_amount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description="Every sale, newest first. Click an order to see exactly what was bought and what was charged."
        actions={
          <Button variant="outline" onClick={() => onRefresh()} disabled={loading}>
            <RefreshCw aria-hidden="true" className={loading ? 'animate-spin' : undefined} />
            Refresh
          </Button>
        }
      />

      {/* ── Search and filters ── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="relative lg:w-80">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-subtle"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Search orders"
            maxLength={100}
            placeholder="Order # or member name, email, ID…"
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <RichSelect
          label="Period"
          hideLabel
          className="lg:w-48"
          placeholder="Period"
          value={period}
          onValueChange={(value) => setPeriod((value || '30') as Period)}
          options={PERIOD_OPTIONS}
        />
        <RichSelect
          label="Payment method"
          hideLabel
          className="lg:w-48"
          placeholder="All payments"
          value={payment}
          onValueChange={(value) => setPayment(value || 'all')}
          options={PAYMENT_OPTIONS}
        />
        <p className="text-sm text-ink-muted lg:ml-auto">
          <strong className="font-semibold text-ink tabular-nums">{visibleOrders.length}</strong> orders ·{' '}
          <strong className="font-semibold text-ink tabular-nums">{money(totalTakenIn)}</strong> taken in
        </p>
      </div>

      {/* ── Loading / error / the table ── */}
      {loading && orders.length === 0 ? (
        <LoadingPanel message="Loading orders…" />
      ) : error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger-strong"
        >
          <span className="font-medium">{error}</span>
          <Button variant="outline" size="sm" onClick={() => onRefresh()}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            {/* table-fixed + <colgroup>: every column has a set width, so
                the columns line up the same in every row whatever is in them
                (a long member name is cut off with "…" instead of pushing the
                other columns around). min-w keeps it readable on a phone,
                where the box scrolls sideways instead. */}
            <table className="w-full min-w-[56rem] table-fixed text-left text-sm text-ink">
              <colgroup>
                <col className="w-[8%]" />
                <col className="w-[17%]" />
                <col className="w-[24%]" />
                <col className="w-[8%]" />
                <col className="w-[15%]" />
                <col className="w-[9%]" />
                <col className="w-[11%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead className="border-b border-gray-200 bg-subtle text-xs font-semibold text-ink-muted">
                <tr>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Date &amp; time</th>
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3 text-right">Items</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3 text-right">Points</th>
                  <th className="px-4 py-3 text-right">Total paid</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Details</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleOrders.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-ink-muted">
                      {orders.length === 0 ? 'No sales yet.' : 'No orders match your search or filters.'}
                    </td>
                  </tr>
                )}

                {visibleOrders.map((order) => {
                  const isOpen = openOrders.has(order.id);
                  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
                  const earned = pointsEarnedByOrder.get(order.id) ?? 0;

                  // Totals for the opened view. Everything uses the values
                  // frozen on each line at the time of sale.
                  const normalTotal = order.items.reduce(
                    (sum, item) => sum + (item.list_price ?? item.unit_price) * item.quantity,
                    0
                  );
                  const markdown = Math.max(0, normalTotal - order.total_amount);

                  return (
                    // Fragment: each order is its row plus (when opened) a details row.
                    <Fragment key={order.id}>
                      <tr
                        className={cn('cursor-pointer transition-colors hover:bg-subtle/60', isOpen && 'bg-subtle/60')}
                        onClick={() => toggleOrder(order.id)}
                      >
                        <td className="px-4 py-3 font-mono text-xs font-semibold">#{order.id}</td>
                        <td className="truncate px-4 py-3 whitespace-nowrap text-ink-muted">
                          {dateTime.format(new Date(order.created_at))}
                        </td>
                        {/* truncate = cut off with "…"; the full name shows on hover (title). */}
                        <td className="truncate px-4 py-3 font-medium" title={memberName(order)}>
                          {memberName(order)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{itemCount}</td>
                        {/* "Cash + Points" when points took something off,
                            with how much underneath. */}
                        <td className="px-4 py-3">
                          <div className="whitespace-nowrap">{paymentLabel(order)}</div>
                          {order.payment_method !== 'Loyalty Points' && order.discount_amount > 0 && (
                            <div className="text-[11px] whitespace-nowrap text-brand-strong tabular-nums">
                              −{money(order.discount_amount)} with points
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-semibold whitespace-nowrap tabular-nums">
                          {order.points_redeemed > 0 && <span className="text-warning-strong">−{order.points_redeemed} </span>}
                          {earned > 0 && <span className="text-brand-strong">+{earned}</span>}
                          {order.points_redeemed === 0 && earned === 0 && <span className="text-ink-subtle">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(order.final_amount)}</td>
                        <td className="px-4 py-3 text-right">
                          {/* A real button (with aria-expanded) so the keyboard can open the row too. */}
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-full text-xs font-semibold text-brand-strong hover:underline"
                            onClick={(event) => {
                              // Stop the click from ALSO reaching the row (which would toggle it back).
                              event.stopPropagation();
                              toggleOrder(order.id);
                            }}
                            aria-expanded={isOpen}
                            aria-controls={`order-${order.id}`}
                          >
                            {isOpen ? 'Hide' : 'View'}
                            <ChevronDown className={cn('size-3.5 transition-transform', isOpen && 'rotate-180')} aria-hidden="true" />
                          </button>
                        </td>
                      </tr>

                      {/* ── The order's lines and totals (only while opened) ── */}
                      {isOpen && (
                        <tr id={`order-${order.id}`}>
                          <td colSpan={8} className="bg-subtle/60 px-4 pt-1 pb-4">
                            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                              <table className="w-full text-left text-xs">
                                <thead className="border-b border-gray-200 bg-subtle font-semibold text-ink-muted">
                                  {/* Each line reads left to right as a sum:
                                      Qty × Unit price = Line total. */}
                                  <tr>
                                    <th className="px-3 py-2">Product</th>
                                    <th className="px-3 py-2 text-right">Qty</th>
                                    <th className="px-3 py-2 text-right">Unit price</th>
                                    <th className="px-3 py-2 text-right">Line total</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {order.items.map((item) => {
                                    // unit_price = what ONE unit was charged (after any
                                    // 15% near-expiry markdown); list_price = the normal
                                    // price of one unit at the time; subtotal = the line
                                    // total (unit_price × quantity). All frozen at the sale.
                                    const normal = item.list_price ?? item.unit_price;
                                    const markedDown = item.unit_price < normal;
                                    return (
                                      <tr key={item.id}>
                                        {/* Name, with the batch the units came from underneath. */}
                                        <td className="px-3 py-2">
                                          <div className="font-medium text-ink">
                                            {item.product_name ?? productNameById.get(item.product_id) ?? `Product #${item.product_id}`}
                                          </div>
                                          {item.batch_id && (
                                            <div className="font-mono text-[11px] text-ink-muted">
                                              Batch {batchCodeById.get(item.batch_id) ?? `#${item.batch_id}`}
                                            </div>
                                          )}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">× {item.quantity}</td>
                                        {/* Price of ONE unit. When it was marked down, the
                                            normal price is shown struck through beside it. */}
                                        <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                                          {markedDown && <s className="mr-1.5 text-ink-subtle">{money(normal)}</s>}
                                          {money(item.unit_price)}
                                          {markedDown && (
                                            <StatusText tone="warning" className="block text-[11px]">
                                              {NEAR_EXPIRY_PERCENT_OFF}% off near expiry
                                            </StatusText>
                                          )}
                                        </td>
                                        {/* The line total, with the sum spelled out under it
                                            when there's more than one unit: "2 × ₱180.00". */}
                                        <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                                          <div className="font-semibold text-ink">{money(item.subtotal)}</div>
                                          {item.quantity > 1 && (
                                            <div className="text-[11px] text-ink-muted">
                                              {item.quantity} × {money(item.unit_price)}
                                            </div>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>

                              {/* Totals, the same way the receipt shows them */}
                              <dl className="ml-auto max-w-xs space-y-1 border-t border-gray-100 px-3 py-3 text-xs tabular-nums">
                                <div className="flex justify-between text-ink-muted">
                                  <dt>At normal prices</dt>
                                  <dd>{money(normalTotal)}</dd>
                                </div>
                                {markdown > 0.004 && (
                                  <div className="flex justify-between text-warning-strong">
                                    <dt>Near-expiry discount</dt>
                                    <dd>−{money(markdown)}</dd>
                                  </div>
                                )}
                                {order.discount_amount > 0 && (
                                  <div className="flex justify-between text-brand-strong">
                                    <dt>Points ({order.points_redeemed} used)</dt>
                                    <dd>−{money(order.discount_amount)}</dd>
                                  </div>
                                )}
                                <div className="flex justify-between border-t border-gray-100 pt-1 text-sm font-bold text-ink">
                                  <dt>Total paid ({paymentLabel(order)})</dt>
                                  <dd>{money(order.final_amount)}</dd>
                                </div>
                                {earned > 0 && (
                                  <div className="flex justify-between text-brand-strong">
                                    <dt>Points earned</dt>
                                    <dd>+{earned}</dd>
                                  </div>
                                )}
                              </dl>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {orders.length >= 500 && (
            <p className="border-t border-gray-100 px-4 py-2 text-xs text-ink-muted">
              Showing the latest 500 orders.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
