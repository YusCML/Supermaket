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
  ProductInventorySummary,
  ReceiveStockInput,
  SalesAnalytics,
  UpdateProductInput,
  WriteOffStockInput,
} from '../types/app';

export const api = {
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

  async writeOffStock(input: WriteOffStockInput): Promise<void> {
    const { error } = await supabase.rpc('write_off_stock', {
      p_batch_id: input.batch_id,
      p_quantity: input.quantity,
      p_kind: input.kind,
      p_reason: input.reason,
    });
    if (error) {
      if (error.code === 'PGRST202') {
        throw new Error('Writing off stock needs a database update that has not been applied yet.');
      }
      throw error;
    }
  },

  async getSalesAnalytics(): Promise<SalesAnalytics> {
    const { data, error } = await supabase.rpc('get_admin_sales_analytics');
    if (error) throw error;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('The analytics service returned an invalid response.');
    }
    return data as SalesAnalytics;
  },

  async getCustomers(): Promise<Customer[]> {
    const { data, error } = await supabase
      .from('customer')
      .select('user_id, loyalty_id, loyalty_points, users(email, name, phone, role, created_at)')
      .order('created_at', { ascending: true, referencedTable: 'users' });
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      id: row.user_id,
      email: row.users?.email ?? '',
      name: row.users?.name || row.users?.email || null,
      phone: row.users?.phone ?? null,
      role: row.users?.role ?? 'customer',
      loyalty_id: row.loyalty_id,
      loyalty_points: row.loyalty_points ?? 0,
      created_at: row.users?.created_at ?? undefined,
    })) as Customer[];
  },

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

  async setUserRoles(userId: string, roles: AppRole[]): Promise<void> {
    const { error } = await supabase.rpc('set_user_roles', {
      p_user_id: userId,
      p_roles: roles,
    });
    if (error) {
      if (error.code === 'PGRST202') {
        throw new Error(
          'Role changes need a database update that hasn\'t been applied yet ' +
            '(migration 20261027120000_role_interfaces_and_self_checkout.sql).'
        );
      }
      throw error;
    }
  },

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

  async uploadProductImage(file: File): Promise<string> {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from('product-images')
      .getPublicUrl(fileName);

    return data.publicUrl;
  },

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
      if (error.code === '23505') throw new Error('A product with that SKU already exists.');
      if (error.code === '42501') throw new Error('Only admins can add products.');
      throw error;
    }
    return (data?.[0] ?? null) as Product;
  },

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
      if (error.code === '23505') throw new Error('A product with that SKU already exists.');
      if (error.code === '42501') throw new Error('Only admins can edit products.');
      throw error;
    }

    return data as Product;
  },

  async processCheckout(payload: CheckoutPayload): Promise<CheckoutReceipt> {
    const { cart, customerId, pointsToRedeem, paymentMethod } = payload;

    const { data, error } = await supabase.rpc('process_pos_checkout', {
      p_cart_items: cart.map((item) => ({
        product_id: item.id,
        quantity: item.quantity,
        batch_id: item.batch_id,
      })),
      p_customer_id: customerId,
      p_points_redeemed: pointsToRedeem,
      p_payment_method: paymentMethod,
      p_cash_received: payload.cashReceived,
    });
    if (error) throw error;
    if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.items)) {
      throw new Error('Checkout completed, but the database did not return receipt details.');
    }
    return data as CheckoutReceipt;
  },
};