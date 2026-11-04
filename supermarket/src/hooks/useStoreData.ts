// useStoreData.ts: a custom React hook that loads the store's data for a page.
//
// A "hook" is a function whose name starts with `use` and that uses React's
// built-in hooks (useState, useEffect...) inside. Calling it from a component
// gives that component its own copy of the state, and the screen redraws
// whenever that state changes.
//
// Used by the three role pages:
//   src/pages/SelfServePage.tsx -> useStoreData('customer')
//   src/pages/CashierPage.tsx   -> useStoreData('cashier')
//   src/pages/AdminPage.tsx     -> useStoreData('admin')
// It gets everything from src/lib/api.ts and hands back the lists, a
// loading flag, an error sentence, and functions to reload and to check out.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import type {
  AppRole,
  CheckoutPayload,
  Customer,
  LoyaltyLog,
  Product,
  ProductBatch,
  ProductInventorySummary,
  CheckoutReceipt,
} from '../types/app';

// Loads the store data a page needs and keeps it in one place, so the
// customer, cashier and admin pages don't each repeat the same fetching code.
//
// `role` is the interface being used, and decides what gets fetched:
//   customer -> products, stock levels, batches, and their own loyalty profile
//   cashier  -> + every member (for the lookup)
//   admin    -> + the loyalty points log
// Fetching more wouldn't leak anything (the database only returns what the
// person may see), it would just be wasted requests.
//
// In the code below, only 'admin' changes which requests are sent (it adds
// the points log). Customer and cashier send the same requests; the
// difference in members comes from the database's row-level security, which
// returns every member to staff but only their own row to a customer.
export function useStoreData(role: AppRole) {
  // Who is signed in (from AuthContext). Used to start loading once they are.
  const { user } = useAuth();
  const isAdmin = role === 'admin';

  // The data, one piece of state each. useState<Product[]>([]) = "remember a
  // list of products, starting empty"; the <...> part tells TypeScript what
  // kind of value it holds. Calling a setter (setProducts...) redraws the page.
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<ProductInventorySummary[]>([]);
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [logs, setLogs] = useState<LoyaltyLog[]>([]);
  // Starts as true so the page shows its spinner until the first load ends.
  const [loading, setLoading] = useState(true);
  // What couldn't be loaded last time, as a sentence for the screen
  // (e.g. "Couldn't load members."), or null when everything loaded.
  const [loadError, setLoadError] = useState<string | null>(null);

  // Pull fresh products, members, batches, and inventory summaries after sales
  // and stock changes so the POS and Inventory screens stay current.
  // `showLoading` (true unless told otherwise) decides whether the page shows
  // its loading screen meanwhile. After a sale we pass false, so the receipt
  // stays on screen while the numbers refresh quietly in the background.
  // Pages also call this after saving something, and from the "Try again"
  // button when loading failed.
  const loadData = async (showLoading = true) => {
    if (showLoading) setLoading(true);

    // allSettled waits for EVERY request, even if some fail, so one failed
    // request doesn't throw away everything that loaded fine (Promise.all
    // would). Each result is either { status: 'fulfilled', value } or
    // { status: 'rejected', reason }.
    // 1. Send all five requests at once and wait for every answer.
    const [prodRes, custRes, logRes, invRes, batchRes, costRes] = await Promise.allSettled([
      api.getProducts(),
      api.getCustomers(),
      // Only admins can read the points log. For everyone else,
      // Promise.resolve([]) is a ready-made "answer" of an empty list, so the
      // five results always line up with the five names above.
      isAdmin ? api.getLoyaltyLogs() : Promise.resolve([] as LoyaltyLog[]),
      // Everyone gets the stock summary: customers need it at self-serve to
      // see near-expiry markdowns and expiry dates.
      api.getInventoryOverview(),
      // Everyone gets the batches too, so customers can pick one at self-serve.
      api.getProductBatches(),
      // What products cost the store: admins only (the database refuses
      // everyone else). Needed for the Edit product form.
      isAdmin ? api.getProductCosts() : Promise.resolve({} as Record<number, number>),
    ]);

    // 2. Save each list that arrived, and note the name of each one that
    //    didn't. A failed list keeps its previous value, so the screen still
    //    shows the last data that did load.
    //    (api.getLoyaltyLogs() handles its own errors and returns [] instead
    //    of failing, so 'the points log' will normally not appear here.)
    const failed: string[] = [];
    if (prodRes.status === 'fulfilled') {
      // For admins, put each product's cost onto it (costs come separately
      // because only admins may see them). Everyone else gets no cost at all.
      const costs = costRes.status === 'fulfilled' ? costRes.value : {};
      setProducts(prodRes.value.map((product) => ({ ...product, cost: costs[product.id] })));
    } else failed.push('products');
    if (costRes.status === 'rejected') failed.push('product costs');
    if (custRes.status === 'fulfilled') setCustomers(custRes.value);
    else failed.push('members');
    if (logRes.status === 'fulfilled') setLogs(logRes.value);
    else failed.push('the points log');
    if (invRes.status === 'fulfilled') setInventory(invRes.value);
    else failed.push('stock levels');
    if (batchRes.status === 'fulfilled') setBatches(batchRes.value);
    else failed.push('batches');

    // 3. Log the full errors for developers (browser console), and give the
    //    page one short sentence for people, e.g. "Couldn't load members, batches."
    for (const result of [prodRes, custRes, logRes, invRes, batchRes, costRes]) {
      if (result.status === 'rejected') console.error('Error loading Supabase data:', result.reason);
    }
    setLoadError(failed.length > 0 ? `Couldn't load ${failed.join(', ')}.` : null);

    if (showLoading) setLoading(false);
  };

  // Watch the user's id rather than the whole session object to avoid
  // reloading during token refreshes.
  // useEffect(fn, [deps]) runs fn AFTER the page has been drawn, and again
  // whenever something in the [deps] list changes. Here: load once when the
  // page opens with someone signed in, and again if a different person signs in.
  useEffect(() => {
    if (user) loadData();
  }, [user?.id]);

  // Every role can check out (customers only for themselves; the database
  // makes sure of that). Reload afterwards so stock and points are current.
  // `finally` means the reload happens whether the sale worked or failed, so
  // the screen always matches the database (a "failed" sale may still have
  // been saved, e.g. if the receipt didn't come back).
  // Input: the basket, member, points and payment from POS.tsx.
  // Output: the receipt. If the sale fails, the error is passed on to POS.tsx
  // (try/finally has no catch, so the error isn't swallowed here).
  const handleCheckout = async (payload: CheckoutPayload): Promise<CheckoutReceipt> => {
    try {
      return await api.processCheckout(payload);
    } finally {
      await loadData(false);
    }
  };

  // The POS wants stock that excludes expired batches, which is what the
  // inventory summary gives. If that summary isn't available (e.g. the
  // database hasn't been updated yet), fall back to the plain product list.
  // The database still double-checks stock when the sale is saved.
  //
  // The inventory summary doesn't include every product field, so the
  // description (and the picture, just in case) are copied over from the
  // full product list.
  //
  // This is worked out fresh every time the page redraws (it isn't state),
  // so it always matches the latest `inventory` and `products`.
  // A Map from product id to product, for quick lookups by id.
  const productById = new Map(products.map((product) => [product.id, product]));
  const posProducts: ProductInventorySummary[] = inventory.length > 0
    // Normal case: the stock summary, with description and picture added.
    ? inventory.map((row) => ({
        ...row,
        description: productById.get(row.id)?.description ?? null,
        brand: productById.get(row.id)?.brand ?? null,
        image_url: row.image_url ?? productById.get(row.id)?.image_url ?? null,
      }))
    // Fallback: plain products dressed up as summaries. Without batch
    // information we can't know about expiry, so all stock counts as
    // sellable and nothing is marked as near expiry.
    : products.map((product) => ({
        ...product,
        available_quantity: product.stock_quantity,
        expired_quantity: 0,
        near_expiry_count: 0,
        earliest_expiry_date: null,
        has_expired_batches: false,
        expires_soon: false,
      }));

  // Everything a page can use. setCustomers and setLogs are handed out so
  // AdminPage can put in freshly loaded members and points log when the
  // Loyalty or Users tab opens, without reloading everything else.
  return {
    products,
    inventory,
    batches,
    customers,
    setCustomers,
    logs,
    setLogs,
    loading,
    loadError,
    loadData,
    handleCheckout,
    posProducts,
  };
}
