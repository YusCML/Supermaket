// Loyalty program rules for the POS screen.
//
// The database has the final say: process_pos_checkout_base() (latest version in
// supabase/migrations/20261101140000_points_worth_five_pesos.sql) applies these
// same rules when the sale is saved, and it's also where members EARN points
// (1 point per full ₱100 paid in cash/card). These helpers only exist so the
// cashier sees the right numbers before hitting "Complete Transaction".
//
// If you change a rule here, change it in that migration too.
//
// Used by src/components/POS.tsx (the points box and the totals) and
// src/pages/LandingPage.tsx (which shows "₱5 off for every point").

// One loyalty point takes ₱5 off the bill. (Members still EARN 1 point per
// ₱100 paid, so this works out to 5% back.) Keep in step with
// peso_value_per_point in the database function.
export const PESO_VALUE_PER_POINT = 5;

// Adding up prices like 45.50 + 24.75 in JavaScript can leave tiny leftovers
// (e.g. 70.25000000000001). Rounding to whole centavos keeps the math honest.
// How: ×100 turns pesos into centavos, Math.round makes that a whole number,
// ÷100 turns it back into pesos. e.g. 70.25000000000001 -> 7025 -> 70.25.
export function roundToCentavos(amount: number): number {
  return Math.round(amount * 100) / 100;
}

// The most points a member can put toward this bill. They can't use points
// they don't have, and there's no reason to use more than it takes to bring
// the bill to ₱0. We round up so points can cover the last few pesos too:
// a ₱47 bill can be fully paid with 10 points (worth ₱50; the extra ₱3 is
// simply not used, since the discount never goes above the bill).
// Inputs: the member's points balance and the bill (after near-expiry
// markdowns). Output: the largest number of points the POS will allow.
// The database refuses more than this too ("Only N points are needed...").
export function maxRedeemablePoints(pointsBalance: number, billTotal: number): number {
  // Math.ceil rounds UP: ₱47 ÷ ₱5 = 9.4 -> 10 points.
  const pointsToCoverBill = Math.ceil(billTotal / PESO_VALUE_PER_POINT);
  // The smaller of "what they have" and "what the bill needs", and never
  // below 0 (Math.max) in case of an odd input like a negative bill.
  return Math.max(0, Math.min(pointsBalance, pointsToCoverBill));
}

// How many pesos the points take off. Never more than the bill itself.
// e.g. 10 points on a ₱47 bill: 10 × ₱5 = ₱50, capped at ₱47.
export function discountForPoints(points: number, billTotal: number): number {
  return Math.min(points * PESO_VALUE_PER_POINT, billTotal);
}

// How many points it takes to cover `amount` pesos, rounded UP, because one
// point only comes in whole ₱5 steps. e.g. ₱7 short -> 2 points (₱10).
// Used by the POS "Use points for the short amount" button. Worked out in
// whole centavos (× 100) so a tiny decimal error like 10.000000001 can't
// tip it over into an extra point. Nothing owed (0 or less) -> 0 points.
export function pointsToCover(amount: number): number {
  if (amount <= 0) return 0;
  return Math.ceil(Math.round(amount * 100) / (PESO_VALUE_PER_POINT * 100));
}
