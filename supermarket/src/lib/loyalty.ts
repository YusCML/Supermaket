// Loyalty program rules for the POS screen.
//
// The database has the final say: process_pos_checkout_base() (latest version in
// supabase/migrations/20261101140000_points_worth_five_pesos.sql) applies these
// same rules when the sale is saved, and it's also where members EARN points
// (1 point per full ₱100 paid in cash/card). These helpers only exist so the
// cashier sees the right numbers before hitting "Complete Transaction".
//
// If you change a rule here, change it in that migration too.

// One loyalty point takes ₱5 off the bill. (Members still EARN 1 point per
// ₱100 paid, so this works out to 5% back.) Keep in step with
// peso_value_per_point in the database function.
export const PESO_VALUE_PER_POINT = 5;

// Adding up prices like 45.50 + 24.75 in JavaScript can leave tiny leftovers
// (e.g. 70.25000000000001). Rounding to whole centavos keeps the math honest.
export function roundToCentavos(amount: number): number {
  return Math.round(amount * 100) / 100;
}

// The most points a member can put toward this bill. They can't use points
// they don't have, and there's no reason to use more than it takes to bring
// the bill to ₱0. We round up so points can cover the last few pesos too:
// a ₱47 bill can be fully paid with 10 points (worth ₱50; the extra ₱3 is
// simply not used, since the discount never goes above the bill).
export function maxRedeemablePoints(pointsBalance: number, billTotal: number): number {
  const pointsToCoverBill = Math.ceil(billTotal / PESO_VALUE_PER_POINT);
  return Math.max(0, Math.min(pointsBalance, pointsToCoverBill));
}

// How many pesos the points take off. Never more than the bill itself.
export function discountForPoints(points: number, billTotal: number): number {
  return Math.min(points * PESO_VALUE_PER_POINT, billTotal);
}
