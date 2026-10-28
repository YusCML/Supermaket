import { supabase } from './supabase';
import type {
  AppRole,
  Product,
  ProductBatch,
  Customer,
  LoyaltyLog,
  CheckoutPayload,
  NewProductInput,
  ProductInventorySummary,
  ReceiveStockInput,
  SalesAnalytics,
  UpdateProductInput,
} from '../types/app';

// Every call the app makes to the database lives here.
//
// Who can do what is enforced by the database itself (row-level security, see
// supabase/migrations/20261026120100_row_level_security.sql), not by this file.
// Hiding a tab in the UI is just for convenience. Even if a cashier called
// addProduct() from the console, the database would refuse.
export const api = {
  // The full catalog. Everyone signed in can read it.
  async getProducts(): Promise<Product[]> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('id', { ascending: true });
    if (error) throw error;
    return (data ?? []) as Product[];
  },

  async getInventoryOverview(): Promise<ProductInventorySummary[]> {
    const { data, error } = await supabase.rpc('get_product_inventory');
    if (error) throw error;
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

  async getProductBatches(): Promise<ProductBatch[]> {
    const { data, error } = await supabase
      .from('product_batches')
      .select('*')
      .order('expiry_date', { ascending: true, nullsFirst: false });
    if (error) throw error;
    return (data ?? []) as ProductBatch[];
  },

  // Admin only. Adds a new stock batch. The database always makes up the
  // batch code (B-1, B-2, ...) and it's unique store-wide; we return it so
  // the screen can tell the admin which code was given.
  async receiveStock(input: ReceiveStockInput): Promise<string> {
    const { data, error } = await supabase.rpc('receive_stock', {
      p_product_id: input.product_id,
      p_quantity: input.quantity,
      p_expiry_date: input.expiry_date,
    });
    if (error) throw error;
    if (data && typeof data === 'object' && 'success' in data && data.success === false) {
      throw new Error('Stock could not be received.');
    }
    return (data as { batch_code?: string } | null)?.batch_code ?? '';
  },

  async processExpiredBatches(): Promise<void> {
    const { error } = await supabase.rpc('process_expired_batches');
    if (error) throw error;
  },

  async getSalesAnalytics(): Promise<SalesAnalytics> {
    const { data, error } = await supabase.rpc('get_admin_sales_analytics');
    if (error) throw error;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('The analytics service returned an invalid response.');
    }
    return data as SalesAnalytics;
  },

  // Loyalty members: EVERY account (customers, cashiers, admins and the store
  // owner alike) has a row in the `customer` table holding their loyalty ID
  // and points, and the name/phone live on `users`. We fetch both in one go and flatten them into a single object for
  // the POS lookup and the Loyalty tab. Only admins and cashiers can see other
  // people's rows.
  async getCustomers(): Promise<Customer[]> {
    const { data, error } = await supabase
      .from('customer')
      .select('user_id, loyalty_id, loyalty_points, users(email, name, phone, role, created_at)')
      .order('created_at', { ascending: true, referencedTable: 'users' });
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      id: row.user_id,
      email: row.users?.email ?? '',
      // People who signed up with email/password haven't given us a name, so
      // show their email instead of "N/A". That way you can tell them apart.
      name: row.users?.name || row.users?.email || null,
      phone: row.users?.phone ?? null,
      role: row.users?.role ?? 'customer',
      loyalty_id: row.loyalty_id,
      loyalty_points: row.loyalty_points ?? 0,
      created_at: row.users?.created_at ?? undefined,
    })) as Customer[];
  },

  // Admin only: who holds which staff role, as { userId: ['cashier', 'admin'] }.
  // A person is a cashier / admin when they have a row in that table.
  // Customer isn't listed because everyone is one.
  async getStaffRoles(): Promise<Record<string, AppRole[]>> {
    const [cashiers, admins] = await Promise.all([
      supabase.from('cashier').select('user_id'),
      supabase.from('admin').select('user_id'),
    ]);
    if (cashiers.error) throw cashiers.error;
    if (admins.error) throw admins.error;

    const staffRoles: Record<string, AppRole[]> = {};
    const add = (userId: string, role: AppRole) => {
      if (!staffRoles[userId]) staffRoles[userId] = [];
      staffRoles[userId].push(role);
    };
    for (const row of cashiers.data ?? []) add(row.user_id, 'cashier');
    for (const row of admins.data ?? []) add(row.user_id, 'admin');
    return staffRoles;
  },

  // Admin only: give someone exactly these roles, e.g. ['customer', 'cashier']
  // (the Users & Roles tab). The database checks the caller is an admin and
  // won't let admins remove their own admin role, so the store always keeps
  // at least one (see set_user_roles in the role_interfaces_and_self_checkout
  // migration). Customer is always kept, whatever is sent.
  async setUserRoles(userId: string, roles: AppRole[]): Promise<void> {
    const { error } = await supabase.rpc('set_user_roles', {
      p_user_id: userId,
      p_roles: roles,
    });
    if (error) {
      // PGRST202 = the database doesn't have this function yet, i.e. the
      // migration hasn't been run. Say that instead of a cryptic error.
      if (error.code === 'PGRST202') {
        throw new Error(
          'Role changes need a database update that hasn\'t been applied yet ' +
            '(migration 20261027120000_role_interfaces_and_self_checkout.sql).'
        );
      }
      throw error;
    }
  },

  // The points log, newest first. Admin only: for anyone else the database
  // simply returns no rows, which is fine since they never see the Loyalty tab.
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

  // Admin only. Every product needs a barcode (it's how the POS scans items),
  // and the database always generates it: a unique in-store EAN-13 (see the
  // batch_choice_and_generated_codes migration). So we never send one, and the
  // saved product that comes back tells us which barcode it got.
  async addProduct(product: NewProductInput): Promise<Product> {
    const payload = {
      ...product,
      sku: product.sku.trim(),
    };
    const { data, error } = await supabase
      .from('products')
      .insert([payload])
      .select();

    if (error) {
      // Turn the two errors people actually run into into something readable.
      // 23505 = a unique column already has this value (only the SKU can
      //         clash now, since barcodes are generated).
      // 42501 = the security rules blocked it, i.e. the user isn't an admin.
      if (error.code === '23505') {
        throw new Error('A product with that SKU already exists.');
      }
      if (error.code === '42501') {
        throw new Error('Only admins can add products.');
      }
      throw error;
    }
    return (data?.[0] ?? null) as Product;
  },

  // Admin only. Barcode and stock quantity deliberately aren't editable here:
  // barcodes are permanent and stock belongs to the batch receiving workflow.
  async updateProduct(productId: number, product: UpdateProductInput): Promise<Product> {
    const { data, error } = await supabase
      .from('products')
      .update({
        ...product,
        sku: product.sku.trim(),
        name: product.name.trim(),
        category: product.category.trim(),
      })
      .eq('id', productId)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error('A product with that SKU already exists.');
      }
      if (error.code === '42501') {
        throw new Error('Only admins can edit products.');
      }
      throw error;
    }

    return data as Product;
  },

  // Saves a sale. We only send WHAT is being bought, WHO the member is and how
  // many points to use. The database looks up the real prices, checks stock,
  // works out the totals and updates the member's points, all in one go (see
  // process_pos_checkout in the secure_checkout migration).
  //
  // If anything is wrong (out of stock, not enough points...), the database
  // cancels the whole sale and its error message comes back here, so the POS
  // can show it to the cashier.
  async processCheckout(payload: CheckoutPayload) {
    const { cart, customerId, pointsToRedeem, paymentMethod } = payload;

    const { data, error } = await supabase.rpc('process_pos_checkout', {
      // batch_id: the batch that was picked; null lets the database take
      // the soonest-expiring stock.
      p_cart_items: cart.map((item) => ({
        product_id: item.id,
        quantity: item.quantity,
        batch_id: item.batch_id,
      })),
      p_customer_id: customerId,
      p_points_redeemed: pointsToRedeem,
      p_payment_method: paymentMethod,
    });
    if (error) throw error;
    // { success, order_id, points_earned, points_redeemed, total_amount, final_amount }
    return data;
  },
};
