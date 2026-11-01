import { useRef, useState, type KeyboardEvent } from 'react';
import { Minus, Plus, X, ImageIcon } from 'lucide-react';
import type { ProductInventorySummary, ProductBatch, Customer, CartItem, CheckoutPayload, CheckoutReceipt } from '../types/app';
import { discountForPoints, maxRedeemablePoints, roundToCentavos } from '../lib/loyalty';
import { markedDownPrice, NEAR_EXPIRY_PERCENT_OFF, priceLine } from '../lib/pricing';
import { formatExpiry, isNearExpiry, sellableBatches } from '../lib/expiry';
import { useAuth } from '../contexts/AuthContext';
import { useNotify } from '../contexts/NotifyContext';
import ProductDetails from './ProductDetails';
import BatchBreakdown from './BatchBreakdown';
import Receipt from './Receipt';

interface POSProps {
  products: ProductInventorySummary[];
  customers: Customer[];
  batches?: ProductBatch[];
  onCheckout: (payload: CheckoutPayload) => Promise<CheckoutReceipt>;
  mode?: 'self-serve' | 'staff';
}

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
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card' | 'Loyalty Points'>('Cash');
  const [cashReceivedInput, setCashReceivedInput] = useState('');
  const [receipt, setReceipt] = useState<CheckoutReceipt | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [detailsProductId, setDetailsProductId] = useState<number | null>(null);

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
      (p.sku || '').toLowerCase().includes(q)
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
    }
  };

  const inputStyle =
    'w-full rounded-xl border border-gray-300 bg-[#FFFFFF] px-3.5 py-2 text-xs text-[#333333] placeholder-[#333333]/40 outline-none transition-all focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20 shadow-2xs';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[calc(100vh-6rem)] font-sans antialiased text-[#333333] selection:bg-[#2E7D32]/15 selection:text-[#2E7D32]">
      {/* Left Column: Items Lookup & Product Catalog */}
      <div className="lg:col-span-7 xl:col-span-8 flex flex-col space-y-4">
        <div className="rounded-2xl border border-gray-200/80 bg-[#FFFFFF] p-5 shadow-2xs space-y-4 flex-1 flex flex-col">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight text-[#333333]">Items Lookup</h2>
          </div>

          <input
            type="text"
            placeholder="Scan barcode, SKU, or search product name..."
            className={inputStyle}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleScan();
            }}
            autoComplete="off"
            spellCheck={false}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 flex-1 overflow-y-auto max-h-[650px] pr-1">
            {filteredProducts.length === 0 ? (
              <p className="col-span-full py-12 text-center text-xs font-semibold text-[#333333]/50">
                No products found
              </p>
            ) : (
              filteredProducts.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col rounded-xl border border-gray-200/80 bg-[#FFFFFF] p-3.5 shadow-2xs hover:border-[#2E7D32]/50 hover:bg-[#2E7D32]/5 transition-all cursor-pointer group"
                  onClick={() => setDetailsProductId(p.id)}
                >
                  {/* Image Section */}
                  <div className="w-full h-32 bg-[#F5F5F5] rounded-lg overflow-hidden flex items-center justify-center shrink-0 mb-3">
                    {p.image_url ? (
                      <img 
                        src={p.image_url} 
                        alt={p.name} 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <ImageIcon className="size-8 text-[#333333]/20" />
                    )}
                  </div>

                  {/* Text Section - hardcoded to show below image */}
                  <div className="flex flex-col space-y-1">
                    <h4 className="text-sm font-bold text-[#333333] group-hover:text-[#2E7D32] transition-colors line-clamp-2">
                      {p.name}
                    </h4>
                    <div className="font-mono text-[10px] text-[#333333]/60">
                      {p.barcode}
                    </div>
                    
                    {p.near_expiry_count > 0 ? (
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="line-through text-xs text-[#333333]/50">
                          ₱{(p.price || 0).toFixed(2)}
                        </span>
                        <strong className="text-sm font-extrabold text-[#2E7D32]">
                          ₱{markedDownPrice(p.price || 0).toFixed(2)}
                        </strong>
                      </div>
                    ) : (
                      <div className="text-sm font-bold text-[#333333] mt-1">
                        ₱{(p.price || 0).toFixed(2)}
                      </div>
                    )}
                    
                    <small className="block text-[10px] text-[#333333]/70 font-medium">
                      Stock: {p.stock_quantity}
                    </small>
                    
                    <BatchBreakdown batches={sellableBatchesOf(p.id)} />
                    
                    {p.near_expiry_count > 0 && (
                      <div className="pt-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-amber-800">
                          {NEAR_EXPIRY_PERCENT_OFF}% off · {p.near_expiry_count} expiring soon
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Member Panel & Active Cart */}
      <div className="lg:col-span-5 xl:col-span-4 flex flex-col space-y-4">
        <div className="rounded-2xl border border-gray-200/80 bg-[#FFFFFF] p-5 shadow-2xs space-y-4 flex-1 flex flex-col justify-between">
          <div className="space-y-4">
            <h2 className="text-xl font-bold tracking-tight text-[#333333]">Active Basket</h2>

            {/* Member Search / Selection */}
            {!isSelfServe && (
              <div className="rounded-xl border border-gray-200 bg-[#F5F5F5] p-3 space-y-2">
                <div className="relative">
                  <input
                    placeholder="Search member or scan loyalty card"
                    className={inputStyle}
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
                      className="absolute left-0 right-0 z-30 mt-1 max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-[#FFFFFF] py-1 shadow-lg divide-y divide-gray-100"
                      id="member-suggestions"
                      role="listbox"
                    >
                      {memberSuggestions.length === 0 ? (
                        <li className="px-3 py-2 text-center text-xs text-[#333333]/50">
                          No members match
                        </li>
                      ) : (
                        memberSuggestions.map((c, index) => (
                          <li
                            key={c.id}
                            role="option"
                            aria-selected={index === highlighted}
                            className={`px-3 py-2 text-xs transition-colors cursor-pointer ${
                              index === highlighted ? 'bg-[#2E7D32]/10 text-[#2E7D32]' : 'hover:bg-gray-50'
                            }`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              selectMember(c);
                            }}
                            onMouseEnter={() => setHighlighted(index)}
                          >
                            <strong className="block font-semibold text-[#333333]">
                              {c.name || c.email}
                            </strong>
                            <small className="block text-[10px] text-[#333333]/60">
                              {[c.loyalty_id, c.phone, c.name !== c.email ? c.email : null]
                                .filter(Boolean)
                                .join(' · ')}
                              {' · '}{c.loyalty_points ?? 0} pts
                            </small>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>
                <button
                  type="button"
                  onClick={findCustomer}
                  className="w-full rounded-lg border border-gray-300 bg-[#FFFFFF] py-1.5 text-xs font-semibold text-[#333333] shadow-2xs hover:bg-gray-100 transition-colors"
                >
                  Lookup Member
                </button>
              </div>
            )}

            {/* Selected Member Loyalty Panel */}
            {currentMember && (
              <div className="rounded-xl border border-[#2E7D32]/20 bg-[#2E7D32]/5 p-3 text-xs space-y-2">
                <div className="flex items-center justify-between text-[#333333]">
                  <span>
                    <strong className="font-bold">{currentMember.name}</strong>
                  </span>
                  <span className="font-semibold text-[#2E7D32]">
                    Points: {currentMember.loyalty_points ?? 0}
                  </span>
                </div>
                {(currentMember.loyalty_points ?? 0) > 0 && (
                  <div className="flex items-center justify-between gap-2 border-t border-[#2E7D32]/15 pt-2">
                    <label className="text-[11px] font-medium text-[#333333]/80">
                      Redeem Points (₱1/pt):
                    </label>
                    <input
                      type="number"
                      max={redeemablePoints}
                      min="0"
                      value={pointsApplied}
                      onChange={(e) => handlePointsChange(e.target.value)}
                      autoComplete="off"
                      className="w-20 rounded-lg border border-gray-300 bg-[#FFFFFF] px-2 py-1 text-right text-xs font-bold text-[#2E7D32] outline-none focus:border-[#2E7D32]"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Cart Line Items */}
            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1 divide-y divide-gray-100">
              {cart.length === 0 ? (
                <p className="py-8 text-center text-xs font-semibold text-[#333333]/40">
                  Basket is empty
                </p>
              ) : (
                cart.map((item) => (
                  <div key={lineKey(item)} className="pt-2.5 first:pt-0 flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <strong className="block text-xs font-bold text-[#333333]">{item.name}</strong>
                      {item.batch_code && (
                        <div className="text-[10px] font-mono text-[#333333]/60">
                          Batch {item.batch_code} · {formatExpiry(item.batch_expiry)}
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="h-6 w-6 rounded-md border border-gray-300 bg-[#FFFFFF] text-[#333333] hover:bg-gray-100 disabled:opacity-30 transition-colors flex items-center justify-center"
                          onClick={() => decreaseQuantity(lineKey(item))}
                          disabled={item.quantity <= 1}
                          aria-label={`One less ${item.name}`}
                        >
                          <Minus className="size-3.5" />
                        </button>
                        <span className="w-6 text-center text-xs font-bold text-[#333333]">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          className="h-6 w-6 rounded-md border border-gray-300 bg-[#FFFFFF] text-[#333333] hover:bg-gray-100 disabled:opacity-30 transition-colors flex items-center justify-center"
                          onClick={() => increaseQuantity(item)}
                          disabled={!canAddOneMore(item)}
                          aria-label={`One more ${item.name}`}
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="text-right space-y-1">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="text-xs font-bold text-[#333333]">
                          ₱{lineTotalOf(item).toFixed(2)}
                        </span>
                        <button
                          type="button"
                          className="text-[#333333]/50 hover:text-red-600 px-1 transition-colors"
                          onClick={() => removeFromCart(lineKey(item))}
                          aria-label={`Remove ${item.name}`}
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                      {markedDownQtyOf(item) > 0 && (
                        <div className="text-[9px] font-medium text-amber-700">
                          {markedDownQtyOf(item)} × ₱{markedDownPrice(item.price || 0).toFixed(2)}{' '}
                          ({NEAR_EXPIRY_PERCENT_OFF}% off)
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Checkout Totals & Payment Controls */}
          <div className="space-y-3 border-t border-gray-200 pt-4 mt-auto">
            <div className="space-y-1 text-xs text-[#333333]/80">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-semibold text-[#333333]">₱{fullPriceTotal.toFixed(2)}</span>
              </div>
              
              {nearExpirySavings > 0 && (
                <div className="flex justify-between text-amber-700 font-medium">
                  <span>Near-expiry {NEAR_EXPIRY_PERCENT_OFF}% off</span>
                  <span>-₱{nearExpirySavings.toFixed(2)}</span>
                </div>
              )}
              
              <div className="flex justify-between text-[#2E7D32] font-medium">
                <span>Points discount</span>
                <span>-₱{discount.toFixed(2)}</span>
              </div>
              
              <div className="flex justify-between text-base font-extrabold text-[#333333] pt-1">
                <span>Total</span>
                <span className="text-[#2E7D32]">₱{finalTotal.toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <select
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value as 'Cash' | 'Card' | 'Loyalty Points')
                }
                className={inputStyle}
              >
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="Loyalty Points">Loyalty Points</option>
              </select>

              {paymentMethod === 'Cash' && (
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#333333]/60">
                    Cash received
                  </label>
                  <input
                    type="number"
                    min={finalTotal}
                    step="0.01"
                    value={cashReceivedInput}
                    onChange={(e) => setCashReceivedInput(e.target.value)}
                    autoComplete="off"
                    className={inputStyle}
                    required
                  />
                </div>
              )}

              <button
                type="button"
                className="w-full rounded-xl bg-[#2E7D32] py-3 text-xs font-bold text-[#FFFFFF] shadow-xs hover:bg-[#246628] transition-colors cursor-pointer"
                onClick={handleCheckoutSubmit}
              >
                Complete Transaction
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
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