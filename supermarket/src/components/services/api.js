import { supabase } from './supabaseClient';

export const api = {
  async getProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('id', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async getCustomers() {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('id', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async addProduct(product) {
    const payload = {
      ...product,
      barcode: product.barcode || product.sku
    };
    const { data, error } = await supabase
      .from('products')
      .insert([payload])
      .select();
    if (error) throw error;
    return data[0];
  },

  async processCheckout({ cart, customerId, pointsToRedeem, paymentMethod }) {
    const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const discountAmount = pointsToRedeem || 0;
    const finalAmount = Math.max(0, totalAmount - discountAmount);

    const { data, error } = await supabase.rpc('process_pos_checkout', {
      p_customer_id: customerId || null,
      p_total_amount: totalAmount,
      p_discount_amount: discountAmount,
      p_final_amount: finalAmount,
      p_payment_method: paymentMethod,
      p_points_redeemed: pointsToRedeem || 0,
      p_cart_items: cart
    });

    if (error) throw error;
    return data;
  }
};