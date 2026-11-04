// ════════════════════════════════════════════════════════════════════════════
// Analytics.tsx: the "Sales Analytics" tab. Only admins see it.
//
// It shows ONE period at a time, chosen with the navigator at the top:
//   Day / Month / Year, with ‹ › for the previous / next one and "Today" to
//   come back. It opens on the current month and stays at the top of the
//   window while scrolling.
// For that period, top to bottom:
//   1. Summary cards: Orders, Items sold, Gross sales, Total cost, Net income.
//   2. The chart and table (ProfitLoss.tsx): hour by hour for a day, day by
//      day for a month, month by month for a year. Clicking a month opens
//      that month; clicking a day opens that day.
//   3. The list of every order in the period (click one to open it in the
//      Orders tab).
//   4. Payment mix and top products for the period.
//
// The words (explained in ProfitLoss.tsx): Gross sales = money taken in from
// customers (after the 15% near-expiry markdown and after the part paid with
// points); Total cost = cost of the goods sold + stock losses; Net income =
// gross sales − total cost. Days follow Philippine time.
//
// Where the data comes from. When the period changes, this component asks
// the database three things at once:
//   api.getProfitLossSeries(from, to, step)  the totals and the chart rows
//   api.getSalesBreakdown(from, to)          payment mix + top products
//   api.getOrdersBetween(from, to)           the orders themselves
// The first two are SQL functions from migration 20261102120000. Until that
// migration is applied they answer null: the order list, the order count,
// items sold, gross sales, payment mix and top products still work (worked
// out here from the orders), and a note says the chart and costs need the
// update. Answers are remembered per period, so going back is instant.
// AdminPage still passes `analytics` (get_admin_sales_analytics()); it's used
// for the loading / error state, and a fresh one (Refresh) clears the
// remembered periods. Every SQL function involved refuses non-admins.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Info, LoaderCircle, RefreshCw } from 'lucide-react';
import type { Customer, Order, ProfitLossSeries, SalesAnalytics, SalesBreakdown } from '../types/app';
import { api } from '../lib/api';
import { todayInManila } from '../lib/expiry';
import { NEAR_EXPIRY_PERCENT_OFF } from '../lib/pricing';
import { rangeFor, shiftAnchor, viewTitle, VIEWS, type View } from '../lib/periods';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import PageHeader from './PageHeader';
import LoadingPanel from './LoadingPanel';
import ProfitLoss, { money, netClass, rowNumbers } from './ProfitLoss';

// The props (inputs) AdminPage passes in.
interface AnalyticsProps {
  // The headline numbers, or null before the first load has finished.
  analytics: SalesAnalytics | null;
  // True while that request is running.
  loading: boolean;
  // The error message if it failed, otherwise null.
  error: string | null;
  // The Refresh / Try again buttons. AdminPage then fetches again.
  onRetry: () => void;
  // Every member, to show names in the order list.
  customers: Customer[];
  // Opens an order in the Orders tab (from the order list).
  onOpenOrder?: (orderId: number) => void;
}

// What's known about the period on show. `key` says which period it is
// ('from|to|step'), so numbers for an older period are never mistaken for
// the current one. `series` / `breakdown` are null before migration
// 20261102120000 is applied.
interface PeriodReport {
  key: string;
  series: ProfitLossSeries | null;
  breakdown: SalesBreakdown | null;
  orders: Order[];
}

// The most orders loaded for one period (a very busy year could have more).
const ORDER_LIMIT = 1000;

// Date and time of an order, in Philippine time: "Nov 2, 8:15 PM", or just
// "8:15 PM" when looking at a single day.
const dateTimeFormat = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
const timeFormat = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });

// "Cash", or "Cash + Points" when points took something off (as in Orders).
const paymentLabel = (order: Order) =>
  order.payment_method === 'Loyalty Points'
    ? 'Loyalty Points'
    : order.points_redeemed > 0
      ? `${order.payment_method} + Points`
      : order.payment_method;

// The payment mix and top products worked out from a list of orders, with
// the same definitions as get_sales_breakdown() in the database (used before
// that function exists):
//   payment mix   money taken in (final_amount) per payment method
//   top products  each line's share of what was paid (its total scaled by
//                 final_amount / total_amount, which spreads a points
//                 discount over the order's lines), top 10
function breakdownFromOrders(orders: Order[]): Pick<SalesBreakdown, 'payment_mix' | 'top_products'> {
  const payments = new Map<string, { value: number; orders: number }>();
  const products = new Map<string, { revenue: number; quantity: number }>();
  for (const order of orders) {
    const pay = payments.get(order.payment_method) ?? { value: 0, orders: 0 };
    pay.value += order.final_amount;
    pay.orders += 1;
    payments.set(order.payment_method, pay);
    const paidShare = order.total_amount > 0 ? order.final_amount / order.total_amount : 0;
    for (const item of order.items) {
      const name = item.product_name ?? `Product #${item.product_id}`;
      const product = products.get(name) ?? { revenue: 0, quantity: 0 };
      product.revenue += item.subtotal * paidShare;
      product.quantity += item.quantity;
      products.set(name, product);
    }
  }
  return {
    payment_mix: [...payments].map(([name, p]) => ({ name, value: p.value, orders: p.orders })),
    top_products: [...products]
      .map(([name, p]) => ({ name, revenue: Math.round(p.revenue * 100) / 100, quantity: p.quantity }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10),
  };
}

// ── Small building blocks ──────────────────────────────────────────────────

// One summary card. `tone` colours the number; `note` is the grey line under it.
function SummaryCard({ label, value, note, tone }: { label: string; value: ReactNode; note: ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-xs">
      <div className="text-xs font-medium text-ink-muted">{label}</div>
      <div className={cn('mt-1 text-2xl font-bold tracking-tight tabular-nums', tone ?? 'text-ink')}>{value}</div>
      <div className="mt-0.5 text-xs text-ink-muted">{note}</div>
    </div>
  );
}

// White card with a title.
function Card({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border border-gray-200 bg-white p-5 shadow-xs">
      <h3 className="text-base font-bold text-ink">{title}</h3>
      {subtitle && <p className="text-xs text-ink-muted">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// Shown inside a card when there's nothing to draw.
function EmptyBox({ message }: { message: string }) {
  return (
    <div className="flex h-[140px] items-center justify-center rounded-md border border-dashed border-gray-200 text-sm text-ink-muted">
      {message}
    </div>
  );
}

// A ranked list with a bar under each line, biggest first (payment mix and
// top products). `share` adds each line's percentage of the list's total.
function RankedBars({
  rows,
  emptyMessage,
  share = true,
}: {
  rows: { label: string; value: number; note?: string }[];
  emptyMessage: string;
  share?: boolean;
}) {
  const shown = rows.filter((row) => row.value > 0).sort((a, b) => b.value - a.value);
  const total = shown.reduce((sum, row) => sum + row.value, 0);
  // The largest line's bar is full width; the others are in proportion to it.
  const biggest = shown[0]?.value ?? 0;
  if (shown.length === 0) return <EmptyBox message={emptyMessage} />;
  return (
    <ul className="space-y-4">
      {shown.map((row) => (
        <li key={row.label} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0">
              <span className="font-semibold text-ink">{row.label}</span>
              {row.note && <span className="text-xs text-ink-muted"> · {row.note}</span>}
            </span>
            <span className="shrink-0 text-ink-muted tabular-nums">
              {money(row.value)}
              {share && (
                <>
                  {' · '}
                  <strong className="text-ink">{Math.round((row.value / total) * 100)}%</strong>
                </>
              )}
            </span>
          </div>
          <div
            className="h-2.5 min-w-0.5 rounded-r bg-brand"
            style={{ width: `${biggest > 0 ? (row.value / biggest) * 100 : 0}%` }}
            aria-hidden="true"
          />
        </li>
      ))}
    </ul>
  );
}

// ── The page ───────────────────────────────────────────────────────────────
export default function Analytics({ analytics, loading, error, onRetry, customers, onOpenOrder }: AnalyticsProps) {
  // Today in the Philippines ('YYYY-MM-DD'): where "Today" goes, and the
  // last period › can reach.
  const today = todayInManila();

  // ── State: what this page remembers ──
  // Day, Month or Year, and the date that says which one (see lib/periods.ts).
  const [view, setView] = useState<View>('month');
  const [anchor, setAnchor] = useState(today);
  // The numbers last loaded (possibly for the previous period while the new
  // one loads, so the page doesn't jump), and a loading error, if any.
  const [report, setReport] = useState<PeriodReport | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  // Bumped by "Try again" to load the same period again.
  const [retryCount, setRetryCount] = useState(0);
  // Answers already loaded, by period key. A ref: changing it shouldn't redraw.
  const cache = useRef(new Map<string, PeriodReport>());

  // ── The period on show ──
  const { from, to, step } = rangeFor(view, anchor);
  const key = `${from}|${to}|${step}`;
  const viewInfo = VIEWS.find((v) => v.id === view) ?? VIEWS[1];
  // Is today inside it? (Then "Today" has nothing to do.)
  const isCurrent = from <= today && today <= to;
  // Can › go further? Not past the period that contains today.
  const canGoNext = rangeFor(view, shiftAnchor(view, anchor, 1)).from <= today;

  // Open a row of the chart / table: a month (from a year) or a day (from a month).
  const openRow = (start: string) => {
    if (view === 'year') setView('month');
    else if (view === 'month') setView('day');
    setAnchor(start.slice(0, 10));
  };

  // A fresh `analytics` (tab opened again, or Refresh): forget the remembered
  // periods too, so they're loaded fresh as well.
  useEffect(() => {
    cache.current.clear();
  }, [analytics]);

  // Load the period on show whenever it changes: all three questions at once
  // (Promise.all waits for all of them). A remembered answer is used straight
  // away. `cancelled` ignores a late answer if the admin has moved on.
  useEffect(() => {
    const saved = cache.current.get(key);
    if (saved) {
      setReport(saved);
      setReportError(null);
      return;
    }
    let cancelled = false;
    setReportError(null);
    Promise.all([
      api.getProfitLossSeries(from, to, step),
      api.getSalesBreakdown(from, to),
      api.getOrdersBetween(from, to, ORDER_LIMIT),
    ])
      .then(([series, breakdown, orders]) => {
        const loaded = { key, series, breakdown, orders };
        cache.current.set(key, loaded);
        if (!cancelled) setReport(loaded);
      })
      .catch((err) => {
        if (!cancelled) setReportError(err instanceof Error ? err.message : 'Could not load this period.');
      });
    return () => {
      cancelled = true;
    };
  }, [key, from, to, step, analytics, retryCount]);

  // The title row with the Refresh button, used in every version of the page.
  const header = (
    <PageHeader
      title="Sales Analytics"
      actions={
        <Button variant="outline" onClick={onRetry} disabled={loading}>
          <RefreshCw aria-hidden="true" className={loading ? 'animate-spin' : undefined} />
          Refresh
        </Button>
      }
    />
  );

  if (loading) {
    return (
      <div className="space-y-6">
        {header}
        <LoadingPanel message="Loading analytics…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        {header}
        <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-danger/30 bg-danger/10 p-5 text-danger-strong">
          <p className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  // ── The period's numbers ──
  // `stale` = the numbers on screen belong to the previous period while the
  // new one loads; they're shown faded until it arrives.
  const stale = report !== null && report.key !== key;
  const series = report?.series ?? null;
  const orders = report?.orders ?? [];
  const truncated = orders.length >= ORDER_LIMIT;
  // From the database when available (exact), otherwise from the orders.
  const totals = series ? rowNumbers(series.totals) : null;
  const orderCount = totals ? totals.orders : orders.length;
  const grossSales = totals ? totals.grossSales : orders.reduce((sum, o) => sum + o.final_amount, 0);
  // Items sold and how many different products, from the orders' lines.
  const itemsSold = orders.reduce((sum, o) => sum + o.items.reduce((s, item) => s + item.quantity, 0), 0);
  const productCount = new Set(orders.flatMap((o) => o.items.map((item) => item.product_id))).size;
  // Payment mix and top products: from the database, or from the orders.
  const breakdown = report?.breakdown ?? breakdownFromOrders(orders);
  // Member names for the order list.
  const memberById = new Map(customers.map((member) => [member.id, member]));
  const memberName = (order: Order) => {
    const member = order.customer_id ? memberById.get(order.customer_id) : undefined;
    return member ? member.name || member.email : 'Unknown member';
  };

  return (
    <div className="space-y-6">
      {header}

      {/* ── The navigator ── */}
      {/* sticky: stays near the top of the window while the page scrolls
          (below the phone top bar on small screens). */}
      <div className="sticky top-16 z-20 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white/95 p-2 shadow-sm backdrop-blur lg:top-4">
        {/* Day / Month / Year, the chosen one filled green. Switching keeps
            the same date: from a day, "Month" shows the month it's in. */}
        <div className="flex rounded-full bg-subtle p-1" role="group" aria-label="Period">
          {VIEWS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={view === option.id}
              onClick={() => setView(option.id)}
              className={cn(
                'rounded-full px-4 py-1.5 text-xs font-semibold transition-colors',
                view === option.id ? 'bg-brand text-white shadow-xs' : 'text-ink-muted hover:text-ink'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* ‹ the period's name › */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => setAnchor(shiftAnchor(view, anchor, -1))} aria-label={`Previous ${view}`}>
            <ChevronLeft />
          </Button>
          {/* aria-live reads the new period out when it changes. */}
          <h3 className="min-w-44 text-center text-sm font-bold text-ink" aria-live="polite">
            {viewTitle(view, anchor)}
          </h3>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setAnchor(shiftAnchor(view, anchor, 1))}
            disabled={!canGoNext}
            aria-label={`Next ${view}`}
          >
            <ChevronRight />
          </Button>
        </div>

        <Button variant="outline" size="sm" onClick={() => setAnchor(today)} disabled={isCurrent}>
          Today
        </Button>

        {/* A spinner while a period loads. */}
        {(stale || (!report && !reportError)) && <LoaderCircle className="size-4 animate-spin text-ink-subtle" aria-label="Loading" />}
      </div>

      {reportError ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-danger/30 bg-danger/10 p-5 text-danger-strong">
          <p className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            {reportError}
          </p>
          <Button variant="outline" size="sm" onClick={() => setRetryCount((count) => count + 1)}>
            Try again
          </Button>
        </div>
      ) : !report ? (
        <LoadingPanel message="Loading this period…" />
      ) : (
        // Faded (and not clickable) while the next period loads.
        <div className={cn('space-y-6 transition-opacity', stale && 'pointer-events-none opacity-50')}>
          {/* ── 1. Summary cards ── */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <SummaryCard
              label="Orders"
              value={orderCount}
              note={orderCount > 0 ? `Average ${money(grossSales / orderCount)}` : 'No sales'}
            />
            <SummaryCard
              label="Items sold"
              value={itemsSold}
              note={`${productCount} ${productCount === 1 ? 'product' : 'different products'}${truncated ? ' (first 1,000 orders)' : ''}`}
            />
            <SummaryCard label="Gross sales" value={money(grossSales)} note="Money taken in from customers" />
            <SummaryCard
              label="Total cost"
              value={totals ? money(totals.totalCost) : '—'}
              note={totals ? `${money(totals.costOfGoods)} goods + ${money(totals.losses)} stock losses` : 'Needs the database update'}
            />
            <SummaryCard
              label="Net income"
              value={totals ? money(totals.netIncome) : '—'}
              tone={totals ? netClass(totals.netIncome) || 'text-ink' : 'text-ink-subtle'}
              note={totals ? 'Gross sales minus total cost' : 'Needs the database update'}
            />
          </div>

          {/* ── 2. Chart + table for the period ── */}
          <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-5 shadow-xs">
            <div>
              <h3 className="text-base font-bold text-ink">
                {viewInfo.splitLabel} · {viewTitle(view, anchor)}
              </h3>
              {series ? (
                <p className="text-xs text-ink-muted">
                  {view === 'day' ? 'Hour by hour.' : `Click a ${viewInfo.rowWord} to open it.`} Gross sales already have{' '}
                  {money(Number(series.totals.near_expiry_discount))} of {NEAR_EXPIRY_PERCENT_OFF}% near-expiry discounts and{' '}
                  {money(Number(series.totals.points_discount))} paid with points taken off.
                </p>
              ) : null}
            </div>
            {series ? (
              <ProfitLoss
                step={step}
                periods={series.periods}
                totals={series.totals}
                rowWord={viewInfo.rowWord.charAt(0).toUpperCase() + viewInfo.rowWord.slice(1)}
                onOpen={view === 'day' ? undefined : openRow}
              />
            ) : (
              // Before migration 20261102120000: say exactly what to do.
              <p className="flex items-start gap-2 rounded-md border border-sun bg-sun/25 p-4 text-sm text-brand-ink">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  This chart, Total cost and Net income need the database update{' '}
                  <code className="rounded bg-white px-1 font-mono text-xs">20261102120000_sales_breakdown_by_period.sql</code>. Run{' '}
                  <code className="rounded bg-white px-1 font-mono text-xs">!npm run db:push</code> in Claude Code (or{' '}
                  <code className="rounded bg-white px-1 font-mono text-xs">npm run db:push</code> in a terminal), then press Refresh.
                </span>
              </p>
            )}
          </section>

          {/* ── 3. The orders in the period ── */}
          {/* Newest first. Clicking an order opens it (with its lines) in the
              Orders tab. The box scrolls when the list is long. */}
          <Card
            title={`Orders · ${viewTitle(view, anchor)}`}
            subtitle={`${orders.length}${truncated ? '+' : ''} ${orders.length === 1 ? 'order' : 'orders'}${onOpenOrder ? ' · click one to see what was bought' : ''}`}
          >
            {orders.length === 0 ? (
              <EmptyBox message="No orders in this period." />
            ) : (
              <div className="max-h-[28rem] overflow-auto rounded-md border border-gray-200">
                <table className="w-full min-w-[40rem] table-fixed text-left text-sm text-ink">
                  <colgroup>
                    <col className="w-[12%]" />
                    <col className="w-[20%]" />
                    <col className="w-[28%]" />
                    <col className="w-[10%]" />
                    <col className="w-[16%]" />
                    <col className="w-[14%]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 border-b border-gray-200 bg-subtle text-xs font-semibold text-ink-muted">
                    <tr>
                      <th className="px-3 py-2">Order</th>
                      <th className="px-3 py-2">{view === 'day' ? 'Time' : 'Date & time'}</th>
                      <th className="px-3 py-2">Member</th>
                      <th className="px-3 py-2 text-right">Items</th>
                      <th className="px-3 py-2">Payment</th>
                      <th className="px-3 py-2 text-right">Total paid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {orders.map((order) => {
                      const open = onOpenOrder ? () => onOpenOrder(order.id) : undefined;
                      return (
                        <tr
                          key={order.id}
                          tabIndex={open ? 0 : undefined}
                          onClick={open}
                          onKeyDown={(e) => {
                            if (open && (e.key === 'Enter' || e.key === ' ')) {
                              e.preventDefault();
                              open();
                            }
                          }}
                          className={cn('hover:bg-subtle/60', open && 'cursor-pointer outline-none focus-visible:bg-subtle')}
                        >
                          <td className="px-3 py-2 font-mono text-xs font-semibold">#{order.id}</td>
                          <td className="truncate px-3 py-2 text-ink-muted">
                            {(view === 'day' ? timeFormat : dateTimeFormat).format(new Date(order.created_at))}
                          </td>
                          <td className="truncate px-3 py-2 font-medium" title={memberName(order)}>
                            {memberName(order)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {order.items.reduce((sum, item) => sum + item.quantity, 0)}
                          </td>
                          <td className="truncate px-3 py-2">{paymentLabel(order)}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(order.final_amount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* ── 4. Payment mix + top products for the period ── */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* A sale paid fully with points brings in ₱0, so it's left out. */}
            <Card title="Payment mix" subtitle="Money taken in per payment method">
              <RankedBars
                emptyMessage="No payments in this period."
                rows={breakdown.payment_mix.map((p) => ({
                  label: p.name,
                  value: p.value,
                  note: `${p.orders} ${p.orders === 1 ? 'order' : 'orders'}`,
                }))}
              />
            </Card>
            {/* The 10 products that brought in the most in this period. */}
            <Card title="Top products" subtitle="Money brought in, with units sold">
              <RankedBars
                emptyMessage="No products sold in this period."
                share={false}
                rows={breakdown.top_products.map((p) => ({ label: p.name, value: p.revenue, note: `${p.quantity} sold` }))}
              />
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
