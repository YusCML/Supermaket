import { useRef, useState, type KeyboardEvent } from 'react';
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
  // Stock batches: picked from in the product details window, and shown as
  // per-batch counts on the product cards. Everyone gets them (till and self-serve).
  batches?: ProductBatch[];
  onCheckout: (payload: CheckoutPayload) => Promise<CheckoutReceipt>;
  // 'self-serve': a customer buying for themselves. The sale always goes on
  //   their own loyalty account, so there's no member lookup at all.
  // 'staff': a cashier or admin at the till. They look the customer up by
  //   name / loyalty ID / phone / email. A member is required to check out.
  mode?: 'self-serve' | 'staff';
}

// Does this member match what was typed in the member box? Phone number,
// loyalty ID (e.g. LOY-000012), email or account ID all work. New customers
// often haven't added a phone number, so the loyalty ID or email is usually
// the way to find them.
function matchesMember(c: Customer, query: string): boolean {
  const lowered = query.toLowerCase();
  return (
    c.phone === query ||
    c.loyalty_id?.toLowerCase() === lowered ||
    c.email?.toLowerCase() === lowered ||
    String(c.id) === query
  );
}

// Does the member contain what's been typed so far? Used for the suggestion
// list under the member box, so partial text is enough: part of a name,
// email, phone number or loyalty ID.
function memberContains(c: Customer, query: string): boolean {
  const lowered = query.toLowerCase();
  return [c.name, c.email, c.phone, c.loyalty_id].some((field) =>
    (field || '').toLowerCase().includes(lowered)
  );
}

// How many suggestions to show under the member box at once.
const MAX_MEMBER_SUGGESTIONS = 6;

export default function POS({ products = [], customers = [], batches = [], onCheckout, mode = 'staff' }: POSProps) {
  const { user } = useAuth();
  const { notify } = useNotify();
  const isSelfServe = mode === 'self-serve';

  // Who the sale goes on when the screen opens (and again after each sale).
  // At self-serve that's always you: everyone who logs in is a loyalty member.
  // At the till it starts empty: the cashier is serving someone else, so they
  // look that customer up. Checkout stays blocked until a member is picked.
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
  // The member suggestion list: whether it's open, and which row the arrow
  // keys have highlighted (-1 = none).
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  // The product whose details window is open (null = closed).
  const [detailsProductId, setDetailsProductId] = useState<number | null>(null);

  // The picked member as the latest data has them. After a sale the store
  // data reloads in the background (the POS stays open to show the receipt),
  // so the copy kept in state would still show their old points balance.
  const currentMember = selectedCustomer
    ? customers.find((c) => c.id === selectedCustomer.id) ?? selectedCustomer
    : null;

  // Stops a double-click on "Complete Transaction" from saving the sale twice.
  // A ref (not state) because it has to flip instantly, before React re-renders.
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

  // --- Basket lines and batches -------------------------------------------------
  // A basket line is one product from one batch, so the same milk can be on
  // two lines (e.g. 2 from batch B-1 and 1 from B-3). Only if a product's
  // batches aren't known (none loaded) is a line just the product, and the
  // database takes the soonest-expiring stock.
  const lineKey = (item: Pick<CartItem, 'id' | 'batch_id'>) => `${item.id}:${item.batch_id ?? 'any'}`;

  // A product's batches that can still be sold, in the order they're sold by
  // default: soonest expiry first, no expiry date last. Same rules as the database.
  const sellableBatchesOf = (productId: number) =>
    sellableBatches(batches.filter((b) => b.product_id === productId));

  // How many units are already in the basket: of a whole product, or from one batch.
  const inCartForProduct = (productId: number) =>
    cart.filter((item) => item.id === productId).reduce((sum, item) => sum + item.quantity, 0);
  const inCartForBatch = (batchId: number) =>
    cart.filter((item) => item.batch_id === batchId).reduce((sum, item) => sum + item.quantity, 0);

  // Puts `quantity` of a product in the basket.
  //   * With a batch (picked in the details window, or the + on a batch line):
  //     only from that batch.
  //   * Without one (a scan): we fill from the soonest-expiring batch, and
  //     carry on into the next batch if that one runs out. If the batches
  //     aren't known, it's one line for the product and the database picks.
  // The stock checks happen out here rather than inside setCart, because React
  // may run that callback twice in development (StrictMode), which would show
  // the message twice.
  const addToCart = (product: ProductInventorySummary, quantity = 1, batch?: ProductBatch) => {
    if (product.stock_quantity <= 0) return notify('Item is out of stock!', 'error');
    if (inCartForProduct(product.id) + quantity > product.stock_quantity) {
      return notify('Cannot exceed available stock!', 'error');
    }

    // Which batch each unit comes from: [{ batch (or null), how many }].
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

  // How many units of this product are near expiry (and so 15% off). Read
  // from the product list so it reflects the latest stock.
  const nearExpiryUnitsOf = (id: number) =>
    products.find((p) => p.id === id)?.near_expiry_count ?? 0;

  // Clicking a product opens its details window (price, expiry, batches) with
  // an Add to basket button. Scanning a barcode still adds straight away.
  const detailsProduct = products.find((p) => p.id === detailsProductId) ?? null;

  const removeFromCart = (key: string) => {
    setCart((prev) => prev.filter((item) => lineKey(item) !== key));
  };

  // How many of this product are on the shelf right now. Read from the product
  // list (not the basket copy) so it reflects the latest stock.
  const stockOf = (id: number) =>
    products.find((p) => p.id === id)?.stock_quantity ?? 0;

  // The batch a basket line comes from (null if it has no batch).
  const batchOfLine = (item: CartItem) =>
    item.batch_id === null ? null : batches.find((b) => b.id === item.batch_id) ?? null;

  // Whether the + on a line can add one more: there must be stock left for the
  // product and, for a batch line, in that batch.
  const canAddOneMore = (item: CartItem) => {
    if (inCartForProduct(item.id) >= stockOf(item.id)) return false;
    const batch = batchOfLine(item);
    return batch ? inCartForBatch(batch.id) < batch.quantity_remaining : true;
  };

  // The + button in the basket: one more from the same batch as that line.
  // Goes through addToCart so the stock checks live in one place.
  const increaseQuantity = (item: CartItem) => {
    const product = products.find((p) => p.id === item.id);
    if (product) addToCart(product, 1, batchOfLine(item) ?? undefined);
  };

  // The − button. Stops at 1; the × button is for taking an item out
  // completely, so a quick double-tap on − can't remove it by accident.
  const decreaseQuantity = (key: string) => {
    setCart((prev) =>
      prev.map((item) =>
        lineKey(item) === key && item.quantity > 1 ? { ...item, quantity: item.quantity - 1 } : item
      )
    );
  };

  // A barcode scanner acts like a keyboard: it types the code into the search
  // box and presses Enter. So on Enter we find the product with that exact
  // barcode (or SKU) and put it straight into the basket, then clear the box
  // so the next item can be scanned right away.
  const handleScan = () => {
    const code = search.trim();
    if (!code) return;

    const lowered = code.toLowerCase();
    const match =
      products.find((p) => p.barcode === code) ||
      products.find((p) => (p.sku || '').toLowerCase() === lowered) ||
      // Typed part of a name and only one product fits? Add that one.
      (filteredProducts.length === 1 ? filteredProducts[0] : undefined);

    if (!match) {
      // Only speak up when it looks like a scanned code. For a name search the
      // grid already shows what matched.
      if (/^\d+$/.test(code)) notify(`No product found with barcode ${code}`, 'error');
      return;
    }

    addToCart(match);
    setSearch('');
  };

  // Suggestions only make sense while someone is still searching. Once the box
  // holds the member we've already picked, there's nothing left to suggest.
  const lookupText = phoneSearch.trim();
  const isSearchingMember =
    lookupText !== '' && !(selectedCustomer && matchesMember(selectedCustomer, lookupText));
  const memberSuggestions = isSearchingMember
    ? customers.filter((c) => memberContains(c, lookupText)).slice(0, MAX_MEMBER_SUGGESTIONS)
    : [];
  const suggestionsOpen = showSuggestions && isSearchingMember;

  // Clearing the member box un-picks the member (and any points typed in), so
  // checkout is blocked again until someone is looked up.
  const handleMemberInput = (value: string) => {
    setPhoneSearch(value);
    setShowSuggestions(true);
    setHighlighted(-1);
    if (!value.trim()) {
      setSelectedCustomer(null);
      setPointsToRedeem(0);
    }
  };

  // Picks a member, from the suggestion list or an exact lookup. The box is
  // filled with their loyalty ID (or email), which is what the checkout checks
  // to make sure the points go to the right person.
  const selectMember = (cust: Customer) => {
    setSelectedCustomer(cust);
    setPhoneSearch(cust.loyalty_id || cust.email || String(cust.id));
    // Points typed in for the previous member shouldn't carry over.
    setPointsToRedeem(0);
    setShowSuggestions(false);
    setHighlighted(-1);
  };

  const findCustomer = () => {
    if (!lookupText) return;
    // An exact phone / loyalty ID / email first: that's what a scanned loyalty
    // card gives us. Otherwise, if what was typed only fits one member, take them.
    const cust =
      customers.find((c) => matchesMember(c, lookupText)) ??
      (memberSuggestions.length === 1 ? memberSuggestions[0] : undefined);

    if (cust) {
      selectMember(cust);
    } else if (memberSuggestions.length > 1) {
      // Several people fit (e.g. two "Bryan"s). Let the cashier pick from the list.
      setShowSuggestions(true);
    } else {
      notify('Customer not found!', 'error');
    }
  };

  // Keyboard for the member box: ↑/↓ move through the suggestions, Enter picks
  // the highlighted one (or does a normal lookup), Esc closes the list.
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

  // --- Bill math -------------------------------------------------------------
  // This is only a preview for the cashier. The database recalculates all of
  // it from the real prices when the sale is saved.
  //
  // Each line is priced with the near-expiry markdown:
  //   * a batch line is all 15% off if that batch is near expiry, otherwise
  //     all full price;
  //   * a line without a batch has its soonest-expiring units 15% off
  //     (they're sold first), the rest full price.
  const priceOfLine = (item: CartItem) =>
    item.batch_id !== null
      ? priceLine(item.price || 0, item.quantity, isNearExpiry(item.batch_expiry) ? item.quantity : 0)
      : priceLine(item.price || 0, item.quantity, nearExpiryUnitsOf(item.id));
  const linePrices = new Map(cart.map((item) => [lineKey(item), priceOfLine(item)]));
  const lineTotalOf = (item: CartItem) => linePrices.get(lineKey(item))?.total ?? 0;
  const markedDownQtyOf = (item: CartItem) => linePrices.get(lineKey(item))?.markedDownQty ?? 0;

  // Before any discounts, what the near-expiry markdown takes off, and what's
  // left (the bill that points can then be used on).
  const fullPriceTotal = roundToCentavos(
    cart.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0)
  );
  const nearExpirySavings = roundToCentavos(
    cart.reduce((sum, item) => sum + (linePrices.get(lineKey(item))?.savings ?? 0), 0)
  );
  const total = roundToCentavos(fullPriceTotal - nearExpirySavings);

  // The member can't use more points than they have, or more than the bill
  // needs. Clamping here (not only when typing) also covers the case where
  // the cashier removes items after entering points.
  const redeemablePoints = maxRedeemablePoints(currentMember?.loyalty_points ?? 0, total);
  const pointsApplied = Math.min(pointsToRedeem, redeemablePoints);
  const discount = discountForPoints(pointsApplied, total);
  const finalTotal = roundToCentavos(total - discount);

  // Whatever gets typed in the points box: whole numbers only, never below 0,
  // never above what the member can actually use on this bill.
  const handlePointsChange = (value: string) => {
    const points = Math.floor(Number(value) || 0);
    setPointsToRedeem(Math.max(0, Math.min(points, redeemablePoints)));
  };

  const handleCheckoutSubmit = async () => {
    if (isSubmitting.current) return;
    if (cart.length === 0) return notify('Cart is empty!', 'error');

    // Self-serve sales must go on your own account (the database insists). If
    // your loyalty profile didn't load, say so instead of a confusing error.
    if (isSelfServe && !selectedCustomer) {
      return notify("We couldn't load your loyalty account. Please sign out and sign back in.", 'error');
    }

    // Whoever's ID is in the member box is who gets the points. If the cashier
    // typed a different ID but never pressed Lookup, catch it here so the
    // points don't land on the wrong account. We switch to that member and
    // stop, so the cashier can check the total (their points may differ).
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

    // Every sale has to go on a loyalty account, so no member = no checkout.
    // The cashier looks the customer up first (or signs them up). The database
    // refuses a sale without a member too; this just says so straight away.
    if (!selectedCustomer) {
      return notify('Look up a member (name or loyalty ID) before checking out.', 'error');
    }

    // "Loyalty Points" as the payment method means the whole bill is paid
    // with points, so there have to be enough points to bring it to ₱0.
    // The database checks this too. Catching it here just saves a round trip.
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
      // Back to the start for the next sale: your own account at self-serve,
      // an empty member box at the till.
      setSelectedCustomer(startingMember);
      setPointsToRedeem(0);
      setPhoneSearch('');
      setCashReceivedInput('');
    } catch (err) {
      // Messages like "Not enough stock for ..." come straight from the database.
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
                  className="flex flex-col justify-between rounded-xl border border-gray-200/80 bg-[#FFFFFF] p-3.5 shadow-2xs hover:border-[#2E7D32]/50 hover:bg-[#2E7D32]/5 transition-all cursor-pointer space-y-2 group"
                  onClick={() => setDetailsProductId(p.id)}
                >
                  <div>
                    <h4 className="text-xs font-bold text-[#333333] group-hover:text-[#2E7D32] transition-colors line-clamp-1">
                      {p.name}
                    </h4>
                    <div className="font-mono text-[10px] text-[#333333]/60">{p.barcode}</div>
                  </div>

                  <div className="space-y-1">
                    {p.near_expiry_count > 0 ? (
                      <p className="text-xs">
                        <span className="line-through text-[#333333]/50 mr-1.5">
                          ₱{(p.price || 0).toFixed(2)}
                        </span>
                        <strong className="font-extrabold text-[#2E7D32]">
                          ₱{markedDownPrice(p.price || 0).toFixed(2)}
                        </strong>
                      </p>
                    ) : (
                      <p className="text-xs font-bold text-[#333333]">₱{(p.price || 0).toFixed(2)}</p>
                    )}
                    <small className="block text-[10px] text-[#333333]/70 font-medium">
                      Stock: {p.stock_quantity}
                    </small>
                    <BatchBreakdown batches={sellableBatchesOf(p.id)} />
                    {p.near_expiry_count > 0 && (
                      <div className="pt-1">
                        <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-800 border border-amber-200">
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
                    👤 <strong className="font-bold">{currentMember.name}</strong>
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
                          className="h-5 w-5 rounded-md border border-gray-300 bg-[#FFFFFF] text-xs font-bold text-[#333333] hover:bg-gray-100 disabled:opacity-30 transition-colors flex items-center justify-center"
                          onClick={() => decreaseQuantity(lineKey(item))}
                          disabled={item.quantity <= 1}
                          aria-label={`One less ${item.name}`}
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-xs font-bold text-[#333333]">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          className="h-5 w-5 rounded-md border border-gray-300 bg-[#FFFFFF] text-xs font-bold text-[#333333] hover:bg-gray-100 disabled:opacity-30 transition-colors flex items-center justify-center"
                          onClick={() => increaseQuantity(item)}
                          disabled={!canAddOneMore(item)}
                          aria-label={`One more ${item.name}`}
                        >
                          +
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
                          className="text-xs font-bold text-red-500 hover:text-red-700 px-1"
                          onClick={() => removeFromCart(lineKey(item))}
                        >
                          ×
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