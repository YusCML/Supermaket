// Near-expiry markdown: stock that expires within the next NEAR_EXPIRY_DAYS
// days (and hasn't expired yet) sells at NEAR_EXPIRY_PERCENT_OFF off, so it
// sells before it has to be thrown away.
//
// Keep these numbers in sync with process_pos_checkout() in
// supabase/migrations/20261027150000_near_expiry_discount.sql. The database
// works out the real price when the sale is saved; this file is only the
// preview the POS shows before that.
export const NEAR_EXPIRY_DAYS = 7;
export const NEAR_EXPIRY_PERCENT_OFF = 15;

// The marked-down price of one unit, e.g. ₱95.00 -> ₱80.75.
//
// Worked out in whole centavos so it rounds exactly like the database does.
// With plain decimals, ₱10.10 × 0.85 comes out as 8.58499999... in JavaScript
// and would round to ₱8.58, while the database (correctly) says ₱8.59.
export function markedDownPrice(price: number): number {
  const centavos = Math.round(price * 100);
  return Math.round((centavos * (100 - NEAR_EXPIRY_PERCENT_OFF)) / 100) / 100;
}

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
export function priceLine(price: number, quantity: number, nearExpiryUnits: number): LinePrice {
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
