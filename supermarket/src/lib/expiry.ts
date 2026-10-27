import { NEAR_EXPIRY_DAYS } from './pricing';

// Expiry helpers shared by the Inventory screen and the POS product details.
// Dates are compared in Philippine time, the same as the database does.

// Today's date in Manila, as a UTC timestamp at midnight.
function phtToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day));
}

// Whole days from today until the expiry date ('2026-11-02'). Negative once
// it has passed; 0 means it expires today.
export function daysUntilExpiry(expiryDate: string): number {
  const [year, month, day] = expiryDate.split('-').map(Number);
  return Math.floor((Date.UTC(year, month - 1, day) - phtToday()) / 86_400_000);
}

// Near expiry = still sellable, but expiring within NEAR_EXPIRY_DAYS days.
// These units get the near-expiry markdown (see pricing.ts).
export function isNearExpiry(expiryDate: string | null): boolean {
  if (!expiryDate) return false;
  const days = daysUntilExpiry(expiryDate);
  return days > 0 && days <= NEAR_EXPIRY_DAYS;
}

// A friendly label: "Expires tomorrow", "Expires in 3 days", "Expired 2 days ago"...
export function formatExpiry(expiryDate: string | null) {
  if (!expiryDate) return 'No expiry date';
  const [year, month, day] = expiryDate.split('-').map(Number);
  const days = daysUntilExpiry(expiryDate);
  if (days === 0) return 'Expired today';
  if (days === 1) return 'Expires tomorrow';
  if (days > 1 && days <= 7) return `Expires in ${days} days`;
  if (days < 0) return `Expired ${Math.abs(days)} days ago`;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString();
}
