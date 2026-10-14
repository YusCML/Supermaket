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
}

export interface CheckoutPayload {
  cart: CartItem[];
  customerId: string | null;
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

// merged above 