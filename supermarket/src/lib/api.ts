// api.ts: the ONE place in the app that reads from or writes to the database.
//
// Every screen gets its data through these functions instead of talking to
// Supabase itself. So if you want to know how something is loaded or saved,
// this is the file to read. Each function here is a thin wrapper: it sends one
// request, checks for an error, and hands back the data in the shape our
// TypeScript types describe (see src/types/app.ts).
//
// Who uses it:
//   - src/hooks/useStoreData.ts: loads products, stock, batches, members and
//     the points log, and runs checkout.
//   - src/pages/AdminPage.tsx: analytics, roles, adding/editing products,
//     receiving and writing off stock, removing expired stock.
//   - src/components/Inventory.tsx: uploading product pictures.
//   - src/components/POS.tsx: only imports SaleSavedWithoutReceiptError.
//
// Two kinds of database requests appear below:
//   - supabase.from('table').select/insert/update(...) reads or writes a
//     table directly. Row-level security (rules stored in the database that
//     decide, row by row, who may see or change what) still applies, so a
//     customer asking for "all members" only gets their own row back.
//   - supabase.rpc('function_name', {...}) runs a SQL function stored in the
//     database ("RPC" = remote procedure call: asking the server to run a
//     function for you). The big jobs (checkout, receiving stock, analytics)
//     are done this way so the database can check everything and do the
//     whole job in one go. The newest file in supabase/migrations that
//     mentions a function holds the version in use.
//
// About `async` / `Promise`: a database request takes time. An `async`
// function returns a Promise, which is an "IOU" for a value that arrives
// later. `await` pauses the function until the IOU is paid (or fails).
// Supabase never throws on a failed request; it hands back `{ data, error }`,
// so every function checks `error` and throws it itself. The caller can then
// use try/catch (or .catch) to show a message.
import { supabase } from './supabase';
import type {
  AppRole,
  Product,
  ProductBatch,
  Customer,
  LoyaltyLog,
  CheckoutPayload,
  CheckoutReceipt,
  NewProductInput,
  Order,
  ProductInventorySummary,
  ReceiveStockInput,
  SalesAnalytics,
  SalesBreakdown,
  ProfitLossSeries,
  UpdateProductInput,
  WriteOffStockInput,
} from '../types/app';

// Thrown when the sale WAS saved but the receipt details didn't come back.
// It has its own type so the POS can tell it apart from a failed sale: the
// basket must be cleared, or pressing Complete again would charge twice.
//
// When can it happen? process_pos_checkout answered WITHOUT an error (so the
// sale was committed) but the answer doesn't look like a receipt, e.g. the
// database still runs an older process_pos_checkout that only returns the
// order number. (If the current version can't build the receipt it raises an
// error instead, which cancels the whole sale.) Thrown by processCheckout()
// below and caught in POS.tsx with `instanceof`.
//
// `extends Error` makes it a normal error (it has .message and can be thrown);
// giving it its own class is what lets other code check which error it got.
export class SaleSavedWithoutReceiptError extends Error {
  constructor() {
    // super(...) runs Error's own setup with this message. Setting `name`
    // makes the console show "SaleSavedWithoutReceiptError" instead of "Error".
    super('The sale was saved, but the receipt could not be shown.');
    this.name = 'SaleSavedWithoutReceiptError';
  }
}

// The product columns everyone signed in may read. `cost` is deliberately NOT
// here: the database only lets admins see what products cost the store
// (20261101160000_order_history_and_private_costs.sql), so asking for it (or
// for '*', which includes it) would be refused. Admins get costs separately
// with getProductCosts().
// `brand` was added by migration 20261102130000; OLD_PRODUCT_COLUMNS is the
// same list without it, used only if the database doesn't have it yet (see
// getProducts), so the app keeps working before that update is applied.
const OLD_PRODUCT_COLUMNS =
  'id, sku, barcode, name, category, price, stock_quantity, reorder_level, image_url, description, created_at, updated_at';
const PRODUCT_COLUMNS = `${OLD_PRODUCT_COLUMNS}, brand`;

// Postgres error code 42703 = "undefined column": the database doesn't have a
// column we asked for (here: `brand`, before its migration is applied).
const MISSING_COLUMN = '42703';
// The message shown when saving a brand before that update.
const BRAND_NEEDS_UPDATE =
  'Brand needs the database update 20261102130000_product_brand.sql. Run npm run db:push, then try again.';

// The order columns the Orders and Analytics tabs read, with each order's
// lines joined in (`order_items(*)`: every column of order_items, so this also
// works on a database that doesn't have the frozen price/cost/name yet).
const ORDER_COLUMNS =
  'id, created_at, customer_id, total_amount, discount_amount, final_amount, payment_method, points_redeemed, order_items(*)';

// Turns one database row of `orders` (with its order_items) into our Order
// shape, making sure every money value is a real number (Postgres numerics
// can arrive as text). Lines are sorted in the order they were saved.
// (`any` because the shape comes from the database, not from TypeScript.)
function toOrder(row: any): Order {
  return {
    id: row.id,
    created_at: row.created_at,
    customer_id: row.customer_id,
    total_amount: Number(row.total_amount ?? 0),
    discount_amount: Number(row.discount_amount ?? 0),
    final_amount: Number(row.final_amount ?? 0),
    payment_method: row.payment_method,
    points_redeemed: Number(row.points_redeemed ?? 0),
    items: ((row.order_items ?? []) as any[])
      .map((item) => ({
        id: item.id,
        product_id: item.product_id,
        batch_id: item.batch_id ?? null,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        subtotal: Number(item.subtotal),
        list_price: item.list_price == null ? null : Number(item.list_price),
        unit_cost: item.unit_cost == null ? null : Number(item.unit_cost),
        product_name: item.product_name ?? null,
      }))
      .sort((a, b) => a.id - b.id),
  };
}

// All the database calls, gathered in one object so other files can write
// `api.getProducts()`, `api.processCheckout(...)` and so on.
export const api = {
  // Every product in the catalog (table: products), oldest first (by id).
  // Returns the raw rows, including `stock_quantity`, which counts ALL units
  // on the shelf, even ones that have expired but haven't been removed yet.
  // For "how many can actually be sold" use getInventoryOverview().
  // Row-level security lets anyone who is signed in read products, minus the
  // cost column (see PRODUCT_COLUMNS above).
  async getProducts(): Promise<Product[]> {
    const first = await supabase.from('products').select(PRODUCT_COLUMNS).order('id', { ascending: true });
    // `unknown[]` because the two column lists give rows of different shapes.
    let data: unknown[] | null = first.data;
    let error = first.error;
    // No `brand` column yet (database not updated): ask again without it.
    if (error?.code === MISSING_COLUMN) {
      const retry = await supabase.from('products').select(OLD_PRODUCT_COLUMNS).order('id', { ascending: true });
      data = retry.data;
      error = retry.error;
    }
    if (error) throw error;
    // `data` can be null when nothing came back; `?? []` turns that into an
    // empty list. `as Product[]` tells TypeScript what shape the rows have.
    // Supabase can't know it here, because the client isn't given the table
    // types (see the note in supabase.ts).
    return (data ?? []) as Product[];
  },

  // ADMINS ONLY: what each product cost the store, as { productId: cost }.
  // Uses the database function get_product_costs(), which refuses anyone who
  // isn't an admin. useStoreData merges these into the products for admins.
  //
  // Fallback: on a database where that migration hasn't been applied yet, the
  // function doesn't exist (error code PGRST202) but the cost column is still
  // readable, so read it directly instead.
  async getProductCosts(): Promise<Record<number, number>> {
    const toMap = (rows: { id: number; cost: number }[]) =>
      Object.fromEntries(rows.map((row) => [row.id, Number(row.cost)]));

    const { data, error } = await supabase.rpc('get_product_costs');
    if (!error) return toMap((data ?? []) as { id: number; cost: number }[]);
    if (error.code !== 'PGRST202') throw error;

    const fallback = await supabase.from('products').select('id, cost');
    if (fallback.error) throw fallback.error;
    return toMap((fallback.data ?? []) as { id: number; cost: number }[]);
  },

  // ADMINS ONLY: the most recent sales (table: orders), newest first, each
  // with its lines (table: order_items, joined in with `order_items(*)`).
  // Row-level security only lets admins read these tables, so for anyone
  // else this simply returns nothing.
  //
  // Each line keeps the price, cost and name it had AT THE TIME OF SALE
  // (list_price, unit_cost, product_name), so editing a product later never
  // changes old orders. `order_items(*)` asks for every column that exists,
  // so this also works on a database without those columns yet.
  // `limit` keeps the list quick to load; the newest orders come first.
  async getOrders(limit = 500): Promise<Order[]> {
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_COLUMNS)
      .order('id', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return ((data ?? []) as any[]).map(toOrder);
  },

  // ADMINS ONLY: every sale made on Philippine days `from` to `to`
  // ('YYYY-MM-DD', both included), newest first, with their lines. Used by
  // the Analytics tab's order list for the day, month or year on show.
  // The Philippines is UTC+8 all year (no daylight saving), so midnight in
  // Manila is written with "+08:00" and the database compares the exact
  // moments. `to` is turned into "before midnight at the start of the next
  // day". `limit` caps a very busy year; the newest orders come first.
  async getOrdersBetween(from: string, to: string, limit = 1000): Promise<Order[]> {
    const nextDay = new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_COLUMNS)
      .gte('created_at', `${from}T00:00:00+08:00`)
      .lt('created_at', `${nextDay}T00:00:00+08:00`)
      .order('id', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return ((data ?? []) as any[]).map(toOrder);
  },

  // Stock levels worked out by the database function get_product_inventory()
  // (latest version: 20261101150000_fix_inventory_access_and_counts.sql).
  // One row per product: the product's columns plus
  //   available_quantity   units that can still be sold (active, not expired)
  //   expired_quantity     units past their date, not yet removed
  //   near_expiry_count    units expiring within 7 days (sold at 15% off)
  //   earliest_expiry_date soonest expiry among sellable batches
  //   has_expired_batches / expires_soon   yes/no flags for the warnings
  // "Today" is the Philippine date. Only signed-in users may run it.
  async getInventoryOverview(): Promise<ProductInventorySummary[]> {
    const { data, error } = await supabase.rpc('get_product_inventory');
    if (error) throw error;
    // Tidy every row before the screens see it:
    //  - Number(... ?? 0) makes each count a real number, and a missing
    //    value (null/undefined) becomes 0, so the screens can do maths safely.
    //  - `stock_quantity` is REPLACED with the sellable amount, so every
    //    screen that reads stock_quantity from this list sees only stock that
    //    can really be sold. (`??` falls back to the next value when the left
    //    one is null/undefined, e.g. an older database without the column.)
    //  - Boolean(...) turns null into false for the yes/no flags.
    return ((data ?? []) as ProductInventorySummary[]).map((row) => ({
      ...row,
      available_quantity: Number(row.available_quantity ?? row.stock_quantity ?? 0),
      stock_quantity: Number(row.available_quantity ?? row.stock_quantity ?? 0),
      expired_quantity: Number(row.expired_quantity ?? 0),
      near_expiry_count: Number(row.near_expiry_count ?? 0),
      earliest_expiry_date: row.earliest_expiry_date ?? null,
      has_expired_batches: Boolean(row.has_expired_batches),
      expires_soon: Boolean(row.expires_soon),
    }));
  },

  // Every stock batch (table: product_batches), i.e. every delivery with its
  // batch code, units left and expiry date. Includes used-up, expired and
  // written-off batches; the screens filter them (see sellableBatches() in
  // lib/expiry.ts). Sorted soonest expiry first; batches with no expiry date
  // go last (`nullsFirst: false`). Anyone signed in may read batches, so
  // customers can pick a batch at self-serve.
  async getProductBatches(): Promise<ProductBatch[]> {
    const { data, error } = await supabase
      .from('product_batches')
      .select('*')
      .order('expiry_date', { ascending: true, nullsFirst: false });
    if (error) throw error;
    return (data ?? []) as ProductBatch[];
  },

  // Admin only: record a new delivery of a product.
  // Database function receive_stock() (latest: 20261101150000_fix_inventory_access_and_counts.sql)
  // checks the caller is an admin and the expiry date is AFTER today
  // (Philippine time), makes a new batch with a generated code ("B-12"),
  // and adds the quantity to products.stock_quantity, all in one go.
  // Returns the new batch code so the screen can show it, or '' if none came back.
  // The `p_` names must match the SQL function's parameter names exactly.
  async receiveStock(input: ReceiveStockInput): Promise<string> {
    const { data, error } = await supabase.rpc('receive_stock', {
      p_product_id: input.product_id,
      p_quantity: input.quantity,
      p_expiry_date: input.expiry_date,
    });
    if (error) throw error;
    // The function answers { success: true, batch_code: 'B-12' } and raises an
    // error for every problem, so success:false shouldn't happen. This check
    // is a safety net in case it ever does.
    if (data && typeof data === 'object' && 'success' in data && data.success === false) {
      throw new Error('Stock could not be received.');
    }
    // `?.` stops with undefined instead of crashing if data is null.
    return (data as { batch_code?: string } | null)?.batch_code ?? '';
  },

  // Admin only: take expired stock off the shelves right now.
  // Database function process_expired_batches() checks the caller is an
  // admin, then sets every active batch whose expiry date is today or earlier
  // to 'expired' with 0 left, logs each one in spoilage_logs (valued at cost,
  // so Analytics can show the loss), and fixes products.stock_quantity.
  // The same job also runs by itself every night (a pg_cron schedule set up in
  // 20261026120400_product_batches_and_expiry.sql). AdminPage calls this when
  // the Inventory tab opens and from its "process expired" button.
  // The function returns how many batches it processed; we don't use that.
  async processExpiredBatches(): Promise<void> {
    const { error } = await supabase.rpc('process_expired_batches');
    if (error) throw error;
  },

  // Admin only: remove damaged or spoiled units from one batch.
  // Database function write_off_stock() (20261028100000_write_off_stock.sql)
  // checks the caller is an admin, the batch is active and has enough units,
  // then lowers the batch and the product's stock, and writes the loss (at
  // cost) to spoilage_logs with its kind and reason. A batch that reaches 0
  // gets the status 'spoiled'.
  async writeOffStock(input: WriteOffStockInput): Promise<void> {
    const { error } = await supabase.rpc('write_off_stock', {
      p_batch_id: input.batch_id,
      p_quantity: input.quantity,
      p_kind: input.kind,
      p_reason: input.reason,
    });
    if (error) {
      // PGRST202 is the error code Supabase's API layer (PostgREST) uses for
      // "no database function with that name and those parameters", which
      // means the migration that creates it hasn't been applied yet.
      if (error.code === 'PGRST202') {
        throw new Error('Writing off stock needs a database update that has not been applied yet.');
      }
      throw error;
    }
  },

  // Admin only: every number on the Analytics tab, in one request.
  // Database function get_admin_sales_analytics() (latest:
  // 20261101120000_profit_and_loss_analytics.sql) checks the caller is an
  // admin and returns one JSON object: sales today / this week / month / year,
  // the 30-day trend, payment mix, top products, losses, and the profit &
  // loss breakdowns. Periods follow the Philippine calendar.
  async getSalesAnalytics(): Promise<SalesAnalytics> {
    const { data, error } = await supabase.rpc('get_admin_sales_analytics');
    if (error) throw error;
    // We expect a single object ({...}), not nothing, a list or a plain
    // value. Anything else means something is wrong on the database side.
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('The analytics service returned an invalid response.');
    }
    return data as SalesAnalytics;
  },

  // Save (or remove, with '') a member's phone number, so the POS can look
  // them up by phone. Database function set_member_phone() (migration
  // 20261102140000): staff may set anyone's, others only their own; it
  // checks the number is a PH mobile number, stores it as 09XXXXXXXXX and
  // refuses one another member already uses. Returns the phone as saved.
  async setMemberPhone(userId: string, phone: string): Promise<string | null> {
    const { data, error } = await supabase.rpc('set_member_phone', { p_user_id: userId, p_phone: phone });
    if (error) {
      if (error.code === 'PGRST202') {
        throw new Error('Phone numbers need the database update 20261102140000_member_phone.sql. Run npm run db:push.');
      }
      throw error;
    }
    return (data as string | null) ?? null;
  },

  // ADMINS ONLY: profit & loss for one range of Philippine days, `from` to
  // `to` ('YYYY-MM-DD', both included), cut into hours, days or months.
  // Runs get_profit_loss_series() (migration 20261102120000). Returns null
  // when that function isn't in the database yet (PGRST202), so the Analytics
  // tab can say a database update is needed instead of showing an error.
  async getProfitLossSeries(from: string, to: string, step: ProfitLossSeries['step']): Promise<ProfitLossSeries | null> {
    const { data, error } = await supabase.rpc('get_profit_loss_series', { p_from: from, p_to: to, p_step: step });
    if (error) {
      if (error.code === 'PGRST202') return null;
      throw error;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray((data as ProfitLossSeries).periods)) {
      throw new Error('The analytics service returned an invalid response.');
    }
    return data as ProfitLossSeries;
  },

  // ADMINS ONLY: the payment mix and top products for one range of
  // Philippine days, `from` to `to` ('YYYY-MM-DD', both included). Runs the
  // database function get_sales_breakdown() (migration 20261102120000).
  // Returns null when that function isn't in the database yet (error code
  // PGRST202 = "function not found"), so the Analytics tab can fall back to
  // the this-year cards instead of showing an error.
  async getSalesBreakdown(from: string, to: string): Promise<SalesBreakdown | null> {
    const { data, error } = await supabase.rpc('get_sales_breakdown', { p_from: from, p_to: to });
    if (error) {
      if (error.code === 'PGRST202') return null;
      throw error;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('The analytics service returned an invalid response.');
    }
    // Numbers can arrive as text from the database; Number(...) makes sure.
    const raw = data as SalesBreakdown;
    return {
      from: raw.from,
      to: raw.to,
      payment_mix: (raw.payment_mix ?? []).map((p) => ({ name: p.name, value: Number(p.value), orders: Number(p.orders) })),
      top_products: (raw.top_products ?? []).map((p) => ({
        name: p.name,
        revenue: Number(p.revenue),
        quantity: Number(p.quantity),
      })),
    };
  },

  // Loyalty members: everyone with a row in the `customer` table (which is
  // everyone, admins included), joined with their `users` row for the name,
  // email and phone.
  // `users(...)` inside select() is a join: Supabase follows the link from
  // customer.user_id to users.id and nests that user's columns under `users`.
  // Row-level security decides who comes back: staff (cashier/admin) see
  // every member; a customer sees only their own row.
  async getCustomers(): Promise<Customer[]> {
    const { data, error } = await supabase
      .from('customer')
      .select('user_id, loyalty_id, loyalty_points, users(email, name, phone, role, created_at)');
    if (error) throw error;
    // The sign-up date lives in the joined `users` part, which the database
    // can't sort the main list by in this kind of query, so the list is sorted
    // here instead (see the .sort() at the end): oldest member first.
    // Flatten each row into our Customer shape (src/types/app.ts):
    //   - id is the person's user id (the same id Supabase Auth uses);
    //   - name falls back to the email, so every member has something to show
    //     (`||` also skips an empty name "", unlike `??`);
    //   - users.role is their highest role, e.g. 'admin'.
    // `row: any` switches type checking off for the raw row, because Supabase
    // doesn't know the shape of the joined data here.
    return (data ?? []).map((row: any) => ({
      id: row.user_id,
      email: row.users?.email ?? '',
      name: row.users?.name || row.users?.email || null,
      phone: row.users?.phone ?? null,
      role: row.users?.role ?? 'customer',
      loyalty_id: row.loyalty_id,
      loyalty_points: row.loyalty_points ?? 0,
      created_at: row.users?.created_at ?? undefined,
    }))
      // Oldest sign-up first. Dates in this ISO text form ("2026-10-27T…")
      // sort correctly as plain text; members without a date go last.
      .sort((a: Customer, b: Customer) =>
        (a.created_at ?? '￿').localeCompare(b.created_at ?? '￿')
      ) as Customer[];
  },

  // Who is staff, for the Users & Roles tab (admin page).
  // Having a row in the `cashier` table means "is a cashier"; a row in the
  // `admin` table means "is an admin". Returns a lookup from user id to that
  // person's staff roles, e.g. { 'a1b2…': ['cashier', 'admin'] }. People who
  // are only customers are simply not in it.
  // Row-level security lets admins read every row in both tables.
  async getStaffRoles(): Promise<Record<string, AppRole[]>> {
    // Promise.all sends both requests at the same time and waits for both.
    const [cashiers, admins] = await Promise.all([
      supabase.from('cashier').select('user_id'),
      supabase.from('admin').select('user_id'),
    ]);
    if (cashiers.error) throw cashiers.error;
    if (admins.error) throw admins.error;

    // Record<string, AppRole[]> = an object whose keys are strings (user ids)
    // and whose values are lists of roles.
    const staffRoles: Record<string, AppRole[]> = {};
    // Adds one role to one person, starting their list if it's their first.
    const add = (userId: string, role: AppRole) => {
      if (!staffRoles[userId]) staffRoles[userId] = [];
      staffRoles[userId].push(role);
    };
    for (const row of cashiers.data ?? []) add(row.user_id, 'cashier');
    for (const row of admins.data ?? []) add(row.user_id, 'admin');
    return staffRoles;
  },

  // Admin only: give someone exactly this list of roles, e.g.
  // ['customer', 'cashier']. Roles left out are taken away.
  // Database function set_user_roles() (20261027120000_role_interfaces_and_self_checkout.sql)
  // checks the caller is an admin, adds/removes the person's rows in the
  // `admin` and `cashier` tables, makes sure they keep their customer row,
  // and stores their highest role in users.role. It refuses to let an admin
  // remove their OWN admin role, so the store can never end up with no admin.
  // The browser can't write those tables directly; this function is the only way.
  async setUserRoles(userId: string, roles: AppRole[]): Promise<void> {
    const { error } = await supabase.rpc('set_user_roles', {
      p_user_id: userId,
      p_roles: roles,
    });
    if (error) {
      // PGRST202 = that database function doesn't exist yet (see writeOffStock).
      if (error.code === 'PGRST202') {
        throw new Error(
          'Role changes need a database update that hasn\'t been applied yet ' +
            '(migration 20261027120000_role_interfaces_and_self_checkout.sql).'
        );
      }
      throw error;
    }
  },

  // The loyalty points audit trail (table: loyalty_logs), newest first. Each
  // row is one EARNED or REDEEMED entry written by the checkout function.
  // Row-level security only lets admins read it.
  // Unlike the other functions, a failure here does NOT throw: it logs a
  // warning and returns an empty list, so the rest of the page still works.
  async getLoyaltyLogs(): Promise<LoyaltyLog[]> {
    const { data, error } = await supabase
      .from('loyalty_logs')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('Could not fetch loyalty logs:', error.message);
      return [];
    }
    return (data ?? []) as LoyaltyLog[];
  },

  // Uploads a product picture to Supabase Storage (file storage that lives
  // next to the database), into the 'product-images' bucket (a "bucket" is a
  // folder of files). Returns the picture's web address, which Inventory.tsx
  // then saves on the product as image_url.
  // The bucket and its access rules were set up in the Supabase dashboard;
  // they are not in supabase/migrations.
  async uploadProductImage(file: File): Promise<string> {
    // Name the file from its real type, not from whatever the original file
    // was called (a file named "photo" with no extension used to end up as
    // "...-1730000000.photo"). randomUUID gives every upload a unique name.
    const EXTENSIONS: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };
    // file.type is the file's kind as the browser reports it, e.g. 'image/png'.
    // Any other kind gets the neutral ending 'img' (the Inventory form only
    // accepts the four kinds above anyway; see imageFileSchema in validation.ts).
    const fileExt = EXTENSIONS[file.type] ?? 'img';
    const fileName = `${crypto.randomUUID()}.${fileExt}`;

    // 1. Send the file. `error: uploadError` renames the `error` field so it
    //    doesn't clash with anything else called `error`.
    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    // 2. Build the file's web address. getPublicUrl() doesn't contact the
    //    server, it only puts the link together, so it has no error to check.
    //    The link only opens for people if the bucket is set to "public".
    const { data } = supabase.storage
      .from('product-images')
      .getPublicUrl(fileName);

    return data.publicUrl;
  },

  // Admin only: add a new product (table: products) and return the saved row.
  // What the database adds by itself (triggers = code the database runs
  // automatically when a row is inserted or changed):
  //   - an id and a generated in-store barcode (the app never sends one);
  //   - if the starting stock is above 0, a first batch "INITIAL-<id>" with
  //     no expiry date, so that stock can be tracked like any other batch.
  // Row-level security only lets admins insert products.
  async addProduct(product: NewProductInput): Promise<Product> {
    // `...product` copies every field; then sku is replaced by a trimmed copy.
    const payload = {
      ...product,
      sku: product.sku.trim(),
      brand: product.brand.trim(),
    };
    // insert() takes a list of rows (here just one). `.select(...)` asks for
    // the saved rows back, so we get the new id and barcode. It lists the
    // columns instead of everything, because `cost` can't be read back.
    const { data, error } = await supabase
      .from('products')
      .insert([payload])
      .select(PRODUCT_COLUMNS);

    if (error) {
      // Turn Postgres error codes into messages a person can act on:
      //   23505 = "unique violation": the SKU is already used by another product.
      //   42501 = "insufficient privilege": row-level security said no.
      //   42703 = "undefined column": no `brand` column yet (database not updated).
      //   PGRST204 = the same, as Supabase's API reports it for an insert.
      if (error.code === '23505') throw new Error('A product with that SKU already exists.');
      if (error.code === '42501') throw new Error('Only admins can add products.');
      if (error.code === MISSING_COLUMN || error.code === 'PGRST204') throw new Error(BRAND_NEEDS_UPDATE);
      throw error;
    }
    // No row back would mean the save didn't happen; say so instead of
    // pretending it worked.
    if (!data?.[0]) throw new Error('The product could not be saved. Please try again.');
    return data[0] as Product;
  },

  // Admin only: save changes to an existing product (table: products) and
  // return the updated row. Stock isn't changed here; that's done by
  // receiving or writing off batches. Text fields are trimmed before saving.
  // (A database trigger also stops the barcode from ever being changed, so
  // printed labels keep scanning.)
  async updateProduct(productId: number, product: UpdateProductInput): Promise<Product> {
    // .eq('id', productId) = "only the row whose id is productId".
    // .single() = "I expect exactly one row back", so we get an object
    // instead of a list (and an error if no row matched).
    const { data, error } = await supabase
      .from('products')
      .update({
        ...product,
        sku: product.sku.trim(),
        name: product.name.trim(),
        brand: product.brand.trim(),
        category: product.category.trim(),
      })
      .eq('id', productId)
      // Ask for the saved row back without `cost` (only admins may read it).
      .select(PRODUCT_COLUMNS)
      .single();

    if (error) {
      // Same error codes as in addProduct above.
      if (error.code === '23505') throw new Error('A product with that SKU already exists.');
      if (error.code === '42501') throw new Error('Only admins can edit products.');
      if (error.code === MISSING_COLUMN || error.code === 'PGRST204') throw new Error(BRAND_NEEDS_UPDATE);
      throw error;
    }

    return data as Product;
  },

  // Saves a sale. Used by every role: cashier and admin for any member, a
  // customer at self-serve only for themselves.
  //
  // Database function process_pos_checkout() (wrapper in
  // 20261028110000_checkout_receipt_data.sql; the real work is in
  // process_pos_checkout_base(), latest in 20261101140000_points_worth_five_pesos.sql).
  // In ONE transaction (all or nothing: if any step fails, none of it is saved):
  //   1. checks the member, the cart, the payment method and the points;
  //   2. creates the order and its lines, using the DATABASE's prices, the
  //      15% near-expiry markdown and the chosen batches (soonest expiry first
  //      when no batch was chosen);
  //   3. takes the stock off the products and batches;
  //   4. applies the points discount (₱5 per point), adds points earned
  //      (1 per full ₱100 paid) and writes both to loyalty_logs;
  //   5. checks the cash covers the bill, and builds the receipt.
  // Only ids and quantities are sent, never prices, so a tampered browser
  // can't change what things cost.
  // Returns the receipt (CheckoutReceipt in src/types/app.ts).
  async processCheckout(payload: CheckoutPayload): Promise<CheckoutReceipt> {
    // Destructuring: pull these four fields out of `payload` into variables.
    const { cart, customerId, pointsToRedeem, paymentMethod } = payload;

    const { data, error } = await supabase.rpc('process_pos_checkout', {
      // One entry per basket line. batch_id is null when no batch was chosen,
      // and the database then uses the soonest-expiring stock.
      p_cart_items: cart.map((item) => ({
        product_id: item.id,
        quantity: item.quantity,
        batch_id: item.batch_id,
      })),
      p_customer_id: customerId,
      p_points_redeemed: pointsToRedeem,
      p_payment_method: paymentMethod,
      // Only used for Cash (to check it covers the bill and work out change).
      p_cash_received: payload.cashReceived,
    });
    // An error here normally means the database refused the sale (e.g. not
    // enough stock), and because it's all-or-nothing, nothing was saved.
    // (If the connection dropped after the database said yes, the sale may
    // still exist; that's why useStoreData reloads everything afterwards.)
    if (error) throw error;
    // No error = the sale is saved. If the answer still isn't a proper
    // receipt (an object with an `items` list), say so with the special error,
    // so the POS clears the basket instead of letting it be charged again.
    if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.items)) {
      throw new SaleSavedWithoutReceiptError();
    }
    return data as CheckoutReceipt;
  },
};