import { supabase } from './supabase';
import type {
  Product,
  Customer,
  LoyaltyLog,
  CheckoutPayload,
  NewProductInput,
} from '../types/app';

const POINT_REDEMPTION_VALUE_IN_PESOS = 1;
const PESOS_PER_EARNED_POINT = 100;

export const api = {
  async getProducts(): Promise<Product[]> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('id', { ascending: true });
    if (error) throw error;
    return (data ?? []) as Product[];
  },

  async getCustomers(): Promise<Customer[]> {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('id', { ascending: true });
    if (error) throw error;
    return (data ?? []) as Customer[];
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

  async addProduct(product: NewProductInput): Promise<Product> {
    const payload = { ...product, barcode: product.barcode || product.sku };
    const { data, error } = await supabase
      .from('products')
      .insert([payload])
      .select();
    if (error) throw error;
    return (data?.[0] ?? null) as Product;
  },

  async processCheckout(payload: CheckoutPayload) {
    const { cart, customerId, pointsToRedeem, paymentMethod } = payload;
    const totalAmount = cart.reduce(
      (sum, item) => sum + (item.price || 0) * item.quantity,
      0
    );
    const points = Number(pointsToRedeem) || 0;
    const discountAmount = points * POINT_REDEMPTION_VALUE_IN_PESOS;
    const finalAmount = Math.max(0, totalAmount - discountAmount);

    const { data, error } = await supabase.rpc('process_pos_checkout', {
      p_customer_id: customerId ? Number(customerId) : null,
      p_total_amount: Number(totalAmount.toFixed(2)),
      p_discount_amount: Number(discountAmount.toFixed(2)),
      p_final_amount: Number(finalAmount.toFixed(2)),
      p_payment_method: String(paymentMethod),
      p_points_redeemed: points,
      p_cart_items: cart,
    });
    if (error) throw error;
    return data;
  },
};