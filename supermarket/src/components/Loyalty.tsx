// ════════════════════════════════════════════════════════════════════════════
// Loyalty.tsx: the "Loyalty & Rewards" tab. Only admins see it (it is one of
// the tabs in AdminPage, which is behind the admin-only route).
//
// It shows two tables:
//   1. Registered Members: everyone with a loyalty account and how many
//      points they have. Everyone who signs up gets a loyalty account, so
//      cashiers and admins are listed too. A search box narrows the list.
//   2. Audit Log: every time points were earned or redeemed, newest first.
//
// Where the data comes from: this component loads nothing itself. AdminPage
// hands the two lists in as "props" (the inputs a parent component passes to
// a child, like arguments to a function). AdminPage gets them from
// api.getCustomers() (the `customer` table joined to `users`) and
// api.getLoyaltyLogs() (the `loyalty_logs` table, which only admins may read),
// and fetches both again every time this tab is opened.
//
// The log rows are written by the database checkout function
// (process_pos_checkout_base) when a sale earns points (1 per full ₱100 paid)
// or spends them (₱5 each). Nothing on this screen can change points: it only
// shows them.
//
// The one thing it CAN change is a member's phone number ("Add phone" /
// "Edit" in the Phone column), so cashiers can look members up by phone at
// the POS, as the project spec asks. That goes through onSavePhone ->
// api.setMemberPhone() -> the database function set_member_phone().
// ════════════════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, RefreshCw, Search } from 'lucide-react';
import type { Customer, LoyaltyLog } from '../types/app';
import { cn } from '@/lib/utils';
import { memberPhoneSchema } from '../lib/validation';
import { useNotify } from '../contexts/NotifyContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import PageHeader from './PageHeader';

// The props this component accepts. In TypeScript an `interface` describes the
// shape of an object; a `?` after a name means it may be left out.
interface LoyaltyProps {
  // Members list: everyone with a loyalty account (every signed-up user,
  // staff included) and their current points balance, even when it is 0.
  customers?: Customer[];
  // Historical ledger log tracking earned and redeemed point events.
  // Arrives newest first (api.getLoyaltyLogs sorts it that way).
  logs?: LoyaltyLog[];
  // Called by the "Refresh data" button. If it isn't given, no button is shown.
  onRefresh?: () => void;
  // Called with an order number when one is clicked in the audit log, to open
  // it in the Orders tab. If it isn't given, order numbers are plain text.
  onOpenOrder?: (orderId: number) => void;
  // Saves a member's phone number ('' removes it), so the POS can find them
  // by phone. Throws an Error with a message if the database refuses it.
  // If it isn't given, phones are shown but can't be edited.
  onSavePhone?: (userId: string, phone: string) => Promise<void>;
}

// Shared table styles, so both tables look the same.
const tableCardClass = 'overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xs';
const headClass = 'border-b border-gray-200 bg-subtle font-semibold text-ink-muted';

// Loyalty & Rewards Center component for viewing registered members and auditing point transactions.
// `customers = []` and `logs = []` are default values: if a list is missing,
// an empty one is used so the code below never has to check for "undefined".
export default function Loyalty({ customers = [], logs = [], onRefresh, onOpenOrder, onSavePhone }: LoyaltyProps) {
  // useState makes the component remember a value between redraws. It gives
  // back the current value and a function to change it; changing it redraws
  // the screen. Here it is the text typed in the member search box.
  const [search, setSearch] = useState('');
  const { notify } = useNotify();

  // ── Editing a phone number (one member at a time) ──
  // Whose phone is being edited (null = nobody), what's typed, the message
  // under the box if it's not valid, and whether it's saving right now.
  const [editingPhoneId, setEditingPhoneId] = useState<string | null>(null);
  const [phoneDraft, setPhoneDraft] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [savingPhone, setSavingPhone] = useState(false);

  const startPhoneEdit = (member: Customer) => {
    setEditingPhoneId(member.id);
    setPhoneDraft(member.phone ?? '');
    setPhoneError(null);
  };
  const cancelPhoneEdit = () => {
    setEditingPhoneId(null);
    setPhoneError(null);
  };
  // Check the number (memberPhoneSchema: a PH mobile number, or empty to
  // remove it), then save it through onSavePhone (the database checks again
  // and refuses a number another member already uses).
  const savePhone = async (member: Customer) => {
    if (!onSavePhone || savingPhone) return;
    const check = memberPhoneSchema.safeParse(phoneDraft);
    if (!check.success) {
      setPhoneError(check.error.issues[0].message);
      return;
    }
    setSavingPhone(true);
    try {
      await onSavePhone(member.id, check.data);
      notify(check.data ? `Phone saved for ${member.name || member.email}.` : 'Phone number removed.', 'success');
      setEditingPhoneId(null);
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : 'Could not save the phone number.');
    } finally {
      setSavingPhone(false);
    }
  };

  // Filter the members table by name, email, phone or loyalty ID.
  // Both sides are lower-cased so "maria" finds "Maria". `.some(...)` is true
  // when at least one of the fields contains the text, and `(field || '')`
  // turns a missing value into empty text so toLowerCase() can't crash.
  // An empty search box (`!query`) keeps every member.
  const query = search.toLowerCase().trim();
  const visibleMembers = customers.filter(
    (c) =>
      !query ||
      [c.name, c.email, c.phone, c.loyalty_id].some((field) => (field || '').toLowerCase().includes(query))
  );

  // The audit log only stores the customer's id. Look up their name so the
  // log reads "Maria Santos" instead of a long id nobody can recognise.
  // A Map is a lookup table: built once here, then memberById.get(id) finds a
  // member straight away instead of searching the whole list for every row.
  const memberById = new Map(customers.map((c) => [c.id, c]));
  // Name if we have one, else email. If the member isn't in the list at all
  // (e.g. the members list failed to load), fall back to showing the raw id.
  const memberLabel = (customerId: string) => {
    const member = memberById.get(customerId);
    return member ? member.name || member.email : `Customer #${customerId}`;
  };

  return (
    <div className="space-y-8">
      {/* Title row. `onRefresh && (...)` shows the button only when a refresh
          function was passed in (undefined means "show nothing"). */}
      <PageHeader
        title="Loyalty & Rewards Center"
        actions={
          onRefresh && (
            <Button variant="outline" onClick={() => onRefresh?.()}>
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
            {/* Count of ALL members, not just the ones the search shows. */}
            <span className="text-xs font-medium text-ink-muted">{customers.length} total</span>
          </div>
          {/* Search box. Every key press updates `search`, which redraws the
              component and re-filters visibleMembers above. */}
          <div className="relative w-full sm:w-72">
            <Search
              className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-subtle"
              aria-hidden="true"
            />
            <Input
              type="search"
              aria-label="Search members"
              maxLength={100}
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
                {/* Nothing to show: either there are no members at all, or
                    none match the search. colSpan={4} stretches the message
                    across all four columns. */}
                {visibleMembers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-ink-muted">
                      {customers.length === 0 ? 'No members found.' : `No members match “${search}”.`}
                    </td>
                  </tr>
                ) : (
                  // One row per member. `key` lets React tell rows apart when
                  // the list changes, so it only redraws the rows that changed.
                  visibleMembers.map((c) => (
                    <tr key={c.id} className="transition-colors hover:bg-subtle/60">
                      {/* Name in bold (or the email if there's no name), with
                          the email underneath only when both exist. */}
                      <td className="px-4 py-3">
                        <div className="font-semibold text-ink">{c.name || c.email || 'N/A'}</div>
                        {c.name && c.email && <div className="text-xs text-ink-muted">{c.email}</div>}
                      </td>
                      {/* Phone: the number with "Edit" (or "Add phone"), or
                          while editing, a small box with Save / Cancel. Enter
                          saves, Escape cancels. */}
                      <td className="px-4 py-3 text-ink-muted">
                        {editingPhoneId === c.id ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <Input
                                aria-label={`Phone number for ${c.name || c.email}`}
                                inputMode="tel"
                                maxLength={20}
                                placeholder="0917 123 4567"
                                value={phoneDraft}
                                onChange={(e) => setPhoneDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') savePhone(c);
                                  if (e.key === 'Escape') cancelPhoneEdit();
                                }}
                                aria-invalid={phoneError ? true : undefined}
                                className="h-8 w-36 px-3 text-sm"
                                autoFocus
                              />
                              <Button size="sm" onClick={() => savePhone(c)} disabled={savingPhone}>
                                {savingPhone ? 'Saving…' : 'Save'}
                              </Button>
                              <Button variant="ghost" size="sm" onClick={cancelPhoneEdit} disabled={savingPhone}>
                                Cancel
                              </Button>
                            </div>
                            {phoneError && (
                              <p className="text-xs font-medium text-danger-strong" role="alert">
                                {phoneError}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <span className="tabular-nums">{c.phone || '—'}</span>
                            {onSavePhone && (
                              <button
                                type="button"
                                onClick={() => startPhoneEdit(c)}
                                className="text-xs font-semibold text-brand-strong hover:underline"
                              >
                                {c.phone ? 'Edit' : 'Add phone'}
                              </button>
                            )}
                          </span>
                        )}
                      </td>
                      {/* The loyalty ID the database gave them; if it's
                          missing, show their account id instead. */}
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
          {/* One "event" = one row in loyalty_logs. A sale that both spends
              and earns points writes two rows (one REDEEMED, one EARNED). */}
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
                    // Every log row is either EARNED (points added after a
                    // sale) or REDEEMED (points spent as a discount).
                    const isEarned = log.type === 'EARNED';
                    return (
                      <tr key={log.id} className="transition-colors hover:bg-subtle/60">
                        {/* toLocaleString() writes the date and time in the
                            format and time zone of this computer. */}
                        <td className="px-4 py-3 whitespace-nowrap text-ink-muted">
                          {log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A'}
                        </td>
                        <td className="px-4 py-3 font-medium text-ink">{memberLabel(log.customer_id)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-ink-muted">
                          {/* The order number opens that sale in the Orders tab. */}
                          {log.order_id && onOpenOrder ? (
                            <button
                              type="button"
                              className="font-semibold text-brand-strong hover:underline"
                              onClick={() => onOpenOrder(log.order_id!)}
                              title="Open this order in the Orders tab"
                            >
                              #{log.order_id}
                            </button>
                          ) : log.order_id ? (
                            `#${log.order_id}`
                          ) : (
                            '—'
                          )}
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
                        {/* The database saves redeemed points as a negative
                            number (e.g. -20), so only positive numbers need a
                            "+" added in front. */}
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
