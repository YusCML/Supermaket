import { supabase } from './supabaseClient';

export const api = {
  // Fetch Products
  async getProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('id', { ascending: true });
    if (error) throw error;
    return data;
  },

  // Fetch Customers
  async getCustomers() {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('id', { ascending: true });
    if (error) throw error;
    return data;
  },

  // Fetch Loyalty Audit Logs
  async getLoyaltyLogs() {
    const { data, error } = await supabase
      .from('loyalty_logs')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  // Add Product
  async addProduct(product) {
    const { data, error } = await supabase
      .from('products')
      .insert([product])
      .select();
    if (error) throw error;
    return data[0];
  },

  // Manual Stock Adjustment
  async updateStock(productId, currentStock, delta) {
    const newStock = Math.max(0, currentStock + delta);
    const { data, error } = await supabase
      .from('products')
      .update({ stock_quantity: newStock, updated_at: new Date().toISOString() })
      .eq('id', productId)
      .select();
    if (error) throw error;
    return data;
  },

  // Execute Atomic POS Checkout Procedure
  async processCheckout({ cart, customerId, pointsToRedeem, paymentMethod }) {
    const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const discountAmount = pointsToRedeem;
    const finalAmount = Math.max(0, totalAmount - discountAmount);

    const { data, error } = await supabase.rpc('process_pos_checkout', {
      p_customer_id: customerId || null,
      p_total_amount: totalAmount,
      p_discount_amount: discountAmount,
      p_final_amount: finalAmount,
      p_payment_method: paymentMethod,
      p_points_redeemed: pointsToRedeem,
      p_cart_items: cart
    });

    if (error) throw new Error(error.message);
    return { success: true, orderId: data };
  }
};