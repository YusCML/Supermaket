// periods.ts: days, months and years for the Analytics tab.
//
// The Analytics tab (Analytics.tsx) browses ONE period at a time:
//   Day    one day, split hour by hour
//   Month  one month, split day by day
//   Year   one year, split month by month
// with ‹ › to go to the previous / next one. These helpers do the date work:
//   VIEWS          the Day / Month / Year buttons
//   rangeFor()     the first and last day of the period on show, and how it's
//                  split (what the database is asked for)
//   shiftAnchor()  the previous / next day, month or year
//   viewTitle()    the period's name ("Monday, November 2, 2026", "November
//                  2026", "2026")
//   slotLabel()    one row's name ("8 AM", "Nov 2", "January")
//   sumPeriods()   rows added together into one set of totals
//
// The period on show is remembered as one date, the "anchor"
// ('YYYY-MM-DD'): the day itself, or any day in the month / year.
// Dates are read and written in UTC on purpose, so the day can never shift
// by one because of the time zone the computer happens to be set to.
import type { ProfitLossPeriod, ProfitLossSeries, ProfitLossTotals } from '../types/app';

// Which period is on show, and how its rows are split.
export type View = 'day' | 'month' | 'year';
export type Step = ProfitLossSeries['step']; // 'hour' | 'day' | 'month'

// The Day / Month / Year buttons: the value, the button text, how the period
// is split, and the word for one row (for "Click a day to open it").
export const VIEWS: { id: View; label: string; step: Step; rowWord: string; splitLabel: string }[] = [
  { id: 'day', label: 'Day', step: 'hour', rowWord: 'hour', splitLabel: 'Hour by hour' },
  { id: 'month', label: 'Month', step: 'day', rowWord: 'day', splitLabel: 'Day by day' },
  { id: 'year', label: 'Year', step: 'month', rowWord: 'month', splitLabel: 'Month by month' },
];

// ── Date maths on 'YYYY-MM-DD' text ──
const fromKey = (key: string) => new Date(`${key.slice(0, 10)}T00:00:00Z`);
const toKey = (date: Date) => date.toISOString().slice(0, 10);

// The last day of a month: Date.UTC(year, month, 0) is "day 0 of the NEXT
// month", which JavaScript treats as the last day of this one (`month` here
// is 1-12, while Date.UTC counts months from 0).
const lastDayOfMonth = (year: number, month: number) => toKey(new Date(Date.UTC(year, month, 0)));

// The period on show as dates, and how to split it:
//   day    that day only, hour by hour
//   month  the 1st to the last day of the month, day by day
//   year   1 January to 31 December, month by month
export function rangeFor(view: View, anchor: string): { from: string; to: string; step: Step } {
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7));
  if (view === 'day') return { from: anchor, to: anchor, step: 'hour' };
  if (view === 'month') return { from: `${anchor.slice(0, 7)}-01`, to: lastDayOfMonth(year, month), step: 'day' };
  return { from: `${year}-01-01`, to: `${year}-12-31`, step: 'month' };
}

// The previous (by = -1) or next (by = 1) day, month or year. For months and
// years the anchor moves to the 1st, so e.g. Jan 31 + 1 month can't overflow.
export function shiftAnchor(view: View, anchor: string, by: number): string {
  const date = fromKey(anchor);
  if (view === 'day') return toKey(new Date(date.getTime() + by * 86_400_000));
  if (view === 'month') return toKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + by, 1)));
  return `${date.getUTCFullYear() + by}-01-01`;
}

// The name of the period on show.
export function viewTitle(view: View, anchor: string): string {
  const date = fromKey(anchor);
  if (view === 'day') {
    return date.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }
  if (view === 'month') return date.toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return String(date.getUTCFullYear());
}

// One row's name. Short for under the chart columns, long for the table and
// the hover box:
//   hour   "8 AM"         / "8:00 – 9:00 AM"
//   day    "2"            / "Mon, Nov 2"
//   month  "Jan"          / "January 2026"
export function slotLabel(step: Step, start: string, long: boolean): string {
  if (step === 'hour') {
    const hour = Number(start.slice(11, 13));
    const clock = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 || h === 24 ? ' AM' : ' PM'}`;
    if (!long) return clock(hour);
    return `${clock(hour).replace(' ', ':00 ')} – ${clock(hour + 1).replace(' ', ':00 ')}`;
  }
  const date = fromKey(start);
  if (step === 'day') {
    return long
      ? date.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
      : String(date.getUTCDate());
  }
  return date.toLocaleDateString('en-PH', long ? { month: 'long', year: 'numeric', timeZone: 'UTC' } : { month: 'short', timeZone: 'UTC' });
}

// Every number in a period that can be added up. Adding is correct because
// each is a plain sum (no averages or percentages), so the total for a range
// = the sum of its rows. `keyof ProfitLossTotals` means "one of the field
// names of ProfitLossTotals", so a misspelt name is a TypeScript error.
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

// Adds a list of periods together into one set of totals.
// Starts from { orders: 0, revenue: 0, … } (Object.fromEntries turns a list of
// [name, value] pairs into an object). `as unknown as ProfitLossTotals` tells
// TypeScript "trust me, this has the right shape". `Number(...) || 0` turns a
// missing or invalid value (or a number sent as text) into a real number.
export function sumPeriods(periods: ProfitLossPeriod[]): ProfitLossTotals {
  const totals = Object.fromEntries(TOTAL_KEYS.map((key) => [key, 0])) as unknown as ProfitLossTotals;
  for (const period of periods) {
    for (const key of TOTAL_KEYS) totals[key] += Number(period[key]) || 0;
  }
  return totals;
}
