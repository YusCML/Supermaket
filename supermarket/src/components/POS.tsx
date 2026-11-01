import { useRef, useState, type KeyboardEvent } from 'react';
import { Banknote, CreditCard, LoaderCircle, Minus, Plus, ShoppingBasket, Star, X } from 'lucide-react';
import type { ProductInventorySummary, ProductBatch, Customer, CartItem, CheckoutPayload, CheckoutReceipt } from '../types/app';
import { discountForPoints, maxRedeemablePoints, PESO_VALUE_PER_POINT, roundToCentavos } from '../lib/loyalty';
import { markedDownPrice, NEAR_EXPIRY_PERCENT_OFF, priceLine } from '../lib/pricing';
import { formatExpiry, isNearExpiry, sellableBatches } from '../lib/expiry';
import { cn } from '@/lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useNotify } from '../contexts/NotifyContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import ProductDetails from './ProductDetails';
import ProductMenu from './ProductMenu';
import Receipt from './Receipt';

interface POSProps {
  products: ProductInventorySummary[];
  customers: Customer[];
  batches?: ProductBatch[];
  onCheckout: (payload: CheckoutPayload) => Promise<CheckoutReceipt>;
  mode?: 'self-serve' | 'staff';
}

type PaymentMethod = 'Cash' | 'Card' | 'Loyalty Points';

// The payment buttons under the total. `value` is what gets saved with the
// order; `label` is the shorter text shown on the button.
const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { value: 'Cash', label: 'Cash', icon: Banknote },
  { value: 'Card', label: 'Card', icon: CreditCard },
  { value: 'Loyalty Points', label: 'Points', icon: Star },
];

function matchesMember(c: Customer, query: string): boolean {
  const lowered = query.toLowerCase();
  return (
    c.phone === query ||
    c.loyalty_id?.toLowerCase() === lowered ||
    c.email?.toLowerCase() === lowered ||
    String(c.id) === query
  );
}

function memberContains(c: Customer, query: string): boolean {
  const lowered = query.toLowerCase();
  return [c.name, c.email, c.phone, c.loyalty_id].some((field) =>
    (field || '').toLowerCase().includes(lowered)
  );
}

const MAX_MEMBER_SUGGESTIONS = 6;

// Money is always shown with 2 decimals, e.g. ₱12.50.
const peso = (amount: number) => `₱${amount.toFixed(2)}`;

export default function POS({ products = [], customers = [], batches = [], onCheckout, mode = 'staff' }: POSProps) {
  const { user } = useAuth();
  const { notify } = useNotify();
  const isSelfServe = mode === 'self-serve';

  const me = customers.find((c) => c.id === user?.id) ?? null;
  const startingMember = isSelfServe ? me : null;

  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [phoneSearch, setPhoneSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(startingMember);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [cashReceivedInput, setCashReceivedInput] = useState('');
  const [receipt, setReceipt] = useState<CheckoutReceipt | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [detailsProductId, setDetailsProductId] = useState<number | null>(null);
  // True while the sale is being saved, so the button can say "Processing…".
  // (isSubmitting below is the instant double-click guard; this one is just
  // for what's shown on screen.)
  const [submitting, setSubmitting] = useState(false);

  const currentMember = selectedCustomer
    ? customers.find((c) => c.id === selectedCustomer.id) ?? selectedCustomer
    : null;

  const isSubmitting = useRef(false);

  const filteredProducts = products.filter((p) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (p.name || '').toLowerCase().includes(q) ||
      (p.barcode || '').toLowerCase().includes(q) ||
      (p.sku || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q)
    );
  });

  const lineKey = (item: Pick<CartItem, 'id' | 'batch_id'>) => `${item.id}:${item.batch_id ?? 'any'}`;

  const sellableBatchesOf = (productId: number) =>
    sellableBatches(batches.filter((b) => b.product_id === productId));

  const inCartForProduct = (productId: number) =>
    cart.filter((item) => item.id === productId).reduce((sum, item) => sum + item.quantity, 0);
  const inCartForBatch = (batchId: number) =>
    cart.filter((item) => item.batch_id === batchId).reduce((sum, item) => sum + item.quantity, 0);

  const addToCart = (product: ProductInventorySummary, quantity = 1, batch?: ProductBatch) => {
    if (product.stock_quantity <= 0) return notify('Item is out of stock!', 'error');
    if (inCartForProduct(product.id) + quantity > product.stock_quantity) {
      return notify('Cannot exceed available stock!', 'error');
    }

    const portions: { batch: ProductBatch | null; quantity: number }[] = [];
    const productBatches = sellableBatchesOf(product.id);

    if (batch) {
      const free = batch.quantity_remaining - inCartForBatch(batch.id);
      if (quantity > free) return notify(`Batch ${batch.batch_code} only has ${free} left.`, 'error');
      portions.push({ batch, quantity });
    } else if (productBatches.length > 0) {
      let left = quantity;
      for (const b of productBatches) {
        const take = Math.min(left, b.quantity_remaining - inCartForBatch(b.id));
        if (take > 0) {
          portions.push({ batch: b, quantity: take });
          left -= take;
        }
        if (left === 0) break;
      }
      if (left > 0) return notify('Not enough unexpired stock left for this product.', 'error');
    } else {
      portions.push({ batch: null, quantity });
    }

    setCart((prev) => {
      let next = prev;
      for (const portion of portions) {
        const key = lineKey({ id: product.id, batch_id: portion.batch?.id ?? null });
        const existing = next.find((item) => lineKey(item) === key);
        next = existing
          ? next.map((item) =>
              lineKey(item) === key ? { ...item, quantity: item.quantity + portion.quantity } : item
            )
          : [
              ...next,
              {
                ...product,
                quantity: portion.quantity,
                batch_id: portion.batch?.id ?? null,
                batch_code: portion.batch?.batch_code ?? null,
                batch_expiry: portion.batch?.expiry_date ?? null,
              },
            ];
      }
      return next;
    });
  };

  const nearExpiryUnitsOf = (id: number) =>
    products.find((p) => p.id === id)?.near_expiry_count ?? 0;

  const detailsProduct = products.find((p) => p.id === detailsProductId) ?? null;

  const removeFromCart = (key: string) => {
    setCart((prev) => prev.filter((item) => lineKey(item) !== key));
  };

  const stockOf = (id: number) =>
    products.find((p) => p.id === id)?.stock_quantity ?? 0;

  const batchOfLine = (item: CartItem) =>
    item.batch_id === null ? null : batches.find((b) => b.id === item.batch_id) ?? null;

  const canAddOneMore = (item: CartItem) => {
    if (inCartForProduct(item.id) >= stockOf(item.id)) return false;
    const batch = batchOfLine(item);
    return batch ? inCartForBatch(batch.id) < batch.quantity_remaining : true;
  };

  const increaseQuantity = (item: CartItem) => {
    const product = products.find((p) => p.id === item.id);
    if (product) addToCart(product, 1, batchOfLine(item) ?? undefined);
  };

  const decreaseQuantity = (key: string) => {
    setCart((prev) =>
      prev.map((item) =>
        lineKey(item) === key && item.quantity > 1 ? { ...item, quantity: item.quantity - 1 } : item
      )
    );
  };

  const handleScan = () => {
    const code = search.trim();
    if (!code) return;

    const lowered = code.toLowerCase();
    const match =
      products.find((p) => p.barcode === code) ||
      products.find((p) => (p.sku || '').toLowerCase() === lowered) ||
      (filteredProducts.length === 1 ? filteredProducts[0] : undefined);

    if (!match) {
      if (/^\d+$/.test(code)) notify(`No product found with barcode ${code}`, 'error');
      return;
    }

    addToCart(match);
    setSearch('');
  };

  const lookupText = phoneSearch.trim();
  const isSearchingMember =
    lookupText !== '' && !(selectedCustomer && matchesMember(selectedCustomer, lookupText));
  const memberSuggestions = isSearchingMember
    ? customers.filter((c) => memberContains(c, lookupText)).slice(0, MAX_MEMBER_SUGGESTIONS)
    : [];
  const suggestionsOpen = showSuggestions && isSearchingMember;

  const handleMemberInput = (value: string) => {
    setPhoneSearch(value);
    setShowSuggestions(true);
    setHighlighted(-1);
    if (!value.trim()) {
      setSelectedCustomer(null);
      setPointsToRedeem(0);
    }
  };

  const selectMember = (cust: Customer) => {
    setSelectedCustomer(cust);
    setPhoneSearch(cust.loyalty_id || cust.email || String(cust.id));
    setPointsToRedeem(0);
    setShowSuggestions(false);
    setHighlighted(-1);
  };

  const findCustomer = () => {
    if (!lookupText) return;
    const cust =
      customers.find((c) => matchesMember(c, lookupText)) ??
      (memberSuggestions.length === 1 ? memberSuggestions[0] : undefined);

    if (cust) {
      selectMember(cust);
    } else if (memberSuggestions.length > 1) {
      setShowSuggestions(true);
    } else {
      notify('Customer not found!', 'error');
    }
  };

  const handleMemberKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const canMove = suggestionsOpen && memberSuggestions.length > 0;

    if (e.key === 'ArrowDown' && canMove) {
      e.preventDefault();
      setHighlighted((i) => (i + 1) % memberSuggestions.length);
    } else if (e.key === 'ArrowUp' && canMove) {
      e.preventDefault();
      setHighlighted((i) => (i <= 0 ? memberSuggestions.length - 1 : i - 1));
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    } else if (e.key === 'Enter') {
      const picked = canMove ? memberSuggestions[highlighted] : undefined;
      if (picked) selectMember(picked);
      else findCustomer();
    }
  };

  const priceOfLine = (item: CartItem) =>
    item.batch_id !== null
      ? priceLine(item.price || 0, item.quantity, isNearExpiry(item.batch_expiry) ? item.quantity : 0)
      : priceLine(item.price || 0, item.quantity, nearExpiryUnitsOf(item.id));
  const linePrices = new Map(cart.map((item) => [lineKey(item), priceOfLine(item)]));
  const lineTotalOf = (item: CartItem) => linePrices.get(lineKey(item))?.total ?? 0;
  const markedDownQtyOf = (item: CartItem) => linePrices.get(lineKey(item))?.markedDownQty ?? 0;

  const fullPriceTotal = roundToCentavos(
    cart.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0)
  );
  const nearExpirySavings = roundToCentavos(
    cart.reduce((sum, item) => sum + (linePrices.get(lineKey(item))?.savings ?? 0), 0)
  );
  const total = roundToCentavos(fullPriceTotal - nearExpirySavings);

  const redeemablePoints = maxRedeemablePoints(currentMember?.loyalty_points ?? 0, total);
  const pointsApplied = Math.min(pointsToRedeem, redeemablePoints);
  const discount = discountForPoints(pointsApplied, total);
  const finalTotal = roundToCentavos(total - discount);

  // How many items are in the basket in total (3 apples + 2 milk = 5).
  const basketCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Live "change due" preview under the cash box, so the cashier doesn't need
  // a calculator. Positive = change to give back, negative = customer is short.
  // It's only a preview: the real check still happens in handleCheckoutSubmit.
  const cashTyped = cashReceivedInput.trim() === '' ? null : Number(cashReceivedInput);
  const cashDifference =
    cashTyped !== null && Number.isFinite(cashTyped) ? roundToCentavos(cashTyped - finalTotal) : null;

  const handlePointsChange = (value: string) => {
    const points = Math.floor(Number(value) || 0);
    setPointsToRedeem(Math.max(0, Math.min(points, redeemablePoints)));
  };

  const handleCheckoutSubmit = async () => {
    if (isSubmitting.current) return;
    if (cart.length === 0) return notify('Cart is empty!', 'error');

    if (isSelfServe && !selectedCustomer) {
      return notify("We couldn't load your loyalty account. Please sign out and sign back in.", 'error');
    }

    const memberQuery = phoneSearch.trim();
    if (memberQuery && !(selectedCustomer && matchesMember(selectedCustomer, memberQuery))) {
      const typedMember = customers.find((c) => matchesMember(c, memberQuery));
      if (!typedMember) return notify('Customer not found!', 'error');
      setSelectedCustomer(typedMember);
      setPointsToRedeem(0);
      return notify(
        `Member changed to ${typedMember.name || typedMember.email}. Check the total, then press Complete Transaction again.`,
        'info'
      );
    }

    if (!selectedCustomer) {
      return notify('Look up a member (name or loyalty ID) before checking out.', 'error');
    }

    if (paymentMethod === 'Loyalty Points') {
      if (finalTotal > 0) {
        return notify(
          `Not enough points redeemed to cover the bill. ₱${finalTotal.toFixed(2)} is still due.`,
          'error'
        );
      }
    }

    let cashReceived: number | null = null;
    if (paymentMethod === 'Cash') {
      if (!cashReceivedInput.trim() || !Number.isFinite(Number(cashReceivedInput))) {
        return notify('Enter the cash amount received.', 'error');
      }
      cashReceived = roundToCentavos(Number(cashReceivedInput));
      if (cashReceived < finalTotal) {
        return notify(`Cash received must be at least ₱${finalTotal.toFixed(2)}.`, 'error');
      }
    }

    isSubmitting.current = true;
    setSubmitting(true);
    try {
      const savedReceipt = await onCheckout({
        cart,
        customerId: selectedCustomer?.id ?? null,
        pointsToRedeem: pointsApplied,
        paymentMethod,
        cashReceived,
      });
      setReceipt(savedReceipt);
      setCart([]);
      setSelectedCustomer(startingMember);
      setPointsToRedeem(0);
      setPhoneSearch('');
      setCashReceivedInput('');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Checkout failed', 'error');
    } finally {
      isSubmitting.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
      {/* ── Left: search + the product menu, grouped by category ─────────── */}
      <ProductMenu
        products={filteredProducts}
        totalCount={products.length}
        search={search}
        onSearchChange={setSearch}
        onScan={handleScan}
        inBasketCount={inCartForProduct}
        onOpenDetails={setDetailsProductId}
        // The round + button adds one, picking the batch automatically
        // (soonest expiry first), just like scanning the barcode.
        onQuickAdd={(product) => addToCart(product)}
      />

      {/* ── Right: member, basket and payment ──────────────────────────── */}
      {/* Sticky on desktop so the total and the Complete button stay on screen
          while scrolling through products. */}
      <section
        aria-labelledby="pos-basket-title"
        className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5 shadow-xs lg:sticky lg:top-6 lg:col-span-5 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto xl:col-span-4"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id="pos-basket-title" className="text-xl font-bold tracking-tight text-ink">
            Active Basket
          </h2>
          <span className={cn('text-sm font-semibold tabular-nums', basketCount > 0 ? 'text-brand-strong' : 'text-ink-muted')}>
            {basketCount} {basketCount === 1 ? 'item' : 'items'}
          </span>
        </div>

        {/* Member lookup (staff only — self-serve customers are already "the member") */}
        {!isSelfServe && (
          <div className="space-y-1.5">
            <label htmlFor="pos-member" className="block text-xs font-semibold text-ink">
              Member
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="pos-member"
                  placeholder="Name, loyalty ID, phone or email"
                  value={phoneSearch}
                  onChange={(e) => handleMemberInput(e.target.value)}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setShowSuggestions(false)}
                  onKeyDown={handleMemberKeyDown}
                  autoComplete="off"
                  spellCheck={false}
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={suggestionsOpen}
                  aria-controls="member-suggestions"
                />

                {suggestionsOpen && (
                  <ul
                    className="absolute right-0 left-0 z-30 mt-1 max-h-56 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
                    id="member-suggestions"
                    role="listbox"
                  >
                    {memberSuggestions.length === 0 ? (
                      <li className="px-3 py-2 text-center text-xs text-ink-muted">No members match</li>
                    ) : (
                      memberSuggestions.map((c, index) => (
                        <li
                          key={c.id}
                          role="option"
                          aria-selected={index === highlighted}
                          className={cn(
                            'cursor-pointer px-3 py-2 text-xs transition-colors',
                            index === highlighted ? 'bg-brand/10' : 'hover:bg-subtle'
                          )}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectMember(c);
                          }}
                          onMouseEnter={() => setHighlighted(index)}
                        >
                          <strong className="block font-semibold text-ink">{c.name || c.email}</strong>
                          <small className="block text-[11px] text-ink-muted">
                            {[c.loyalty_id, c.phone, c.name !== c.email ? c.email : null]
                              .filter(Boolean)
                              .join(' · ')}
                            {' · '}
                            {c.loyalty_points ?? 0} pts
                          </small>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
              <Button variant="outline" onClick={findCustomer}>
                Look up
              </Button>
            </div>
          </div>
        )}

        {/* The chosen member and their points */}
        {currentMember && (
          <div className="space-y-2 rounded-md border border-brand/20 bg-brand/5 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <strong className="block truncate font-semibold text-ink">
                  {currentMember.name || currentMember.email}
                </strong>
                {currentMember.loyalty_id && (
                  <span className="font-mono text-[11px] text-ink-muted">{currentMember.loyalty_id}</span>
                )}
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-strong tabular-nums">
                <Star className="size-3.5" aria-hidden="true" />
                {currentMember.loyalty_points ?? 0} pts
              </span>
            </div>

            {(currentMember.loyalty_points ?? 0) > 0 && (
              <div className="flex items-center justify-between gap-2 border-t border-brand/15 pt-2">
                <label htmlFor="pos-points" className="text-xs font-medium text-ink">
                  Redeem points <span className="text-ink-muted">(₱{PESO_VALUE_PER_POINT} each)</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <Input
                    id="pos-points"
                    type="number"
                    max={redeemablePoints}
                    min="0"
                    value={pointsApplied}
                    onChange={(e) => handlePointsChange(e.target.value)}
                    autoComplete="off"
                    className="h-8 w-20 px-3 text-right font-semibold text-brand-strong tabular-nums"
                  />
                  {/* One click to use as many points as this bill allows. */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPointsToRedeem(redeemablePoints)}
                    disabled={redeemablePoints === 0 || pointsApplied === redeemablePoints}
                  >
                    Use max
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Basket lines. Takes the leftover height and scrolls if it's long. */}
        <div className="-mr-1 min-h-32 flex-1 divide-y divide-gray-100 overflow-y-auto pr-1">
          {cart.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center text-ink-muted">
              <ShoppingBasket className="size-8 text-ink-subtle" aria-hidden="true" />
              <p className="text-sm font-medium">Basket is empty</p>
              <p className="text-xs">Scan a barcode or pick a product to start.</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={lineKey(item)} className="flex items-start justify-between gap-3 py-3 first:pt-0">
                <div className="min-w-0 space-y-1.5">
                  <strong className="block text-sm font-semibold text-ink">{item.name}</strong>
                  {item.batch_code && (
                    <div className="font-mono text-[11px] text-ink-muted">
                      Batch {item.batch_code} · {formatExpiry(item.batch_expiry)}
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon-xs"
                      onClick={() => decreaseQuantity(lineKey(item))}
                      disabled={item.quantity <= 1}
                      aria-label={`One less ${item.name}`}
                    >
                      <Minus />
                    </Button>
                    <span className="w-7 text-center text-sm font-semibold text-ink tabular-nums" aria-live="polite">
                      {item.quantity}
                    </span>
                    <Button
                      variant="outline"
                      size="icon-xs"
                      onClick={() => increaseQuantity(item)}
                      disabled={!canAddOneMore(item)}
                      aria-label={`One more ${item.name}`}
                    >
                      <Plus />
                    </Button>
                  </div>
                </div>

                <div className="shrink-0 space-y-1 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-sm font-semibold text-ink tabular-nums">{peso(lineTotalOf(item))}</span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="hover:bg-danger/10 hover:text-danger-strong"
                      onClick={() => removeFromCart(lineKey(item))}
                      aria-label={`Remove ${item.name}`}
                    >
                      <X />
                    </Button>
                  </div>
                  {markedDownQtyOf(item) > 0 && (
                    <div className="text-[11px] font-medium text-warning-strong">
                      {markedDownQtyOf(item)} × {peso(markedDownPrice(item.price || 0))} ({NEAR_EXPIRY_PERCENT_OFF}% off)
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Totals */}
        <dl className="space-y-1.5 border-t border-gray-200 pt-4 text-sm tabular-nums">
          <div className="flex justify-between text-ink-muted">
            <dt>Subtotal</dt>
            <dd className="font-medium text-ink">{peso(fullPriceTotal)}</dd>
          </div>
          {nearExpirySavings > 0 && (
            <div className="flex justify-between font-medium text-warning-strong">
              <dt>Near-expiry {NEAR_EXPIRY_PERCENT_OFF}% off</dt>
              <dd>−{peso(nearExpirySavings)}</dd>
            </div>
          )}
          {discount > 0 && (
            <div className="flex justify-between font-medium text-brand-strong">
              <dt>Points discount</dt>
              <dd>−{peso(discount)}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between pt-1 text-ink">
            <dt className="text-base font-bold">Total</dt>
            <dd className="text-2xl font-extrabold text-brand-strong">{peso(finalTotal)}</dd>
          </div>
        </dl>

        {/* Payment */}
        <div className="space-y-3">
          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold text-ink">Payment method</legend>
            {/* Three side-by-side buttons instead of a dropdown: one click instead of two. */}
            <div className="grid grid-cols-3 gap-1 rounded-full bg-subtle p-1">
              {PAYMENT_METHODS.map(({ value, label, icon: Icon }) => {
                const isActive = paymentMethod === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={isActive}
                    className={cn(
                      'inline-flex items-center justify-center gap-1.5 rounded-full py-2 text-xs font-semibold transition-colors',
                      isActive ? 'bg-brand text-white shadow-xs' : 'text-ink-muted hover:text-ink'
                    )}
                    onClick={() => setPaymentMethod(value)}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {paymentMethod === 'Cash' && (
            <div className="space-y-1.5">
              <label htmlFor="pos-cash" className="block text-xs font-semibold text-ink">
                Cash received
              </label>
              <div className="flex gap-2">
                <Input
                  id="pos-cash"
                  type="number"
                  inputMode="decimal"
                  min={finalTotal}
                  step="0.01"
                  placeholder={finalTotal.toFixed(2)}
                  value={cashReceivedInput}
                  onChange={(e) => setCashReceivedInput(e.target.value)}
                  autoComplete="off"
                  className="tabular-nums"
                  aria-describedby="pos-cash-change"
                  required
                />
                {/* Fills in the exact total, for when the customer pays with exact change. */}
                <Button
                  variant="outline"
                  onClick={() => setCashReceivedInput(finalTotal.toFixed(2))}
                  disabled={cart.length === 0}
                >
                  Exact
                </Button>
              </div>
              {cashDifference !== null && cart.length > 0 && (
                <p
                  id="pos-cash-change"
                  className={cn(
                    'flex justify-between rounded-md px-3 py-2 text-sm font-semibold tabular-nums',
                    cashDifference >= 0 ? 'bg-brand/10 text-brand-strong' : 'bg-danger/10 text-danger-strong'
                  )}
                >
                  <span>{cashDifference >= 0 ? 'Change due' : 'Still short'}</span>
                  <span>{peso(Math.abs(cashDifference))}</span>
                </p>
              )}
            </div>
          )}

          <Button size="lg" className="w-full" onClick={handleCheckoutSubmit} disabled={cart.length === 0 || submitting}>
            {submitting ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden="true" />
                Processing…
              </>
            ) : (
              'Complete Transaction'
            )}
          </Button>
        </div>
      </section>

      {/* Pop-up windows */}
      {detailsProduct && (
        <ProductDetails
          product={detailsProduct}
          batches={sellableBatchesOf(detailsProduct.id)}
          inBasket={inCartForProduct(detailsProduct.id)}
          inBasketForBatch={inCartForBatch}
          onAdd={(quantity, batch) => {
            addToCart(detailsProduct, quantity, batch);
            setDetailsProductId(null);
          }}
          onClose={() => setDetailsProductId(null)}
        />
      )}
      {receipt && (
        <Receipt
          receipt={receipt}
          cashReceived={receipt.cash_received}
          onClose={() => setReceipt(null)}
        />
      )}
    </div>
  );
}
