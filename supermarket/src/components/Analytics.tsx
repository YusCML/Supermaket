import type { ReactNode } from 'react';
import { AlertTriangle, Info, RefreshCw } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SalesAnalytics, ProfitLossTotals } from '../types/app';
import { Button } from './ui/button';
import PageHeader from './PageHeader';
import LoadingPanel from './LoadingPanel';
import ProfitLoss from './ProfitLoss';

interface AnalyticsProps {
  analytics: SalesAnalytics | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

// ── Chart colours ──────────────────────────────────────────────────────────
// Recharts needs real colour values, so these copy the tokens in index.css.
// Each chart below shows ONE thing, so it uses one colour and needs no legend.
const BRAND = '#00873E'; // --color-brand
const GRID = '#E5E7EB'; // light grey grid lines, kept faint so the data stands out
const AXIS_TEXT = '#666666'; // --color-ink-muted

const axisTick = { fill: AXIS_TEXT, fontSize: 12 };
const tooltipStyle = { borderRadius: 8, border: `1px solid ${GRID}`, fontSize: 12, boxShadow: 'none' };
const barHoverShade = { fill: 'rgba(0, 135, 62, 0.08)' };

// ── Number and date formats ────────────────────────────────────────────────
// Full amount for tooltips and tiles: ₱12,345.60
const currency = (value: number) =>
  `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Short amount for axis labels: ₱950, ₱1.2K, ₱15K
const compactNumber = new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 });
const compactCurrency = (value: number) => `₱${compactNumber.format(value)}`;

// "2026-10-05" -> "Oct 5"
const shortDay = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' });

// ── Small building blocks ──────────────────────────────────────────────────

// One headline number, e.g. "This week  ₱12,345.00".
function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-xs">
      <div className="text-xs font-medium text-ink-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tracking-tight text-ink tabular-nums">{currency(value)}</div>
    </div>
  );
}

// White card with a title, wrapping one chart.
function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border border-gray-200 bg-white p-5 shadow-xs">
      <h3 className="text-base font-bold text-ink">{title}</h3>
      {subtitle && <p className="text-xs text-ink-muted">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// Shown inside a chart card when there's nothing to draw yet.
function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[240px] items-center justify-center rounded-md border border-dashed border-gray-200 text-sm text-ink-muted">
      {message}
    </div>
  );
}

// A ranked list with a bar under each line: biggest first. Used for the
// payment mix and the stock losses. `color` is the bar colour class.
function RankedBars({
  rows,
  color,
  emptyMessage,
}: {
  rows: { label: string; value: number; note?: string }[];
  color: string;
  emptyMessage: string;
}) {
  const shown = rows.filter((row) => row.value > 0).sort((a, b) => b.value - a.value);
  const total = shown.reduce((sum, row) => sum + row.value, 0);
  const biggest = shown[0]?.value ?? 0;

  if (shown.length === 0) return <EmptyChart message={emptyMessage} />;

  return (
    <ul className="flex min-h-[240px] flex-col justify-center gap-5">
      {shown.map((row) => (
        <li key={row.label} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span>
              <span className="font-semibold text-ink">{row.label}</span>
              {row.note && <span className="text-xs text-ink-muted"> · {row.note}</span>}
            </span>
            <span className="text-ink-muted tabular-nums">
              {currency(row.value)} · <strong className="text-ink">{Math.round((row.value / total) * 100)}%</strong>
            </span>
          </div>
          {/* Bar length is relative to the biggest line. */}
          <div
            className={`h-3 min-w-0.5 rounded-r ${color}`}
            style={{ width: `${biggest > 0 ? (row.value / biggest) * 100 : 0}%` }}
            aria-hidden="true"
          />
        </li>
      ))}
    </ul>
  );
}

// Stock losses this year, split by why the stock was lost.
function LossesThisYear({ summary, fallbackTotal }: { summary?: ProfitLossTotals; fallbackTotal: number }) {
  const total = summary ? Number(summary.total_losses) : fallbackTotal;
  return (
    <ChartCard title="Stock losses this year" subtitle="Valued at what the stock cost the store">
      <div className="mb-4 flex items-baseline gap-2">
        <strong className="text-3xl font-bold tracking-tight text-danger-strong tabular-nums">{currency(total)}</strong>
        <span className="text-sm text-ink-muted">lost in total</span>
      </div>
      {summary ? (
        <RankedBars
          color="bg-danger"
          emptyMessage="No stock lost this year."
          rows={[
            { label: 'Expired', value: Number(summary.expired_loss), note: 'past the expiry date' },
            { label: 'Spoiled', value: Number(summary.spoiled_loss), note: 'written off' },
            { label: 'Damaged', value: Number(summary.damaged_loss), note: 'written off' },
          ]}
        />
      ) : (
        <p className="text-sm text-ink-muted">
          Expired, spoiled and damaged stock combined. The split appears once the database update below is applied.
        </p>
      )}
    </ChartCard>
  );
}

export default function Analytics({ analytics, loading, error, onRetry }: AnalyticsProps) {
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

  if (!analytics) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyChart message="No analytics available yet." />
      </div>
    );
  }

  // The day/week/month breakdowns come from a newer database function. If the
  // database hasn't been updated yet they're missing, and we say so instead
  // of showing empty charts.
  const hasBreakdown = Boolean(analytics.daily_breakdown && analytics.weekly_breakdown && analytics.monthly_breakdown);
  const hasTrend = analytics.thirty_day_trend.some((point) => point.revenue > 0);

  return (
    <div className="space-y-6">
      {header}

      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatTile label="Today" value={analytics.today_revenue} />
        <StatTile label="This week" value={analytics.week_revenue} />
        <StatTile label="This month" value={analytics.month_revenue} />
        <StatTile label="This year" value={analytics.year_revenue} />
        <StatTile label="All-time net revenue" value={analytics.net_revenue} />
      </div>

      {/* Profit & loss, day by day / week by week / month by month */}
      {hasBreakdown ? (
        <ProfitLoss
          daily={analytics.daily_breakdown ?? []}
          weekly={analytics.weekly_breakdown ?? []}
          monthly={analytics.monthly_breakdown ?? []}
        />
      ) : (
        <>
          <p className="flex items-start gap-2 rounded-md border border-sun bg-sun/25 p-4 text-sm text-brand-ink">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              Day-by-day and week-by-week profit &amp; loss needs a database update. Apply the migration{' '}
              <code className="rounded bg-white px-1 font-mono text-xs">20261101120000_profit_and_loss_analytics.sql</code>{' '}
              (<code className="rounded bg-white px-1 font-mono text-xs">npm run db:push</code>), then press Refresh.
            </span>
          </p>
          <ChartCard title="30-day revenue trend" subtitle="Daily revenue, hover a day for the exact amount">
            {hasTrend ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={analytics.thirty_day_trend} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis
                    dataKey="date"
                    interval={4}
                    tickFormatter={shortDay}
                    tick={axisTick}
                    tickLine={false}
                    axisLine={{ stroke: GRID }}
                  />
                  <YAxis tickFormatter={compactCurrency} tick={axisTick} tickLine={false} axisLine={false} width={56} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(date) => shortDay(String(date))}
                    formatter={(value) => [currency(Number(value)), 'Revenue']}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke={BRAND}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5, stroke: '#FFFFFF', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="No sales recorded in the last 30 days." />
            )}
          </ChartCard>
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <LossesThisYear summary={analytics.year_summary} fallbackTotal={analytics.spoilage_losses} />

        <ChartCard title="Payment mix this year" subtitle="Revenue by payment method, largest first">
          <RankedBars
            color="bg-brand"
            emptyMessage="No payments recorded this year."
            rows={analytics.payment_mix.map((p) => ({ label: p.name, value: Number(p.value) }))}
          />
        </ChartCard>
      </div>

      {/* Best sellers */}
      <ChartCard title="Top products this year" subtitle="Net revenue per product">
        {analytics.top_products.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(200, analytics.top_products.length * 40)}>
            <BarChart data={analytics.top_products} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }}>
              <CartesianGrid horizontal={false} stroke={GRID} />
              <XAxis type="number" tickFormatter={compactCurrency} tick={axisTick} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis type="category" dataKey="name" width={140} tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={barHoverShade}
                contentStyle={tooltipStyle}
                formatter={(value) => [currency(Number(value)), 'Net revenue']}
              />
              <Bar dataKey="revenue" fill={BRAND} maxBarSize={24} radius={[0, 4, 4, 0]}>
                {/* Amount printed at the end of each bar, so no need to hover. */}
                <LabelList
                  dataKey="revenue"
                  position="right"
                  formatter={(value) => compactCurrency(Number(value))}
                  style={{ fill: AXIS_TEXT, fontSize: 12 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart message="No product sales recorded this year." />
        )}
      </ChartCard>
    </div>
  );
}
