import { NEAR_EXPIRY_DAYS } from './pricing';
import type { ProductBatch } from '../types/app';

// Expiry helpers shared by the Inventory screen and the POS product details.
// Dates are compared in Philippine time, the same as the database does.
//
// Used by Inventory.tsx, POS.tsx, ProductDetails.tsx and BatchBreakdown.tsx.
//
// Why Philippine time? The store is in Manila, and the database decides
// "expired" with the Manila date. If we used the computer's own clock zone, a
// browser set to another zone could disagree with the database about what day
// it is, and show stock as sellable that the database would refuse.
// The rule everywhere: a batch whose expiry date is TODAY or earlier counts as
// expired; a batch expiring in 1 to 7 days is "near expiry" (15% off).
//
// Expiry dates arrive from the database as text like '2026-11-05' (a date
// with no time and no time zone).

// Today's date in Manila, as a UTC timestamp at midnight.
// A "timestamp" here is a number of milliseconds since 1 Jan 1970 (UTC).
// Steps:
//   1. Ask the browser to write the current moment as a date in the
//      'Asia/Manila' zone, broken into parts (year, month, day).
//      ('en-CA' is just a locale that gives plain numbers.)
//   2. Turn the parts into an object like { year: '2026', month: '11', day: '01' }.
//   3. Make a timestamp for midnight UTC on that date. Using UTC for both
//      "today" and the expiry date means no daylight-saving or zone shifts
//      can creep into the subtraction in daysUntilExpiry().
function phtToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  // `- 1` because JavaScript counts months from 0 (January = 0).
  return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day));
}

// Whole days from today until the expiry date ('2026-11-02'). Negative once
// it has passed; 0 means it expires today.
// Today's date in the Philippines as 'YYYY-MM-DD', e.g. '2026-11-02'.
// Used by the date picker (to mark today and work out "in 1 month") and the
// Inventory forms. phtToday() above is midnight UTC of that date, so
// toISOString() writes exactly that day.
export function todayInManila(): string {
  return new Date(phtToday()).toISOString().slice(0, 10);
}

export function daysUntilExpiry(expiryDate: string): number {
  // '2026-11-02' -> [2026, 11, 2]
  const [year, month, day] = expiryDate.split('-').map(Number);
  // Both sides are midnight UTC, so the difference is an exact number of
  // days. 86,400,000 = milliseconds in one day (24 × 60 × 60 × 1000).
  return Math.floor((Date.UTC(year, month - 1, day) - phtToday()) / 86_400_000);
}

// Near expiry = still sellable, but expiring within NEAR_EXPIRY_DAYS days.
// These units get the near-expiry markdown (see pricing.ts).
// `days > 0` leaves out today (already expired); `<= 7` is the window.
// No expiry date (null) is never near expiry.
export function isNearExpiry(expiryDate: string | null): boolean {
  if (!expiryDate) return false;
  const days = daysUntilExpiry(expiryDate);
  return days > 0 && days <= NEAR_EXPIRY_DAYS;
}

// The batches that can still be sold (active, some left, not expired), in the
// order they're sold by default: soonest expiry first, no expiry date last,
// then oldest batch first. Same rules as the database (consume_product_batches).
// (The database breaks ties by received_at, then id; a bigger id normally
// means a later batch, so ordering by id gives the same result.)
export function sellableBatches(batches: ProductBatch[]): ProductBatch[] {
  return batches
    // 1. Keep batches that are active and still have units.
    .filter((b) => b.status === 'active' && b.quantity_remaining > 0)
    // 2. Drop expired ones. A batch with no expiry date never expires.
    .filter((b) => !b.expiry_date || daysUntilExpiry(b.expiry_date) > 0)
    // 3. Sort. A sort compare function returns a negative number if `a`
    //    should come first, positive if `b` should, 0 if it doesn't matter.
    .sort((a, b) => {
      // Same date (or both without one): oldest batch (smaller id) first.
      if (a.expiry_date === b.expiry_date) return a.id - b.id;
      // No expiry date goes after any real date.
      if (!a.expiry_date) return 1;
      if (!b.expiry_date) return -1;
      // 'YYYY-MM-DD' text sorts in the same order as the dates themselves,
      // so comparing the text is enough.
      return a.expiry_date.localeCompare(b.expiry_date);
    });
}

// The expiry date written out, plus how far away it is:
//   "Nov 5, 2026 · in 4 days", "Oct 30, 2026 · 2 days ago", "No expiry date".
// Used in dropdowns and tables where both the date and the countdown help.
export function describeExpiry(expiryDate: string | null): string {
  if (!expiryDate) return 'No expiry date';
  const [year, month, day] = expiryDate.split('-').map(Number);
  // Write the date as "Nov 5, 2026". The Date is made at midnight UTC, so it
  // must also be SHOWN in UTC (timeZone: 'UTC'); otherwise a browser in a
  // zone behind UTC would show the day before.
  const date = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const days = daysUntilExpiry(expiryDate);
  // A chain of `condition ? a : b` (the "ternary" operator): read it as
  // if / else if / else. The last line adds the "s" except for exactly 1 day.
  const when =
    days === 0 ? 'today'
    : days === 1 ? 'tomorrow'
    : days > 1 ? `in ${days} days`
    : `${Math.abs(days)} day${days === -1 ? '' : 's'} ago`;
  return `${date} · ${when}`;
}

// A friendly label: "Expires tomorrow", "Expires in 3 days", "Expired 2 days ago"...
// Today counts as expired ("Expired today"), matching the database.
// More than 7 days away, it just shows the date in the browser's usual
// format (e.g. "12/25/2026" in a US-English browser).
export function formatExpiry(expiryDate: string | null) {
  if (!expiryDate) return 'No expiry date';
  const [year, month, day] = expiryDate.split('-').map(Number);
  const days = daysUntilExpiry(expiryDate);
  if (days === 0) return 'Expired today';
  if (days === 1) return 'Expires tomorrow';
  if (days > 1 && days <= 7) return `Expires in ${days} days`;
  if (days < 0) return `Expired ${Math.abs(days)} day${days === -1 ? '' : 's'} ago`;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, { timeZone: 'UTC' });
}
