import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SalesAnalytics } from '../types/app';

interface AnalyticsProps {
  analytics: SalesAnalytics | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
const currency = (value: number) =>
  `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Analytics({ analytics, loading, error, onRetry }: AnalyticsProps) {
  if (loading) {
    return <div className="tab-content"><h2>Admin Sales Analytics</h2><p className="empty-state">Loading analytics…</p></div>;
  }

  if (error) {
    return (
      <div className="tab-content">
        <h2>Admin Sales Analytics</h2>
        <p className="analytics-error">{error}</p>
        <button className="btn-primary" onClick={onRetry}>Retry</button>
      </div>
    );
  }

  if (!analytics) {
    return <div className="tab-content"><h2>Admin Sales Analytics</h2><p className="empty-state">No analytics available yet.</p></div>;
  }

  const hasTrend = analytics.thirty_day_trend.some((point) => point.revenue > 0);
  const hasMonthlyRevenue = analytics.monthly_revenue.some((point) => point.revenue > 0);
  const hasPaymentMix = analytics.payment_mix.some((point) => point.value > 0);

  return (
    <div className="tab-content analytics-page">
      <h2>Admin Sales Analytics</h2>

      <div className="analytics-grid">
        <div className="stat-card">
          <span>Today</span>
          <strong>{currency(analytics.today_revenue)}</strong>
        </div>
        <div className="stat-card">
          <span>This week</span>
          <strong>{currency(analytics.week_revenue)}</strong>
        </div>
        <div className="stat-card">
          <span>This month</span>
          <strong>{currency(analytics.month_revenue)}</strong>
        </div>
        <div className="stat-card">
          <span>This year</span>
          <strong>{currency(analytics.year_revenue)}</strong>
        </div>
        <div className="stat-card">
          <span>All-time net revenue</span>
          <strong>{currency(analytics.net_revenue)}</strong>
        </div>
      </div>

      <div className="analytics-row">
        <div className="chart-card wide">
          <h3>30-day revenue trend</h3>
          {hasTrend ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={analytics.thirty_day_trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" interval={4} />
                <YAxis tickFormatter={(value: number) => `₱${value}`} />
                <Tooltip formatter={(value: number) => [currency(Number(value)), 'Revenue']} />
                <Line type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={3} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className="empty-state">No sales recorded in the last 30 days.</p>}
        </div>
      </div>

      <div className="analytics-row two-up">
        <div className="chart-card">
          <h3>Monthly revenue this year</h3>
          {hasMonthlyRevenue ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={analytics.monthly_revenue}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  tickFormatter={(month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-PH', { month: 'short', timeZone: 'UTC' })}
                />
                <YAxis tickFormatter={(value: number) => `₱${value}`} />
                <Tooltip formatter={(value: number) => [currency(Number(value)), 'Revenue']} />
                <Bar dataKey="revenue" radius={[5, 5, 0, 0]} fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="empty-state">No sales recorded this year.</p>}
        </div>

        <div className="chart-card">
          <h3>Payment mix this year</h3>
          {hasPaymentMix ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={analytics.payment_mix} dataKey="value" nameKey="name" innerRadius={45} outerRadius={90} paddingAngle={2}>
                  {analytics.payment_mix.map((entry, index) => (
                    <Cell key={`${entry.name}-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [currency(Number(value)), 'Revenue']} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="empty-state">No payments recorded this year.</p>}
        </div>
      </div>

      <div className="analytics-row two-up">
        <div className="chart-card">
          <h3>Top products this year</h3>
          {analytics.top_products.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={analytics.top_products} layout="vertical" margin={{ left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(value: number) => `₱${value}`} />
                <YAxis type="category" dataKey="name" width={100} />
                <Tooltip formatter={(value: number) => [currency(Number(value)), 'Net revenue']} />
                <Bar dataKey="revenue" fill="#8b5cf6" radius={[0, 5, 5, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="empty-state">No product sales recorded this year.</p>}
        </div>

        <div className="chart-card">
          <h3>Spoilage losses this year</h3>
          <div className="spoilage-box">
            <strong>{currency(analytics.spoilage_losses)}</strong>
            <span>Cost value lost to expired stock</span>
          </div>
        </div>
      </div>
    </div>
  );
}
