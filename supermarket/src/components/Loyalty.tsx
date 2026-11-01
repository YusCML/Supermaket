import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, RefreshCw, Search } from 'lucide-react';
import type { Customer, LoyaltyLog } from '../types/app';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Input } from './ui/input';
import PageHeader from './PageHeader';

interface LoyaltyProps {
  // Members list: registered users with active loyalty point balances.
  customers?: Customer[];
  // Historical ledger log tracking earned and redeemed point events.
  logs?: LoyaltyLog[];
  onRefresh?: () => void;
}

// Shared table styles, so both tables look the same.
const tableCardClass = 'overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xs';
const headClass = 'border-b border-gray-200 bg-subtle font-semibold text-ink-muted';

// Loyalty & Rewards Center component for viewing registered members and auditing point transactions.
export default function Loyalty({ customers = [], logs = [], onRefresh }: LoyaltyProps) {
  const [search, setSearch] = useState('');

  // Filter the members table by name, email, phone or loyalty ID.
  const query = search.toLowerCase().trim();
  const visibleMembers = customers.filter(
    (c) =>
      !query ||
      [c.name, c.email, c.phone, c.loyalty_id].some((field) => (field || '').toLowerCase().includes(query))
  );

  // The audit log only stores the customer's id. Look up their name so the
  // log reads "Maria Santos" instead of a long id nobody can recognise.
  const memberById = new Map(customers.map((c) => [c.id, c]));
  const memberLabel = (customerId: string) => {
    const member = memberById.get(customerId);
    return member ? member.name || member.email : `Customer #${customerId}`;
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Loyalty & Rewards Center"
        actions={
          onRefresh && (
            <Button variant="outline" onClick={onRefresh}>
              <RefreshCw aria-hidden="true" />
              Refresh data
            </Button>
          )
        }
      />

      {/* ── Members ── */}
      <section className="space-y-3" aria-labelledby="loyalty-members-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <h3 id="loyalty-members-title" className="text-base font-bold text-ink">
              Registered Members
            </h3>
            <span className="text-xs font-medium text-ink-muted">{customers.length} total</span>
          </div>
          <div className="relative w-full sm:w-72">
            <Search
              className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-subtle"
              aria-hidden="true"
            />
            <Input
              type="search"
              aria-label="Search members"
              placeholder="Search name, email, phone or ID…"
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className={tableCardClass}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-ink">
              <thead className={cn(headClass, 'text-xs')}>
                <tr>
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3">Phone Number</th>
                  <th className="px-4 py-3">Loyalty ID</th>
                  <th className="px-4 py-3 text-right">Active Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleMembers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-ink-muted">
                      {customers.length === 0 ? 'No members found.' : `No members match “${search}”.`}
                    </td>
                  </tr>
                ) : (
                  visibleMembers.map((c) => (
                    <tr key={c.id} className="transition-colors hover:bg-subtle/60">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-ink">{c.name || c.email || 'N/A'}</div>
                        {c.name && c.email && <div className="text-xs text-ink-muted">{c.email}</div>}
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{c.phone || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-ink-muted">{c.loyalty_id || `#${c.id}`}</td>
                      <td className="px-4 py-3 text-right font-bold text-brand-strong tabular-nums">
                        {c.loyalty_points ?? 0} pts
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Audit log ── */}
      <section className="space-y-3" aria-labelledby="loyalty-log-title">
        <div className="flex items-baseline gap-2">
          <h3 id="loyalty-log-title" className="text-base font-bold text-ink">
            Audit Log
          </h3>
          <span className="text-xs font-medium text-ink-muted">{logs.length} logged events</span>
        </div>

        <div className={tableCardClass}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-ink">
              <thead className={cn(headClass, 'text-xs')}>
                <tr>
                  <th className="px-4 py-3">Date/Time</th>
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3 text-right">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-ink-muted">
                      No transactions recorded yet.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    const isEarned = log.type === 'EARNED';
                    return (
                      <tr key={log.id} className="transition-colors hover:bg-subtle/60">
                        <td className="px-4 py-3 whitespace-nowrap text-ink-muted">
                          {log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A'}
                        </td>
                        <td className="px-4 py-3 font-medium text-ink">{memberLabel(log.customer_id)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-ink-muted">
                          {log.order_id ? `#${log.order_id}` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {/* Plain coloured text: green for points earned, amber for points spent. */}
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 text-xs font-semibold',
                              isEarned ? 'text-brand-strong' : 'text-warning-strong'
                            )}
                          >
                            {isEarned ? (
                              <ArrowUpRight className="size-3.5" aria-hidden="true" />
                            ) : (
                              <ArrowDownRight className="size-3.5" aria-hidden="true" />
                            )}
                            {isEarned ? 'Earned' : 'Redeemed'}
                          </span>
                        </td>
                        <td
                          className={cn(
                            'px-4 py-3 text-right font-bold tabular-nums',
                            log.points_changed > 0 ? 'text-brand-strong' : 'text-warning-strong'
                          )}
                        >
                          {log.points_changed > 0 ? `+${log.points_changed}` : log.points_changed}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
