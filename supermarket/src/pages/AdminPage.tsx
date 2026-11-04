// AdminPage.tsx: the admin's page, at /admin.
//
// App.tsx wraps it in <ProtectedRoute role="admin">, so only admins get in
// (others are sent back to /app). The database checks again on every
// request, so hiding this page is about what's shown, not about security.
//
// Five screens in the sidebar, one shown at a time (they are not separate
// URLs): POS Checkout, Inventory, Loyalty & Rewards, Analytics, Users & Roles.
//
// Besides choosing the screen, this page:
//   - loads the extra data some screens need when they're opened (sales
//     analytics, who is staff, fresh loyalty data), and
//   - gives the Inventory and Users & Roles screens the functions that save
//     changes. Each save goes through lib/api.ts and then reloads the data.
// The main store data (products, stock, members, points log) comes from
// useStoreData('admin').
import { lazy, Suspense, useState, useEffect } from 'react';
import { ShoppingCart, Package, Star, BarChart3, Users, ReceiptText } from 'lucide-react';
import POS from '../components/POS';
import Inventory from '../components/Inventory';
import Loyalty from '../components/Loyalty';
import Orders from '../components/Orders';
import UserRoles from '../components/UserRoles';
import AppShell, { type NavTab } from '../components/AppShell';
import LoadingPanel from '../components/LoadingPanel';
import LoadErrorNotice from '../components/LoadErrorNotice';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotify } from '../contexts/NotifyContext';
import { useStoreData } from '../hooks/useStoreData';
import type {
  AppRole,
  NewProductInput,
  Order,
  ReceiveStockInput,
  SalesAnalytics,
  UpdateProductInput,
  WriteOffStockInput,
} from '../types/app';

// lazy() loads the Analytics screen (and the big Recharts chart library it
// uses) only the first time the Analytics tab is opened, instead of with the
// rest of the page. This is called "code splitting" and makes /admin open
// faster. While the code downloads, the <Suspense> below shows its `fallback`.
const Analytics = lazy(() => import('../components/Analytics'));

// The ids of the six screens. Only these strings are allowed.
type AdminTab = 'pos' | 'inventory' | 'orders' | 'loyalty' | 'analytics' | 'users';

// What the sidebar shows, in order: one entry per screen with label and icon.
const ADMIN_TABS: NavTab<AdminTab>[] = [
  { id: 'pos', label: 'POS Checkout', icon: <ShoppingCart /> },
  { id: 'inventory', label: 'Inventory', icon: <Package /> },
  { id: 'orders', label: 'Orders', icon: <ReceiptText /> },
  { id: 'loyalty', label: 'Loyalty & Rewards', icon: <Star /> },
  { id: 'analytics', label: 'Analytics', icon: <BarChart3 /> },
  { id: 'users', label: 'Users & Roles', icon: <Users /> },
];

// The page itself. It takes no props.
export default function AdminPage() {
  // From the two Context providers set up in main.tsx (shared data that any
  // component can read without it being passed down as props):
  //   user / refreshRoles: who is signed in, and a way to re-read their roles.
  //   notify: shows a pop-up notice (used when expired stock can't be processed).
  const { user, refreshRoles } = useAuth();
  const { notify } = useNotify();
  // All the main store data, loaded by the useStoreData "custom hook" (a
  // reusable function that uses other hooks; see hooks/useStoreData.ts). With
  // 'admin' it includes the loyalty points log. setCustomers / setLogs let the
  // effect further down swap in fresher lists.
  const {
    products,
    inventory,
    batches,
    customers,
    setCustomers,
    logs,
    setLogs,
    loading,
    loadError,
    loadData,
    handleCheckout,
    posProducts,
  } = useStoreData('admin');

  // useState gives the page a value it remembers between redraws, plus a
  // function to change it (changing it redraws the page).
  //
  // Which screen is showing (starts on the POS). AppShell calls setActiveTab
  // when a sidebar entry is clicked. Not part of the URL, so a page reload
  // goes back to the POS.
  const [activeTab, setActiveTab] = useState<AdminTab>('pos');
  // The Analytics screen's numbers (null until loaded), whether they're
  // loading, and the error message if loading failed.
  const [analytics, setAnalytics] = useState<SalesAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  // Bumping this number re-runs the analytics loading (Refresh / Try again).
  const [analyticsRefreshKey, setAnalyticsRefreshKey] = useState(0);
  // The Orders screen: the sales, whether they're loading, the error if
  // loading failed, and a number to bump for Refresh (same idea as analytics).
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [ordersRefreshKey, setOrdersRefreshKey] = useState(0);
  // What the Orders search box starts with, e.g. "#12" after clicking order
  // #12 in the Loyalty audit log (see openOrder below).
  const [ordersSearch, setOrdersSearch] = useState('');
  // Who is staff: { userId: ['cashier', 'admin'], ... }. Anyone not listed is
  // a customer only. Loaded when the Users & Roles tab is opened.
  const [staffRoles, setStaffRoles] = useState<Record<string, AppRole[]>>({});
  // Whether staffRoles has really been loaded. Until it's 'ready', the Users &
  // Roles tab stays locked: with an empty list everyone would look like
  // "customer only", and ticking a box would then quietly remove their real roles.
  const [staffRolesStatus, setStaffRolesStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  // Bumping this number re-runs the roles loading (the "Try again" button).
  const [rolesReloadKey, setRolesReloadKey] = useState(0);

  // useEffect runs code after React has drawn the page. Its dependency list
  // (the array at the end) says when to run it again: whenever one of those
  // values changes. The four effects below all load data for one tab, so
  // they run when activeTab changes and return straight away on other tabs.
  //
  // They all use the same `cancelled` trick. The function an effect returns is
  // its "cleanup": React runs it before the effect runs again, and when the
  // page goes away. If the admin switches tabs before an answer arrives, the
  // cleanup sets cancelled = true and the late answer is ignored, so it can't
  // overwrite newer data.

  // Users & Roles tab: load who is cashier/admin. Runs when the tab is opened
  // and when "Try again" bumps rolesReloadKey ([activeTab, rolesReloadKey]).
  useEffect(() => {
    if (activeTab !== 'users') return;

    let cancelled = false;
    setStaffRolesStatus('loading');
    api.getStaffRoles()
      .then((roles) => {
        if (cancelled) return;
        setStaffRoles(roles);
        setStaffRolesStatus('ready');
      })
      .catch((err) => {
        console.error('Error loading roles:', err);
        if (!cancelled) setStaffRolesStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, rolesReloadKey]);

  // Loyalty and Users & Roles tabs: points change with every sale, so fetch
  // the members and the points log again each time one of these tabs is
  // opened (Users & Roles lists the members too). Runs when activeTab
  // changes. If it fails the error is only logged, and the lists already
  // loaded by useStoreData stay on screen.
  useEffect(() => {
    if (activeTab !== 'loyalty' && activeTab !== 'users' && activeTab !== 'orders') return;

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

  // Load the sales history when the Orders tab is opened, and again whenever
  // ordersRefreshKey is bumped (the Refresh button). Same pattern as the
  // analytics effect: `cancelled` ignores an answer that arrives after the
  // admin has already switched to another tab.
  useEffect(() => {
    if (activeTab !== 'orders') return;

    let cancelled = false;
    setOrdersLoading(true);
    setOrdersError(null);
    api.getOrders()
      .then((data) => {
        if (!cancelled) setOrders(data);
      })
      .catch((err) => {
        console.error('Could not load orders:', err);
        if (!cancelled) setOrdersError(err instanceof Error ? err.message : 'Could not load orders.');
      })
      .finally(() => {
        if (!cancelled) setOrdersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, ordersRefreshKey]);

  // Opens the Orders tab with one order searched for and opened. Used by the
  // order numbers in the Loyalty audit log.
  const openOrder = (orderId: number) => {
    setOrdersSearch(`#${orderId}`);
    setActiveTab('orders');
  };

  // Analytics tab: load the sales numbers when the tab is opened, and again
  // when Refresh / Try again bumps analyticsRefreshKey
  // ([activeTab, analyticsRefreshKey]). The database function behind it is
  // get_admin_sales_analytics (admins only).
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

  // Inventory tab: each time it's opened, first move any batches that have
  // expired since last time out of stock (database function
  // process_expired_batches, which also logs the loss), then reload the data
  // so the table shows the result. Runs when activeTab changes. If it fails,
  // a red notice pops up.
  useEffect(() => {
    if (activeTab !== 'inventory') return;

    let cancelled = false;
    api.processExpiredBatches()
      .then(() => {
        if (!cancelled) return loadData(false);
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

  // The save functions handed to <Inventory> as props. Each one saves through
  // lib/api.ts, then reloads everything (loadData) so the screen shows the
  // new numbers. loadData(false) reloads QUIETLY, without swapping the tab for
  // the loading panel, so the admin keeps their search, filters, open forms
  // and scroll position. There's no try/catch here on purpose: an error is passed up
  // to Inventory, which shows it as a notice.

  // Add a product; returns the saved product.
  const handleAddProduct = async (product: NewProductInput) => {
    const saved = await api.addProduct(product);
    await loadData(false);
    return saved;
  };

  // Receive a delivery as a new batch; returns its batch code (e.g. "B-3").
  const handleReceiveStock = async (input: ReceiveStockInput) => {
    const batchCode = await api.receiveStock(input);
    await loadData(false);
    return batchCode;
  };

  // Save changes to an existing product.
  const handleUpdateProduct = async (productId: number, product: UpdateProductInput) => {
    await api.updateProduct(productId, product);
    await loadData(false);
  };

  // Remove damaged or spoiled units from a batch (the loss is logged).
  const handleWriteOffStock = async (input: WriteOffStockInput) => {
    await api.writeOffStock(input);
    await loadData(false);
  };

  // The "Process expired stock" button: same as the automatic run when the
  // Inventory tab opens.
  const handleProcessExpired = async () => {
    await api.processExpiredBatches();
    await loadData(false);
  };

  // Handed to <UserRoles>. Saves one person's roles (database function
  // set_user_roles, admins only), then re-reads the staff list. If admins
  // changed their OWN roles, AuthContext re-reads them too, so the app
  // follows straight away (e.g. removing your own admin role sends you
  // back to /app). Errors pass up to UserRoles, which shows them.
  const handleSaveRoles = async (userId: string, roles: AppRole[]) => {
    await api.setUserRoles(userId, roles);
    setStaffRoles(await api.getStaffRoles());
    if (userId === user?.id) refreshRoles();
  };

  return (
    <AppShell role="admin" tabs={ADMIN_TABS} activeTab={activeTab} onTabChange={setActiveTab}>
        {/* Shown only if some data failed to load. */}
        {loadError && <LoadErrorNotice message={loadError} onRetry={() => loadData()} />}
        {/* A spinner while loading, then the active screen. Each
            `activeTab === '...' && (...)` shows its screen only when it's
            the active one; the others aren't drawn at all. */}
        {loading ? (
          <LoadingPanel message="Loading store data…" />
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
            {/* The full Inventory (not readOnly), with the save functions above. */}
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
                onRefresh={() => loadData(false)}
              />
            )}
            {activeTab === 'orders' && (
              <Orders
                // key: when the search changes (e.g. coming from a new order
                // number in the audit log), start the Orders screen fresh so
                // it picks up that search and opens that order.
                key={ordersSearch}
                initialSearch={ordersSearch}
                orders={orders}
                loading={ordersLoading}
                error={ordersError}
                onRefresh={() => setOrdersRefreshKey((key) => key + 1)}
                customers={customers}
                logs={logs}
                batches={batches}
                products={products}
              />
            )}
            {activeTab === 'loyalty' && (
              <Loyalty
                customers={customers}
                logs={logs}
                onRefresh={() => loadData(false)}
                onOpenOrder={openOrder}
                // Saves a member's phone (set_member_phone in the database),
                // then puts the saved number into the members list straight
                // away, so the POS can find them by phone without a reload.
                onSavePhone={async (userId, phone) => {
                  const saved = await api.setMemberPhone(userId, phone);
                  setCustomers((list) => list.map((c) => (c.id === userId ? { ...c, phone: saved } : c)));
                }}
              />
            )}
            {/* Suspense shows `fallback` while the lazy-loaded Analytics code
                is still downloading (only the first time). */}
            {activeTab === 'analytics' && (
              <Suspense
                fallback={<LoadingPanel message="Loading analytics…" />}
              >
                {/* customers: for the member names in its order list;
                    onOpenOrder: clicking an order there opens it in the
                    Orders tab (openOrder above). */}
                <Analytics
                  analytics={analytics}
                  loading={analyticsLoading}
                  error={analyticsError}
                  onRetry={() => setAnalyticsRefreshKey((key) => key + 1)}
                  customers={customers}
                  onOpenOrder={openOrder}
                />
              </Suspense>
            )}
            {/* Everyone is a member (customer), so the members list doubles
                as the list of all users. */}
            {activeTab === 'users' && (
              <UserRoles
                users={customers}
                staffRoles={staffRoles}
                rolesStatus={staffRolesStatus}
                onRetryRoles={() => setRolesReloadKey((key) => key + 1)}
                onSaveRoles={handleSaveRoles}
              />
            )}
          </>
        )}
    </AppShell>
  );
}