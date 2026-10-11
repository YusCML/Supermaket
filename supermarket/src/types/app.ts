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
  created_at?: string;
  updated_at?: string;
}

export interface Customer {
  id: number;
  name: string;
  phone: string;
  loyalty_id: string | null;
  points_balance: number;
  created_at?: string;
}

export interface LoyaltyLog {
  id: number;
  customer_id: number;
  order_id: number | null;
  points_changed: number;
  reason?: string | null;
  type: 'EARNED' | 'REDEEMED';
  created_at: string;
}

export interface CartItem extends Product {
  quantity: number;
}

export interface CheckoutPayload {
  cart: CartItem[];
  customerId: number | null;
  pointsToRedeem: number;
  paymentMethod: 'Cash' | 'Card' | 'Loyalty Points';
}

export interface NewProductInput {
  sku: string;
  barcode: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  stock_quantity: number;
  reorder_level: number;
}