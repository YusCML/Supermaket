import { lazy, Suspense, useState, useEffect } from 'react';
import POS from '../components/POS';
import Inventory from '../components/Inventory';
import Loyalty from '../components/Loyalty';
import UserRoles from '../components/UserRoles';
import Navbar, { type NavTab } from '../components/Navbar';
import AppHeader from '../components/AppHeader';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotify } from '../contexts/NotifyContext';
import { useStoreData } from '../hooks/useStoreData';
import type {
  AppRole,
  NewProductInput,
  ReceiveStockInput,
  SalesAnalytics,
  UpdateProductInput,
  WriteOffStockInput,
} from '../types/app';
import '../App.css';

const Analytics = lazy(() => import('../components/Analytics'));

type AdminTab = 'pos' | 'inventory' | 'loyalty' | 'analytics' | 'users';

const ADMIN_TABS: NavTab<AdminTab>[] = [
  { id: 'pos', label: '🛒 POS Checkout' },
  { id: 'inventory', label: '📦 Inventory Management' },
  { id: 'loyalty', label: '⭐ Loyalty & Rewards' },
  { id: 'analytics', label: '📊 Analytics' },
  { id: 'users', label: '👥 Users & Roles' },
];

// The admin interface (/admin). Only admins can open this page (see
// ProtectedRoute in App.tsx), so nothing in here has to check the role again.
// The database still checks every admin action on its own.
export default function AdminPage() {
  const { user, refreshRoles } = useAuth();
  const { notify } = useNotify();
  const {
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
  } = useStoreData('admin');

  const [activeTab, setActiveTab] = useState<AdminTab>('pos');
  const [analytics, setAnalytics] = useState<SalesAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [analyticsRefreshKey, setAnalyticsRefreshKey] = useState(0);
  // Who holds which staff role, for the Users & Roles tab.
  const [staffRoles, setStaffRoles] = useState<Record<string, AppRole[]>>({});

  // Load the role assignments whenever Users & Roles is opened.
  useEffect(() => {
    if (activeTab !== 'users') return;

    let cancelled = false;
    api.getStaffRoles()
      .then((roles) => {
        if (!cancelled) setStaffRoles(roles);
      })
      .catch((err) => console.error('Error loading roles:', err));

    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  // Refresh member records when Loyalty & Rewards or Users & Roles is opened,
  // so new sign-ups and fresh points show up without reloading the page.
  useEffect(() => {
    if (activeTab !== 'loyalty' && activeTab !== 'users') return;

    let cancelled = false;
    Promise.all([api.getCustomers(), api.getLoyaltyLogs()])
      .then(([custData, logData]) => {
        if (cancelled) return;
        setCustomers(custData);
        setLogs(logData);
      })
      .catch((err) => console.error('Error refreshing loyalty data:', err));

    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'analytics') return;

    let cancelled = false;
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    api.getSalesAnalytics()
      .then((data) => {
        if (!cancelled) setAnalytics(data);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Could not load sales analytics:', err);
          setAnalyticsError(err instanceof Error ? err.message : 'Could not load sales analytics.');
        }
      })
      .finally(() => {
        if (!cancelled) setAnalyticsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, analyticsRefreshKey]);

  useEffect(() => {
    if (activeTab !== 'inventory') return;

    let cancelled = false;
    api.processExpiredBatches()
      .then(() => {
        if (!cancelled) return loadData();
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Could not process expired inventory on page load:', err);
          notify(err instanceof Error ? err.message : 'Could not process expired inventory', 'error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  // Both hand back what the database generated (the new product, with its
  // barcode / the new batch code) so the Inventory screen can show it.
  const handleAddProduct = async (product: NewProductInput) => {
    const saved = await api.addProduct(product);
    await loadData();
    return saved;
  };

  const handleReceiveStock = async (input: ReceiveStockInput) => {
    const batchCode = await api.receiveStock(input);
    await loadData();
    return batchCode;
  };

  const handleUpdateProduct = async (productId: number, product: UpdateProductInput) => {
    await api.updateProduct(productId, product);
    await loadData();
  };

  const handleWriteOffStock = async (input: WriteOffStockInput) => {
    await api.writeOffStock(input);
    await loadData();
  };

  const handleProcessExpired = async () => {
    await api.processExpiredBatches();
    await loadData();
  };

  // Save the new roles, then re-read them so the table shows what the
  // database actually stored. If you just changed your own roles, update
  // your "Switch role" options too.
  const handleSaveRoles = async (userId: string, roles: AppRole[]) => {
    await api.setUserRoles(userId, roles);
    setStaffRoles(await api.getStaffRoles());
    if (userId === user?.id) refreshRoles();
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#F5F5F5] font-sans antialiased text-[#333333] selection:bg-[#2E7D32]/15 selection:text-[#2E7D32]">
      <AppHeader role="admin" />

      <Navbar tabs={ADMIN_TABS} activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="flex-1 p-6">
        {loading ? (
          <div className="flex items-center justify-center rounded-2xl border border-gray-200/80 bg-[#FFFFFF] p-12 text-center text-xs font-semibold text-[#333333]/60 shadow-xs">
            Loading store data…
          </div>
        ) : (
          <>
            {activeTab === 'pos' && (
              <POS
                mode="staff"
                products={posProducts}
                customers={customers}
                batches={batches}
                onCheckout={handleCheckout}
              />
            )}
            {activeTab === 'inventory' && (
              <Inventory
                products={products}
                inventory={inventory}
                batches={batches}
                onAddProduct={handleAddProduct}
                onUpdateProduct={handleUpdateProduct}
                onReceiveStock={handleReceiveStock}
                onWriteOffStock={handleWriteOffStock}
                onProcessExpired={handleProcessExpired}
                onRefresh={loadData}
              />
            )}
            {activeTab === 'loyalty' && (
              <Loyalty
                customers={customers}
                logs={logs}
                onRefresh={loadData}
              />
            )}
            {activeTab === 'analytics' && (
              <Suspense
                fallback={
                  <div className="flex items-center justify-center rounded-2xl border border-gray-200/80 bg-[#FFFFFF] p-12 text-center text-xs font-semibold text-[#333333]/60 shadow-xs">
                    Loading analytics…
                  </div>
                }
              >
                <Analytics
                  analytics={analytics}
                  loading={analyticsLoading}
                  error={analyticsError}
                  onRetry={() => setAnalyticsRefreshKey((key) => key + 1)}
                />
              </Suspense>
            )}
            {activeTab === 'users' && (
              <UserRoles
                users={customers}
                staffRoles={staffRoles}
                onSaveRoles={handleSaveRoles}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}