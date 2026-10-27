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
} from '../types/app';

// Loads the store data a page needs and keeps it in one place, so the
// customer, cashier and admin pages don't each repeat the same fetching code.
//
// `role` is the interface being used, and decides what gets fetched:
//   customer -> products, and their own loyalty profile
//   cashier  -> + stock levels, batches, and every member (for the lookup)
//   admin    -> + the loyalty points log
// Fetching more wouldn't leak anything (the database only returns what the
// person may see), it would just be wasted requests.
export function useStoreData(role: AppRole) {
  const { user } = useAuth();
  const isStaff = role === 'cashier' || role === 'admin';
  const isAdmin = role === 'admin';

  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<ProductInventorySummary[]>([]);
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [logs, setLogs] = useState<LoyaltyLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Pull fresh products, members, batches, and inventory summaries after sales
  // and stock changes so the POS and Inventory screens stay current.
  const loadData = async () => {
    try {
      setLoading(true);
      const [prodData, custData, logData, inventoryData, batchData] = await Promise.all([
        api.getProducts(),
        api.getCustomers(),
        isAdmin ? api.getLoyaltyLogs() : Promise.resolve([] as LoyaltyLog[]),
        isStaff ? api.getInventoryOverview() : Promise.resolve([] as ProductInventorySummary[]),
        isStaff ? api.getProductBatches() : Promise.resolve([] as ProductBatch[]),
      ]);
      setProducts(prodData);
      setInventory(inventoryData);
      setBatches(batchData);
      setCustomers(custData);
      setLogs(logData);
    } catch (err) {
      console.error('Error loading Supabase data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Watch the user's id rather than the whole session object to avoid
  // reloading during token refreshes.
  useEffect(() => {
    if (user) loadData();
  }, [user?.id]);

  // Every role can check out (customers only for themselves; the database
  // makes sure of that). Reload afterwards so stock and points are current.
  const handleCheckout = async (payload: CheckoutPayload) => {
    await api.processCheckout(payload);
    await loadData();
  };

  // The POS wants stock that excludes expired batches, which is what the
  // inventory summary gives. Customers don't get that summary, so for them we
  // fall back to the plain product list. The database still double-checks
  // stock when the sale is saved.
  const posProducts: ProductInventorySummary[] = inventory.length > 0
    ? inventory
    : products.map((product) => ({
        ...product,
        available_quantity: product.stock_quantity,
        expired_quantity: 0,
        near_expiry_count: 0,
        earliest_expiry_date: null,
        has_expired_batches: false,
        expires_soon: false,
      }));

  return {
    products,
    inventory,
    batches,
    customers,
    setCustomers,
    logs,
    setLogs,
    loading,
    loadData,
    handleCheckout,
    posProducts,
  };
}
