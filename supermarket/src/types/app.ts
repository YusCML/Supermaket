export interface Product {
  id: number;
  sku: string;
  barcode: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  stock_quantity: number;
  reorder_level: number;
  image_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProductBatch {
  id: number;
  product_id: number;
  batch_code: string;
  quantity_received: number;
  quantity_remaining: number;
  expiry_date: string | null;
  status: 'active' | 'expired' | 'spoiled' | 'manual';
  received_at?: string;
  expired_at?: string | null;
  created_at?: string;
}

export interface ProductInventorySummary extends Product {
  available_quantity: number;
  expired_quantity: number;
  near_expiry_count: number;
  earliest_expiry_date: string | null;
  has_expired_batches: boolean;
  expires_soon: boolean;
}

export interface ReceiveStockInput {
  product_id: number;
  quantity: number;
  expiry_date: string;
}

export type StockWriteOffKind = 'damaged' | 'spoiled';

export interface WriteOffStockInput {
  batch_id: number;
  quantity: number;
  kind: StockWriteOffKind;
  reason: string;
}

export interface SalesTrendPoint {
  date: string;
  revenue: number;
}

export interface MonthlyRevenuePoint {
  month: string;
  revenue: number;
}

export interface PaymentMixPoint {
  name: string;
  value: number;
}

export interface TopProductPoint {
  name: string;
  revenue: number;
  quantity: number;
}

export interface SalesAnalytics {
  today_revenue: number;
  week_revenue: number;
  month_revenue: number;
  year_revenue: number;
  net_revenue: number;
  thirty_day_trend: SalesTrendPoint[];
  monthly_revenue: MonthlyRevenuePoint[];
  payment_mix: PaymentMixPoint[];
  top_products: TopProductPoint[];
  spoilage_losses: number;
}

export type AppRole = 'admin' | 'cashier' | 'customer';

export interface AppUser {
  id: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  role: AppRole;
  created_at?: string;
}

export interface LoyaltyMember {
  id: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  role: AppRole;
  loyalty_id: string | null;
  loyalty_points: number;
  created_at?: string;
}

export type Customer = LoyaltyMember;

export interface LoyaltyLog {
  id: number;
  customer_id: string;
  order_id: number | null;
  points_changed: number;
  reason?: string | null;
  type: 'EARNED' | 'REDEEMED';
  created_at: string;
}

export interface CartItem extends Product {
  quantity: number;
  batch_id: number | null;
  batch_code: string | null;
  batch_expiry: string | null;
}

export interface CheckoutPayload {
  cart: CartItem[];
  customerId: string | null;
  pointsToRedeem: number;
  paymentMethod: 'Cash' | 'Card' | 'Loyalty Points';
  cashReceived: number | null;
}

export interface CheckoutReceiptItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  original_unit_price: number;
  near_expiry_discount: number;
  near_expiry_percent_off: number;
  batch_code: string | null;
}

export interface CheckoutReceipt {
  success: true;
  order_id: number;
  created_at: string;
  member_name: string;
  member_email: string;
  member_loyalty_id: string | null;
  points_balance: number;
  points_earned: number;
  points_redeemed: number;
  subtotal: number;
  near_expiry_savings: number;
  total_amount: number;
  points_discount: number;
  total_paid: number;
  payment_method: CheckoutPayload['paymentMethod'];
  cash_received: number | null;
  change: number | null;
  items: CheckoutReceiptItem[];
}

export interface NewProductInput {
  sku: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  stock_quantity: number;
  reorder_level: number;
  image_url?: string | null;
}

export interface UpdateProductInput {
  sku: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  reorder_level: number;
  image_url?: string | null;
}