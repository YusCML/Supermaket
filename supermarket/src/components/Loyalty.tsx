import type { Customer, LoyaltyLog } from '../types/app';

interface LoyaltyProps {
  // Members list: registered users with active loyalty point balances.
  customers?: Customer[];
  // Historical ledger log tracking earned and redeemed point events.
  logs?: LoyaltyLog[];
  onRefresh?: () => void;
}

// Loyalty & Rewards Center component for viewing registered members and auditing point transactions.
export default function Loyalty({ customers = [], logs = [], onRefresh }: LoyaltyProps) {
  return (
    <div className="p-6 space-y-8 min-h-screen bg-[#F5F5F5] text-[#333333] font-sans antialiased selection:bg-[#2E7D32]/15 selection:text-[#2E7D32]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-[#333333]">
          Loyalty & Rewards Center
        </h2>
        {onRefresh && (
          <button
            className="rounded-lg border border-gray-300 bg-[#FFFFFF] px-4 py-2 text-xs font-semibold text-[#333333] hover:bg-gray-50 transition-colors shadow-xs cursor-pointer"
            onClick={onRefresh}
          >
            Refresh Data
          </button>
        )}
      </div>

      {/* Registered Members Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[#333333]">Registered Members</h3>
          <span className="text-xs text-[#333333]/60 font-medium">
            {customers.length} total members
          </span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-[#FFFFFF] shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#333333]">
              <thead className="bg-[#F5F5F5] border-b border-gray-200 text-[#333333]/70 font-semibold">
                <tr>
                  <th className="px-4 py-3">Member Name</th>
                  <th className="px-4 py-3">Phone Number</th>
                  <th className="px-4 py-3">Loyalty ID</th>
                  <th className="px-4 py-3 text-right">Active Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-[#333333]/50">
                      No members found.
                    </td>
                  </tr>
                ) : (
                  customers.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3 font-semibold text-[#333333]">
                        {c.name || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-[#333333]/70">{c.phone || 'N/A'}</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-[#333333]/70">
                        {c.loyalty_id || `#${c.id}`}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center rounded-full bg-[#2E7D32]/10 px-2.5 py-0.5 text-xs font-bold text-[#2E7D32] border border-[#2E7D32]/20">
                          {c.loyalty_points ?? 0} pts
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Audit Log Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[#333333]">Audit Log</h3>
          <span className="text-xs text-[#333333]/60 font-medium">
            {logs.length} logged events
          </span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-[#FFFFFF] shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#333333]">
              <thead className="bg-[#F5F5F5] border-b border-gray-200 text-[#333333]/70 font-semibold">
                <tr>
                  <th className="px-4 py-3">Date/Time</th>
                  <th className="px-4 py-3">Customer ID</th>
                  <th className="px-4 py-3">Order ID</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3 text-right">Points Delta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-[#333333]/50">
                      No transactions recorded yet.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    const isEarned = log.type === 'EARNED';
                    return (
                      <tr key={log.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 py-3 text-[#333333]/70 font-medium">
                          {log.created_at
                            ? new Date(log.created_at).toLocaleString()
                            : 'N/A'}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-[#333333]/80">
                          Customer #{log.customer_id}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-[#333333]/80">
                          {log.order_id ? `Order #${log.order_id}` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                              isEarned
                                ? 'bg-[#2E7D32]/10 text-[#2E7D32] border border-[#2E7D32]/20'
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}
                          >
                            {log.type}
                          </span>
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-bold ${
                            log.points_changed > 0 ? 'text-[#2E7D32]' : 'text-amber-800'
                          }`}
                        >
                          {log.points_changed > 0
                            ? `+${log.points_changed}`
                            : log.points_changed}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}