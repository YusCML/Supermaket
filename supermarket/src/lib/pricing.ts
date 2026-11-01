// Near-expiry markdown: stock that expires within the next NEAR_EXPIRY_DAYS
// days (and hasn't expired yet) sells at NEAR_EXPIRY_PERCENT_OFF off, so it
// sells before it has to be thrown away.
//
// Keep these numbers in sync with the database. The markdown was added to
// checkout in supabase/migrations/20261027150000_near_expiry_discount.sql;
// today it lives in process_pos_checkout_base() (latest copy in
// 20261101140000_points_worth_five_pesos.sql: near_expiry_days and
// near_expiry_percent_off). The same 7 days are also written into
// get_product_inventory(), and the same 15 into the receipt part of
// process_pos_checkout(). The database works out the real price when the
// sale is saved; this file is only the preview the POS shows before that.
//
// Used by POS.tsx, ProductMenu.tsx, ProductDetails.tsx, Inventory.tsx,
// ProfitLoss.tsx, LandingPage.tsx (mostly to show "15% off") and lib/expiry.ts.
export const NEAR_EXPIRY_DAYS = 7;
export const NEAR_EXPIRY_PERCENT_OFF = 15;

// The marked-down price of one unit, e.g. ₱95.00 -> ₱80.75.
//
// Worked out in whole centavos so it rounds exactly like the database does.
// With plain decimals, ₱10.10 × 0.85 comes out as 8.58499999... in JavaScript
// and would round to ₱8.58, while the database (correctly) says ₱8.59.
export function markedDownPrice(price: number): number {
  // 1. Pesos -> whole centavos: ₱95.00 -> 9500.
  const centavos = Math.round(price * 100);
  // 2. Keep 85% (100 - 15) of it: 9500 × 85 / 100 = 8075 centavos, rounded to
  //    a whole centavo. 3. Back to pesos: 8075 / 100 = ₱80.75.
  return Math.round((centavos * (100 - NEAR_EXPIRY_PERCENT_OFF)) / 100) / 100;
}

// The result of priceLine() below. An `interface` describes the shape of an
// object: which fields it has and what type each one is.
export interface LinePrice {
  markedDownQty: number; // units sold at the near-expiry price
  fullPriceQty: number; // units sold at the normal price
  total: number; // what the line costs
  savings: number; // how much the markdown took off
}

// What one basket line costs. Stock is always sold soonest-expiry first, so
// the first `nearExpiryUnits` units of the line are the marked-down ones and
// any extra are full price. E.g. 2 near-expiry milk + buying 3 = 2 at ₱80.75
// and 1 at ₱95.00.
//
// Inputs: the normal unit price, how many are in the line, and how many
// near-expiry units there are. (When the cashier picked a near-expiry batch,
// POS.tsx passes the whole quantity, since every unit comes from that batch;
// when they picked a batch that isn't near expiry, it passes 0.)
export function priceLine(price: number, quantity: number, nearExpiryUnits: number): LinePrice {
  // Can't mark down more units than the line has, or fewer than 0.
  const markedDownQty = Math.min(quantity, Math.max(0, nearExpiryUnits));
  const fullPriceQty = quantity - markedDownQty;

  // Again in centavos, to avoid decimal drift when adding lines up.
  const priceCentavos = Math.round(price * 100);
  const saleCentavos = Math.round(markedDownPrice(price) * 100);
  const totalCentavos = markedDownQty * saleCentavos + fullPriceQty * priceCentavos;
  const fullCentavos = quantity * priceCentavos;

  return {
    markedDownQty,
    fullPriceQty,
    total: totalCentavos / 100,
    savings: (fullCentavos - totalCentavos) / 100,
  };
}
