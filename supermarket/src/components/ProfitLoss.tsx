import { useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ProfitLossPeriod, ProfitLossTotals } from '../types/app';
import { NEAR_EXPIRY_PERCENT_OFF } from '../lib/pricing';
import { cn } from '@/lib/utils';

// ── Colours ────────────────────────────────────────────────────────────────
// Gain = the brand green, loss = a light coral red.
// To red-green colour-blind people, a green and a red of the SAME darkness
// look alike. The deep green and the light coral differ in darkness, so they
// stay easy to tell apart (checked with a colour-blindness validator). Gains
// are also drawn ABOVE the zero line and losses BELOW it, and the table under
// the chart has every number, so nothing depends on colour alone.
const GAIN_COLOR = '#00873E';
const LOSS_COLOR = '#F7797A';
const GRID = '#E5E7EB';
const AXIS_TEXT = '#666666';
const axisTick = { fill: AXIS_TEXT, fontSize: 12 };

// ── Formatting ─────────────────────────────────────────────────────────────
const money = (value: number) =>
  `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const compactNumber = new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 });
const compactMoney = (value: number) => `${value < 0 ? '−' : ''}₱${compactNumber.format(Math.abs(value))}`;

type Granularity = 'daily' | 'weekly' | 'monthly';

const GRANULARITIES: { id: Granularity; label: string; range: string }[] = [
  { id: 'daily', label: 'Day by day', range: 'Last 30 days' },
  { id: 'weekly', label: 'Week by week', range: 'Last 12 weeks' },
  { id: 'monthly', label: 'Month by month', range: 'Last 12 months' },
];

// Dates come from the database as 'YYYY-MM-DD'. Read them as UTC so the day
// never shifts because of the computer's time zone.
const DAY_MS = 86_400_000;
const formatDay = (iso: string, options: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-PH', { ...options, timeZone: 'UTC' });

// How a period is named. Short for chart labels, long for the table:
//   daily   "Oct 5"         / "Sun, Oct 5"
//   weekly  "Oct 6"         / "Oct 6 – 12"
//   monthly "Oct"           / "October 2026"
function periodName(start: string, granularity: Granularity, long: boolean): string {
  if (granularity === 'daily') {
    return formatDay(start, long ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' });
  }
  if (granularity === 'weekly') {
    if (!long) return formatDay(start, { month: 'short', day: 'numeric' });
    const end = new Date(new Date(`${start}T00:00:00Z`).getTime() + 6 * DAY_MS).toISOString().slice(0, 10);
    const sameMonth = start.slice(0, 7) === end.slice(0, 7);
    return `${formatDay(start, { month: 'short', day: 'numeric' })} – ${formatDay(end, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`;
  }
  return formatDay(start, long ? { month: 'long', year: 'numeric' } : { month: 'short' });
}

// Adds a list of periods together into one set of totals.
const TOTAL_KEYS: (keyof ProfitLossTotals)[] = [
  'orders',
  'revenue',
  'cost_of_goods',
  'gross_profit',
  'near_expiry_discount',
  'points_discount',
  'expired_loss',
  'spoiled_loss',
  'damaged_loss',
  'total_losses',
  'net_profit',
];
function addUp(periods: ProfitLossPeriod[]): ProfitLossTotals {
  const totals = Object.fromEntries(TOTAL_KEYS.map((key) => [key, 0])) as unknown as ProfitLossTotals;
  for (const period of periods) {
    for (const key of TOTAL_KEYS) totals[key] += Number(period[key]) || 0;
  }
  return totals;
}

// ── Small pieces ───────────────────────────────────────────────────────────

// One summary number above the chart.
function SummaryTile({ label, value, note, tone }: { label: string; value: number; note?: ReactNode; tone?: 'gain' | 'loss' }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <div className="text-xs font-medium text-ink-muted">{label}</div>
      <div
        className={cn(
          'mt-1 text-xl font-bold tracking-tight tabular-nums',
          tone === 'gain' && 'text-brand-strong',
          tone === 'loss' && 'text-danger-strong',
          !tone && 'text-ink'
        )}
      >
        {money(value)}
      </div>
      {note && <div className="mt-0.5 text-xs text-ink-muted">{note}</div>}
    </div>
  );
}

// A money cell in the table. Zero shows as a dash so the real numbers stand out.
function MoneyCell({ value, className }: { value: number; className?: string }) {
  return (
    <td className={cn('px-3 py-2 text-right whitespace-nowrap tabular-nums', className)}>
      {value === 0 ? <span className="text-ink-subtle">—</span> : money(value)}
    </td>
  );
}

// Net profit: green when positive, red when negative.
const netClass = (value: number) => (value < 0 ? 'font-semibold text-danger-strong' : value > 0 ? 'font-semibold text-brand-strong' : '');

interface ChartRow {
  label: string;
  longLabel: string;
  gain: number;
  loss: number; // stored as a negative number so the bar points down
  period: ProfitLossPeriod;
}

// What appears when hovering a bar.
function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartRow }[] }) {
  if (!active || !payload?.length) return null;
  const { longLabel, period } = payload[0].payload;
  return (
    <div className="space-y-1 rounded-md border border-gray-200 bg-white p-3 text-xs shadow-md">
      <div className="font-semibold text-ink">{longLabel}</div>
      <div className="flex justify-between gap-6">
        <span className="text-ink-muted">Sales</span>
        <span className="tabular-nums">{money(period.revenue)}</span>
      </div>
      <div className="flex justify-between gap-6">
        <span className="text-ink-muted">Gain (gross profit)</span>
        <span className="text-brand-strong tabular-nums">{money(period.gross_profit)}</span>
      </div>
      <div className="flex justify-between gap-6">
        <span className="text-ink-muted">Losses</span>
        <span className="text-danger-strong tabular-nums">−{money(period.total_losses)}</span>
      </div>
      <div className="flex justify-between gap-6 border-t border-gray-100 pt-1 font-semibold">
        <span>Net profit</span>
        <span className={cn('tabular-nums', netClass(period.net_profit))}>{money(period.net_profit)}</span>
      </div>
    </div>
  );
}

// ── The section ────────────────────────────────────────────────────────────

interface ProfitLossProps {
  daily: ProfitLossPeriod[];
  weekly: ProfitLossPeriod[];
  monthly: ProfitLossPeriod[];
}

// "Profit & loss" on the Analytics tab: switch between day / week / month and
// see sales, gains and stock losses for each, as totals, a chart and a table.
export default function ProfitLoss({ daily, weekly, monthly }: ProfitLossProps) {
  const [granularity, setGranularity] = useState<Granularity>('daily');

  const periods = { daily, weekly, monthly }[granularity];
  const totals = addUp(periods);
  const range = GRANULARITIES.find((g) => g.id === granularity)?.range ?? '';

  const chartRows: ChartRow[] = periods.map((period) => ({
    label: periodName(period.start, granularity, false),
    longLabel: periodName(period.start, granularity, true),
    gain: Number(period.gross_profit),
    loss: -Number(period.total_losses),
    period,
  }));
  const hasAnyData = periods.some((p) => p.revenue !== 0 || p.total_losses !== 0);

  // The table lists the newest period first.
  const tableRows = [...periods].reverse();

  return (
    <section aria-labelledby="pl-title" className="space-y-5 rounded-lg border border-gray-200 bg-white p-5 shadow-xs">
      {/* Title + day/week/month switch */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="pl-title" className="text-base font-bold text-ink">
            Profit &amp; loss
          </h3>
          <p className="text-xs text-ink-muted">
            {range}. Sales minus what the goods cost, minus expired, spoiled and damaged stock.
          </p>
        </div>
        <div className="flex rounded-full bg-subtle p-1" role="group" aria-label="Show profit and loss">
          {GRANULARITIES.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={granularity === option.id}
              onClick={() => setGranularity(option.id)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors',
                granularity === option.id ? 'bg-brand text-white shadow-xs' : 'text-ink-muted hover:text-ink'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Totals for the whole range */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile label="Sales" value={totals.revenue} note={`${totals.orders} orders`} />
        <SummaryTile
          label="Gain (gross profit)"
          value={totals.gross_profit}
          tone="gain"
          note={`after ${money(totals.cost_of_goods)} cost of goods`}
        />
        <SummaryTile
          label="Stock losses"
          value={totals.total_losses}
          tone="loss"
          note="expired + spoiled + damaged"
        />
        <SummaryTile
          label="Net profit"
          value={totals.net_profit}
          tone={totals.net_profit < 0 ? 'loss' : 'gain'}
          note="gain minus losses"
        />
      </div>

      {/* The 15% markdown and points are already taken out of "Sales"; this says how much. */}
      <p className="rounded-md bg-sun/35 px-3 py-2 text-xs text-brand-ink">
        Sales already have <strong className="font-semibold">{money(totals.near_expiry_discount)}</strong> of{' '}
        {NEAR_EXPIRY_PERCENT_OFF}% near-expiry discounts and{' '}
        <strong className="font-semibold">{money(totals.points_discount)}</strong> paid with loyalty points taken off.
      </p>

      {/* Chart: green bars up = gain, red bars down = losses */}
      {/* Legend: what the two colours mean */}
      <div className="flex flex-wrap justify-end gap-4 text-xs text-ink-muted" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm" style={{ background: GAIN_COLOR }} /> Gain (gross profit), above the line
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm" style={{ background: LOSS_COLOR }} /> Stock losses, below the line
        </span>
      </div>

      {hasAnyData ? (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartRows} stackOffset="sign" margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey="label"
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              interval={granularity === 'daily' ? 4 : 0}
            />
            <YAxis tickFormatter={compactMoney} tick={axisTick} tickLine={false} axisLine={false} width={60} />
            <ReferenceLine y={0} stroke="#9CA3AF" />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0, 0, 0, 0.04)' }} />
            <Bar dataKey="gain" name="Gain (gross profit)" stackId="pl" fill={GAIN_COLOR} maxBarSize={24} radius={[4, 4, 0, 0]} />
            <Bar dataKey="loss" name="Stock losses" stackId="pl" fill={LOSS_COLOR} maxBarSize={24} radius={[0, 0, 4, 4]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-[200px] items-center justify-center rounded-md border border-dashed border-gray-200 text-sm text-ink-muted">
          No sales or losses recorded in this period.
        </div>
      )}

      {/* Table: every period, newest first, with a totals line at the bottom */}
      <div className="max-h-[26rem] overflow-auto rounded-md border border-gray-200">
        <table className="w-full text-left text-xs text-ink">
          <thead className="sticky top-0 z-10 border-b border-gray-200 bg-subtle font-semibold text-ink-muted">
            <tr>
              <th className="px-3 py-2">{granularity === 'daily' ? 'Day' : granularity === 'weekly' ? 'Week' : 'Month'}</th>
              <th className="px-3 py-2 text-right">Orders</th>
              <th className="px-3 py-2 text-right">Sales</th>
              <th className="px-3 py-2 text-right">{NEAR_EXPIRY_PERCENT_OFF}% off given</th>
              <th className="px-3 py-2 text-right">Cost of goods</th>
              <th className="px-3 py-2 text-right">Gain</th>
              <th className="px-3 py-2 text-right">Expired</th>
              <th className="px-3 py-2 text-right">Spoiled</th>
              <th className="px-3 py-2 text-right">Damaged</th>
              <th className="px-3 py-2 text-right">Net profit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tableRows.map((period) => (
              <tr key={period.start} className="hover:bg-subtle/60">
                <td className="px-3 py-2 font-medium whitespace-nowrap">{periodName(period.start, granularity, true)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {period.orders === 0 ? <span className="text-ink-subtle">—</span> : period.orders}
                </td>
                <MoneyCell value={Number(period.revenue)} />
                <MoneyCell value={Number(period.near_expiry_discount)} className="text-warning-strong" />
                <MoneyCell value={Number(period.cost_of_goods)} className="text-ink-muted" />
                <MoneyCell value={Number(period.gross_profit)} className="text-brand-strong" />
                <MoneyCell value={Number(period.expired_loss)} className="text-danger-strong" />
                <MoneyCell value={Number(period.spoiled_loss)} className="text-danger-strong" />
                <MoneyCell value={Number(period.damaged_loss)} className="text-danger-strong" />
                <MoneyCell value={Number(period.net_profit)} className={netClass(Number(period.net_profit))} />
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 border-t border-gray-200 bg-subtle font-semibold">
            <tr>
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right tabular-nums">{totals.orders}</td>
              <MoneyCell value={totals.revenue} />
              <MoneyCell value={totals.near_expiry_discount} className="text-warning-strong" />
              <MoneyCell value={totals.cost_of_goods} />
              <MoneyCell value={totals.gross_profit} className="text-brand-strong" />
              <MoneyCell value={totals.expired_loss} className="text-danger-strong" />
              <MoneyCell value={totals.spoiled_loss} className="text-danger-strong" />
              <MoneyCell value={totals.damaged_loss} className="text-danger-strong" />
              <MoneyCell value={totals.net_profit} className={netClass(totals.net_profit)} />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
