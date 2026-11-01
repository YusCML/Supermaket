// ════════════════════════════════════════════════════════════════════════════
// ProfitLoss.tsx: the chart and table for the period on show in the
// Analytics tab (so only admins see it).
//
// Analytics.tsx decides WHICH period is on show (a day, a month or a year)
// and passes in its rows: hours of the day, days of the month, or months of
// the year. This component draws them:
//   - a chart, one column per row: the bar is the gross sales, the line is
//     the net income (it dips below the zero line when a row lost money);
//   - a table, one line per row, with a Total line at the bottom.
// Clicking a column or a table row "opens" it (onOpen): in a year that shows
// the month, in a month that shows the day. Hours don't open any further.
//
// The words, as used everywhere on the Analytics tab. All of them are worked
// out in the database by profit_and_loss_between():
//   Orders          how many sales were made.
//   Gross sales     money actually taken in from customers
//                   (orders.final_amount): AFTER the 15% near-expiry
//                   markdown and AFTER the part paid with loyalty points.
//   Cost of goods   what the items sold cost the store: quantity × the cost
//                   saved on each order line at the moment of sale.
//   Stock losses    stock that left WITHOUT being sold, valued at cost:
//                   expired + spoiled + damaged (rows in spoilage_logs).
//   Total cost      cost of goods + stock losses.
//   Net income      gross sales − total cost. What the store really made.
// ════════════════════════════════════════════════════════════════════════════
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ProfitLossPeriod, ProfitLossTotals } from '../types/app';
import { slotLabel, type Step } from '../lib/periods';
import { cn } from '@/lib/utils';

// ── Colours ────────────────────────────────────────────────────────────────
// Gross sales = the brand green bars; net income = a dark ink line. A line
// and bars are told apart by their shape, not only their colour, and the
// table under the chart has every number. Recharts draws SVG, so it needs
// real colour values: SALES_COLOR is --color-brand and NET_COLOR is
// --color-ink from index.css.
const SALES_COLOR = '#00873E';
const NET_COLOR = '#2A2F26';
const GRID = '#E5E7EB';
const AXIS_TEXT = '#666666';
const axisTick = { fill: AXIS_TEXT, fontSize: 12 };

// ── Formatting ─────────────────────────────────────────────────────────────
// Full amount: ₱12,345.60 (a minus sign in front when negative: −₱30.00).
export const money = (value: number) =>
  `${value < 0 ? '−' : ''}₱${Math.abs(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// Short amount for the chart's left axis: ₱950, ₱1.2K, −₱3K.
const compactNumber = new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 });
const compactMoney = (value: number) => `${value < 0 ? '−' : ''}₱${compactNumber.format(Math.abs(value))}`;

// Net income in colour: green when positive, red when negative.
export const netClass = (value: number) =>
  value < 0 ? 'font-semibold text-danger-strong' : value > 0 ? 'font-semibold text-brand-strong' : '';

// The numbers of one row (or of the totals), as real numbers. Numbers can
// arrive from the database as text, so each goes through Number(...).
export function rowNumbers(row: ProfitLossTotals) {
  const costOfGoods = Number(row.cost_of_goods);
  const losses = Number(row.total_losses);
  return {
    orders: Number(row.orders),
    grossSales: Number(row.revenue),
    costOfGoods,
    losses,
    totalCost: costOfGoods + losses,
    netIncome: Number(row.net_profit),
  };
}

// A money cell in the table. Zero shows as a dash so the real numbers stand out.
function MoneyCell({ value, className }: { value: number; className?: string }) {
  return (
    <td className={cn('px-3 py-2 text-right whitespace-nowrap tabular-nums', className)}>
      {value === 0 ? <span className="text-ink-subtle">—</span> : money(value)}
    </td>
  );
}

// One column of the chart.
interface ChartRow {
  start: string;
  label: string; // short name under the column ("8 AM", "2", "Jan")
  longLabel: string; // full name for the hover box
  grossSales: number;
  netIncome: number;
  row: ProfitLossPeriod;
}

// The box shown when hovering a column. Recharts passes `active` (is the
// mouse over a column?) and `payload` (each entry's `.payload` is the
// ChartRow that column was drawn from). Returning null draws nothing.
function ChartTooltip({ active, payload, canOpen }: { active?: boolean; payload?: { payload: ChartRow }[]; canOpen: boolean }) {
  if (!active || !payload?.length) return null;
  const { longLabel, row } = payload[0].payload;
  const n = rowNumbers(row);
  return (
    <div className="space-y-1 rounded-md border border-gray-200 bg-white p-3 text-xs shadow-md">
      <div className="font-semibold text-ink">{longLabel}</div>
      <div className="flex justify-between gap-6">
        <span className="text-ink-muted">Orders</span>
        <span className="tabular-nums">{n.orders}</span>
      </div>
      <div className="flex justify-between gap-6">
        <span className="text-ink-muted">Gross sales</span>
        <span className="tabular-nums">{money(n.grossSales)}</span>
      </div>
      <div className="flex justify-between gap-6">
        <span className="text-ink-muted">Total cost</span>
        <span className="tabular-nums">{money(n.totalCost)}</span>
      </div>
      <div className="flex justify-between gap-6 border-t border-gray-100 pt-1 font-semibold">
        <span>Net income</span>
        <span className={cn('tabular-nums', netClass(n.netIncome))}>{money(n.netIncome)}</span>
      </div>
      {canOpen && <div className="pt-1 text-[11px] text-ink-subtle">Click to open</div>}
    </div>
  );
}

interface ProfitLossProps {
  // How the rows are split: 'hour', 'day' or 'month'.
  step: Step;
  // The rows, oldest first (left to right in the chart).
  periods: ProfitLossPeriod[];
  // The whole period's totals (the table's Total line).
  totals: ProfitLossTotals;
  // The word for one row, for the table heading ("Hour", "Day", "Month").
  rowWord: string;
  // Called with a row's start when it's clicked, to open it. Left out when
  // rows can't be opened (hours).
  onOpen?: (start: string) => void;
}

export default function ProfitLoss({ step, periods, totals, rowWord, onOpen }: ProfitLossProps) {
  const chartRows: ChartRow[] = periods.map((row) => ({
    start: row.start,
    label: slotLabel(step, row.start, false),
    longLabel: slotLabel(step, row.start, true),
    grossSales: Number(row.revenue),
    netIncome: Number(row.net_profit),
    row,
  }));
  // Anything at all to draw? (Sales or losses in at least one row.)
  const hasAnyData = periods.some((p) => Number(p.revenue) !== 0 || Number(p.total_losses) !== 0);
  // The table: every day / month, but only the hours that had something
  // going on (24 mostly empty lines would hide the busy ones).
  const tableRows = step === 'hour' ? periods.filter((p) => Number(p.orders) > 0 || Number(p.total_losses) > 0) : periods;
  const sum = rowNumbers(totals);

  return (
    <div className="space-y-5">
      {/* ── Chart ── */}
      {hasAnyData ? (
        <>
          {/* Legend: what the two marks mean (hand-made so it can sit above
              the chart; aria-hidden because the table has every number). */}
          <div className="flex flex-wrap justify-end gap-4 text-xs text-ink-muted" aria-hidden="true">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-sm" style={{ background: SALES_COLOR }} /> Gross sales
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ background: NET_COLOR }} /> Net income
            </span>
          </div>
          {/* How the chart is built (Recharts):
                ResponsiveContainer  as wide as its box; redraws on resize
                ComposedChart        bars and a line together, one column
                                     per row in `data`
                ReferenceLine y=0    the ₱0 line net income dips below
                onClick              Recharts says which column was clicked
                                     (activeTooltipIndex: its position in
                                     the list, as a number or as text) */}
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart
              data={chartRows}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              onClick={(state) => {
                if (!onOpen || state?.activeTooltipIndex == null) return;
                const index = Number(state.activeTooltipIndex);
                const row = Number.isInteger(index) ? chartRows[index] : undefined;
                if (row) onOpen(row.start);
              }}
              style={onOpen ? { cursor: 'pointer' } : undefined}
            >
              <CartesianGrid vertical={false} stroke={GRID} />
              {/* Hours: every 3rd label; days: as many as fit; months: all. */}
              <XAxis
                dataKey="label"
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                interval={step === 'hour' ? 2 : step === 'day' ? 'preserveStartEnd' : 0}
              />
              <YAxis tickFormatter={compactMoney} tick={axisTick} tickLine={false} axisLine={false} width={60} />
              <ReferenceLine y={0} stroke="#9CA3AF" />
              <Tooltip content={<ChartTooltip canOpen={Boolean(onOpen)} />} cursor={{ fill: 'rgba(0, 0, 0, 0.04)' }} />
              <Bar dataKey="grossSales" name="Gross sales" fill={SALES_COLOR} maxBarSize={28} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Line
                dataKey="netIncome"
                name="Net income"
                type="monotone"
                stroke={NET_COLOR}
                strokeWidth={2}
                dot={{ r: 2.5, fill: NET_COLOR, strokeWidth: 0 }}
                activeDot={{ r: 5, stroke: '#FFFFFF', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </>
      ) : (
        <div className="flex h-[200px] items-center justify-center rounded-md border border-dashed border-gray-200 text-sm text-ink-muted">
          No sales or stock losses in this period.
        </div>
      )}

      {/* ── Table ── */}
      {/* The box scrolls when the table is tall (a month has up to 31
          lines); the heading (sticky top-0) and the Total line (sticky
          bottom-0) stay in view. Lines that can be opened are clickable and
          reachable with the keyboard (Tab, then Enter or Space). */}
      <div className="max-h-[28rem] overflow-auto rounded-md border border-gray-200">
        <table className="w-full text-left text-xs text-ink">
          <thead className="sticky top-0 z-10 border-b border-gray-200 bg-subtle font-semibold text-ink-muted">
            <tr>
              <th className="px-3 py-2">{rowWord}</th>
              <th className="px-3 py-2 text-right">Orders</th>
              <th className="px-3 py-2 text-right">Gross sales</th>
              <th className="px-3 py-2 text-right">Cost of goods</th>
              <th className="px-3 py-2 text-right">Stock losses</th>
              <th className="px-3 py-2 text-right">Total cost</th>
              <th className="px-3 py-2 text-right">Net income</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tableRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-ink-muted">
                  No sales or stock losses on this day.
                </td>
              </tr>
            )}
            {tableRows.map((row) => {
              const n = rowNumbers(row);
              const open = onOpen ? () => onOpen(row.start) : undefined;
              return (
                <tr
                  key={row.start}
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
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{slotLabel(step, row.start, true)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {n.orders === 0 ? <span className="text-ink-subtle">—</span> : n.orders}
                  </td>
                  <MoneyCell value={n.grossSales} />
                  <MoneyCell value={n.costOfGoods} className="text-ink-muted" />
                  <MoneyCell value={n.losses} className="text-danger-strong" />
                  <MoneyCell value={n.totalCost} />
                  <MoneyCell value={n.netIncome} className={netClass(n.netIncome)} />
                </tr>
              );
            })}
          </tbody>
          <tfoot className="sticky bottom-0 border-t border-gray-200 bg-subtle font-semibold">
            <tr>
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right tabular-nums">{sum.orders}</td>
              <MoneyCell value={sum.grossSales} />
              <MoneyCell value={sum.costOfGoods} />
              <MoneyCell value={sum.losses} className="text-danger-strong" />
              <MoneyCell value={sum.totalCost} />
              <MoneyCell value={sum.netIncome} className={netClass(sum.netIncome)} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
