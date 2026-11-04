// POS.tsx: the checkout screen ("Point Of Sale").
//
// Used by three pages, all with the same data from useStoreData():
//   AdminPage and CashierPage  mode="staff"       a cashier rings up any member
//   SelfServePage              mode="self-serve"  a customer buys for themselves
//
// Layout: on the left, <ProductMenu> (search/scan + products by category);
// on the right, the basket, the member, the totals and the payment buttons.
// Two pop-ups: <ProductDetails> (pick a batch and a quantity) and <Receipt>.
//
// The checkout flow in short:
//   1. Products go into the basket ("cart") through addToCart, which also
//      decides which batch each unit comes from (soonest expiry first).
//   2. A member is chosen (staff) or is the signed-in customer (self-serve).
//      Every sale must go on a member's loyalty account.
//   3. Line prices, the near-expiry 15% markdown and the points discount are
//      worked out here, but only as a PREVIEW (lib/pricing.ts, lib/loyalty.ts).
//   4. "Complete Transaction" -> handleCheckoutSubmit -> onCheckout (a prop:
//      useStoreData's handleCheckout) -> api.processCheckout -> the database
//      function process_pos_checkout. The database re-checks and re-prices
//      everything and saves the sale all-or-nothing (see handleCheckoutSubmit).
//   5. The database sends back the receipt, which is shown in <Receipt>.
//
// React words used below:
//   props    = the inputs a parent passes to a component (see POSProps).
//   useState = a value React remembers between redraws. `const [x, setX] =
//              useState(start)` gives the current value and a setter; calling
//              the setter redraws the screen with the new value.
//   useRef   = a box ({ current: … }) React remembers between redraws.
//              Changing .current does NOT redraw the screen.
// Everything else in the component body (filteredProducts, total, …) is
// worked out again from the state on every redraw, so it's never out of date.
import { useRef, useState, type KeyboardEvent } from 'react';
import { Banknote, CreditCard, LoaderCircle, Minus, Plus, ShoppingBasket, Star, X } from 'lucide-react';
import type { ProductInventorySummary, ProductBatch, Customer, CartItem, CheckoutPayload, CheckoutReceipt } from '../types/app';
import { discountForPoints, maxRedeemablePoints, PESO_VALUE_PER_POINT, pointsToCover, roundToCentavos } from '../lib/loyalty';
import { cardAmountSchema, cashReceivedSchema, normalizePhone } from '../lib/validation';
import { SaleSavedWithoutReceiptError } from '../lib/api';
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
  // Every product with its stock, near-expiry count and earliest expiry
  // (useStoreData's posProducts, built from get_product_inventory).
  products: ProductInventorySummary[];
  // The loyalty members to search. For a plain customer (no staff role) the
  // database only returns their own row, so at self-serve it's just them.
  customers: Customer[];
  // Every product's batches. Used to choose which batch each unit is sold
  // from and to price near-expiry units. Optional: defaults to [].
  batches?: ProductBatch[];
  // Saves the sale. Resolves with the receipt, or throws an Error whose
  // message is shown to the cashier.
  onCheckout: (payload: CheckoutPayload) => Promise<CheckoutReceipt>;
  // 'staff' (default) shows the member search; 'self-serve' uses the
  // signed-in customer as the member.
  mode?: 'self-serve' | 'staff';
}

// How the customer pays whatever is left after points: Cash or Card.
// Loyalty points aren't a payment button: they're a discount that works with
// either one (the "Use points" box on the member card takes ₱5 off per point).
// The database accepts a third method, 'Loyalty Points'; we send that
// automatically when points cover the WHOLE bill (see checkoutMethod below).
type PaymentMethod = 'Cash' | 'Card';

// The payment buttons under the total. `value` is what gets saved with the
// order; `label` is the text shown on the button.
// `icon: typeof Banknote` means "the same type as the Banknote icon", i.e.
// any lucide-react icon component.
const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { value: 'Cash', label: 'Cash', icon: Banknote },
  { value: 'Card', label: 'Card', icon: CreditCard },
];

// EXACT match: is `query` this member's phone, loyalty ID, email or user id?
// (Loyalty ID and email ignore capitals.) Used to decide that the text in the
// member box really means one particular member.
function matchesMember(c: Customer, query: string): boolean {
  const lowered = query.toLowerCase();
  return (
    // Phones compare in their stored form, so "0917 123 4567" and
    // "+639171234567" both find 09171234567 (normalizePhone, lib/validation.ts).
    (!!c.phone && c.phone === normalizePhone(query)) ||
    c.loyalty_id?.toLowerCase() === lowered ||
    c.email?.toLowerCase() === lowered ||
    String(c.id) === query
  );
}

// PARTIAL match: does the member's name, email, phone or loyalty ID contain
// `query` anywhere (ignoring capitals)? Used for the suggestion list while
// typing. `|| ''` turns a missing field into empty text so .toLowerCase()
// can't crash.
function memberContains(c: Customer, query: string): boolean {
  const lowered = query.toLowerCase();
  // The phone is also compared without spaces/dashes ("0917 123" finds 0917123…).
  const phoneQuery = normalizePhone(query);
  return (
    [c.name, c.email, c.phone, c.loyalty_id].some((field) => (field || '').toLowerCase().includes(lowered)) ||
    (!!c.phone && phoneQuery !== '' && c.phone.includes(phoneQuery))
  );
}

// At most this many members are suggested under the member box.
const MAX_MEMBER_SUGGESTIONS = 6;

// Money is always shown with 2 decimals, e.g. ₱12.50.
const peso = (amount: number) => `₱${amount.toFixed(2)}`;

// The checkout screen. The `= []` and `= 'staff'` in the brackets are
// default values, used when a prop isn't passed.
export default function POS({ products = [], customers = [], batches = [], onCheckout, mode = 'staff' }: POSProps) {
  // Who is signed in (from AuthContext), and notify() for the pop-up messages
  // (from NotifyContext). "Context" = data shared by the whole app.
  const { user } = useAuth();
  const { notify } = useNotify();
  const isSelfServe = mode === 'self-serve';

  // The signed-in person's own loyalty account. At self-serve that's always
  // the member; for staff the basket starts with no member.
  const me = customers.find((c) => c.id === user?.id) ?? null;
  const startingMember = isSelfServe ? me : null;

  // ── State: what this screen remembers ────────────────────────────────────
  // Text in the product search/scan box. Filters the menu, and on Enter
  // (handleScan) is matched against barcodes and SKUs.
  const [search, setSearch] = useState('');
  // The basket. One CartItem per line: a copy of the product's fields
  // (id, name, price…) plus `quantity` and which batch the units come from
  // (batch_id / batch_code / batch_expiry, all null if no batch). The same
  // product can be on two lines when its units come from two batches; a line
  // is identified by product id + batch id (see lineKey).
  const [cart, setCart] = useState<CartItem[]>([]);
  // Text typed in the member box (name, loyalty ID, phone or email).
  // Despite its name it can hold any of those, not only a phone number.
  const [phoneSearch, setPhoneSearch] = useState('');
  // The member chosen for this sale (null = none yet). Starts as the
  // signed-in customer at self-serve. (useState only uses its starting value
  // on the very first draw; after that, only setSelectedCustomer changes it.)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(startingMember);
  // Points to use on this sale, set by the "Use points…" / "Pay all with
  // points" buttons in the payment area. The amount actually used is
  // pointsApplied below, which also respects the member's balance and the bill.
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  // Which payment button is selected.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  // The amount box under the payment buttons: the cash handed over (Cash), or
  // the amount to charge on the card (Card). Kept as the text typed; it's only
  // turned into a number (and checked) at checkout, so half-typed amounts
  // like "12." are fine.
  const [amountInput, setAmountInput] = useState('');
  // The receipt from the last completed sale. While it's set, the Receipt
  // pop-up is shown; closing it sets this back to null.
  const [receipt, setReceipt] = useState<CheckoutReceipt | null>(null);
  // Whether the member suggestion list should be open (it opens on typing or
  // focus, and closes on Escape, on leaving the box, or after a pick).
  const [showSuggestions, setShowSuggestions] = useState(false);
  // Which suggestion the arrow keys are on (-1 = none), so Enter can pick it.
  const [highlighted, setHighlighted] = useState(-1);
  // The product whose details pop-up is open (null = closed).
  const [detailsProductId, setDetailsProductId] = useState<number | null>(null);
  // True while the sale is being saved, so the button can say "Processing…".
  // (isSubmitting below is the instant double-click guard; this one is just
  // for what's shown on screen.)
  const [submitting, setSubmitting] = useState(false);

  // selectedCustomer is a snapshot taken when the member was picked. After a
  // sale the page reloads `customers` with new points balances, so we look
  // the member up again by id to always show (and use) the latest balance.
  const currentMember = selectedCustomer
    ? customers.find((c) => c.id === selectedCustomer.id) ?? selectedCustomer
    : null;

  // The double-submit guard. Why a ref AND the `submitting` state?
  // A state change only shows up on the NEXT draw, so two very quick clicks
  // could both still see submitting === false and send the sale twice.
  // A ref's .current changes immediately, so the second click sees `true`
  // straight away and stops. The state is still needed for the screen
  // (spinner, disabled button), because changing a ref doesn't redraw.
  const isSubmitting = useRef(false);

  // The products to show in the menu: all of them, or those whose name,
  // brand, barcode, SKU, category or description contains the search text.
  const filteredProducts = products.filter((p) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (p.name || '').toLowerCase().includes(q) ||
      (p.brand || '').toLowerCase().includes(q) ||
      (p.barcode || '').toLowerCase().includes(q) ||
      (p.sku || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q)
    );
  });

  // ── The basket ────────────────────────────────────────────────────────────
  // A basket line's name tag: product id + batch id, e.g. "7:12", or "7:any"
  // when no batch is set. Two lines never share a key, so the key finds the
  // line to change, and React uses it as the list key when drawing the basket.
  // (Pick<CartItem, 'id' | 'batch_id'> = "any object with at least these two
  // fields of a CartItem".)
  const lineKey = (item: Pick<CartItem, 'id' | 'batch_id'>) => `${item.id}:${item.batch_id ?? 'any'}`;

  // A product's batches that can still be sold, soonest expiry first
  // (sellableBatches in lib/expiry.ts: active, units left, not expired).
  const sellableBatchesOf = (productId: number) =>
    sellableBatches(batches.filter((b) => b.product_id === productId));

  // How many units of a product / of one batch are already in the basket,
  // across all lines. reduce() walks the list carrying a running total
  // (`sum`), starting from 0.
  const inCartForProduct = (productId: number) =>
    cart.filter((item) => item.id === productId).reduce((sum, item) => sum + item.quantity, 0);
  const inCartForBatch = (batchId: number) =>
    cart.filter((item) => item.batch_id === batchId).reduce((sum, item) => sum + item.quantity, 0);

  // Puts `quantity` units of a product into the basket. Called by a barcode
  // scan, the menu's quick "+", the basket's "+" and ProductDetails' "Add".
  //   batch given    -> all units come from that batch (the customer or
  //                     cashier picked it, or it's the "+" on an existing line).
  //   no batch given -> units are taken from the product's sellable batches,
  //                     SOONEST EXPIRY FIRST, skipping units already in the
  //                     basket. Same rule the database uses ("first expired,
  //                     first out"), so older stock sells before it spoils.
  // Each "portion" below is "this many units from this batch"; e.g. adding 5
  // when batch B-1 has 3 free and B-2 has 10 gives [B-1 × 3, B-2 × 2], which
  // become (or add to) two basket lines.
  // If `batches` has no sellable batch for the product (e.g. the batch list
  // didn't load), it gets one line with batch null, and the database picks
  // the batches itself when the sale is saved (and refuses the sale if there
  // isn't enough unexpired stock).
  // `return notify(...)` shows the message AND stops the function there.
  const addToCart = (product: ProductInventorySummary, quantity = 1, batch?: ProductBatch) => {
    // First, the product's overall stock limit.
    if (product.stock_quantity <= 0) return notify('Item is out of stock!', 'error');
    if (inCartForProduct(product.id) + quantity > product.stock_quantity) {
      return notify('Cannot exceed available stock!', 'error');
    }

    const portions: { batch: ProductBatch | null; quantity: number }[] = [];
    const productBatches = sellableBatchesOf(product.id);

    if (batch) {
      // A chosen batch: it must have enough units not already in the basket.
      const free = batch.quantity_remaining - inCartForBatch(batch.id);
      if (quantity > free) return notify(`Batch ${batch.batch_code} only has ${free} left.`, 'error');
      portions.push({ batch, quantity });
    } else if (productBatches.length > 0) {
      // No batch chosen: walk the batches in selling order, taking what's
      // free from each until we have enough.
      let left = quantity;
      for (const b of productBatches) {
        const take = Math.min(left, b.quantity_remaining - inCartForBatch(b.id));
        if (take > 0) {
          portions.push({ batch: b, quantity: take });
          left -= take;
        }
        if (left === 0) break;
      }
      // The batches ran out before we had enough (the rest may be expired).
      if (left > 0) return notify('Not enough unexpired stock left for this product.', 'error');
    } else {
      portions.push({ batch: null, quantity });
    }

    // setCart with a function: React hands us the latest basket (`prev`) and
    // we return the new one. We never change `prev` itself; we build new
    // arrays/objects instead, because React only notices a NEW value.
    // For each portion: if a line with the same product + batch is already
    // there, raise its quantity; otherwise add a new line that copies the
    // product's fields ({ ...product }) and adds the quantity and batch details.
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

  // How many units of a product expire within 7 days (all its batches
  // together). Only needed to price lines that have no batch (priceOfLine).
  const nearExpiryUnitsOf = (id: number) =>
    products.find((p) => p.id === id)?.near_expiry_count ?? 0;

  // The product shown in the details pop-up, looked up fresh from `products`
  // (null = pop-up closed).
  const detailsProduct = products.find((p) => p.id === detailsProductId) ?? null;

  // The basket's × button: drop the whole line.
  const removeFromCart = (key: string) => {
    setCart((prev) => prev.filter((item) => lineKey(item) !== key));
  };

  // A product's current stock number.
  const stockOf = (id: number) =>
    products.find((p) => p.id === id)?.stock_quantity ?? 0;

  // The batch a basket line is sold from (null if the line has no batch).
  const batchOfLine = (item: CartItem) =>
    item.batch_id === null ? null : batches.find((b) => b.id === item.batch_id) ?? null;

  // Should a line's "+" button be clickable? Only if the product has stock
  // left that isn't in the basket, and (for a line with a batch) that batch
  // has units left that aren't in the basket.
  const canAddOneMore = (item: CartItem) => {
    if (inCartForProduct(item.id) >= stockOf(item.id)) return false;
    const batch = batchOfLine(item);
    return batch ? inCartForBatch(batch.id) < batch.quantity_remaining : true;
  };

  // A line's "+": add one more from the SAME batch, through addToCart so all
  // the stock checks run again.
  const increaseQuantity = (item: CartItem) => {
    const product = products.find((p) => p.id === item.id);
    if (product) addToCart(product, 1, batchOfLine(item) ?? undefined);
  };

  // A line's "−": one fewer, but never below 1 (use × to remove the line).
  const decreaseQuantity = (key: string) => {
    setCart((prev) =>
      prev.map((item) =>
        lineKey(item) === key && item.quantity > 1 ? { ...item, quantity: item.quantity - 1 } : item
      )
    );
  };

  // Enter in the search box (a barcode scanner types the code and presses
  // Enter). Looks for, in this order: an exact barcode, an exact SKU (any
  // capitals), or the only product left after filtering. If found, one is
  // added (batch picked automatically) and the box is cleared for the next
  // scan. If not, an error appears only when the text is all digits (so it
  // looked like a barcode); otherwise the text just stays as a search.
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

  // ── The member ───────────────────────────────────────────────────────────
  const lookupText = phoneSearch.trim();
  // True while the box holds text that ISN'T the chosen member (after
  // picking someone, the box shows their loyalty ID, which matches them, so
  // the suggestions stop).
  const isSearchingMember =
    lookupText !== '' && !(selectedCustomer && matchesMember(selectedCustomer, lookupText));
  // Up to 6 members whose details contain the typed text.
  const memberSuggestions = isSearchingMember
    ? customers.filter((c) => memberContains(c, lookupText)).slice(0, MAX_MEMBER_SUGGESTIONS)
    : [];
  // The list is drawn only when it's wanted AND there's a search going on.
  const suggestionsOpen = showSuggestions && isSearchingMember;

  // Typing in the member box. Opens the suggestions and clears the arrow-key
  // highlight. Emptying the box also clears the member and their points.
  // (Typing something else does NOT clear the member straight away;
  // handleCheckoutSubmit catches that case.)
  const handleMemberInput = (value: string) => {
    setPhoneSearch(value);
    setShowSuggestions(true);
    setHighlighted(-1);
    if (!value.trim()) {
      setSelectedCustomer(null);
      setPointsToRedeem(0);
    }
  };

  // Makes `cust` the member for this sale. The box then shows their loyalty
  // ID (or email, or id). Points go back to 0 because a points amount chosen
  // for the previous member means nothing for this one.
  const selectMember = (cust: Customer) => {
    setSelectedCustomer(cust);
    setPhoneSearch(cust.loyalty_id || cust.email || String(cust.id));
    setPointsToRedeem(0);
    setShowSuggestions(false);
    setHighlighted(-1);
  };

  // The "Look up" button (and Enter with nothing highlighted). Picks an exact
  // match first, or the only suggestion if there's just one. Several
  // possible members -> show the list so the cashier can choose. None ->
  // error message.
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

  // Keyboard control of the member box:
  //   ↓ / ↑   move the highlight through the suggestions (wrapping round
  //           from the last to the first and back)
  //   Escape  close the list
  //   Enter   pick the highlighted member, or else run the lookup
  // e.preventDefault() stops the arrow keys from also moving the text cursor.
  // setHighlighted((i) => …) passes a function so React gives us the latest
  // value of `highlighted` to work from.
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

  // ── Prices and totals (a preview; the database re-prices everything) ──────
  // What one basket line costs. priceLine(price, quantity, nearExpiryUnits)
  // in lib/pricing.ts says how many of the line's units get the 15% markdown
  // and returns { markedDownQty, fullPriceQty, total, savings }.
  //   Line WITH a batch: the whole line is marked down if that batch expires
  //     within 7 days (isNearExpiry), otherwise none of it is.
  //   Line WITHOUT a batch: the database will sell soonest-expiry first, so
  //     the first N units are marked down, N = the product's near-expiry count.
  // These are the same two rules process_pos_checkout_base uses in the database.
  // (`|| 0` treats a missing price as ₱0.)
  const priceOfLine = (item: CartItem) =>
    item.batch_id !== null
      ? priceLine(item.price || 0, item.quantity, isNearExpiry(item.batch_expiry) ? item.quantity : 0)
      : priceLine(item.price || 0, item.quantity, nearExpiryUnitsOf(item.id));
  // Every line priced once per draw and kept in a Map (a lookup table:
  // line key -> its price details), so the totals and the basket list can
  // read them without working them out again.
  const linePrices = new Map(cart.map((item) => [lineKey(item), priceOfLine(item)]));
  const lineTotalOf = (item: CartItem) => linePrices.get(lineKey(item))?.total ?? 0;
  const markedDownQtyOf = (item: CartItem) => linePrices.get(lineKey(item))?.markedDownQty ?? 0;

  // The bill, step by step. roundToCentavos (lib/loyalty.ts) rounds to whole
  // centavos so JavaScript's tiny decimal errors (70.25000000000001) can't
  // creep in.
  //   fullPriceTotal     everything at the normal price ("Subtotal")
  //   nearExpirySavings  what the 15% near-expiry markdowns take off
  //   total              what's owed before points
  const fullPriceTotal = roundToCentavos(
    cart.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0)
  );
  const nearExpirySavings = roundToCentavos(
    cart.reduce((sum, item) => sum + (linePrices.get(lineKey(item))?.savings ?? 0), 0)
  );
  const total = roundToCentavos(fullPriceTotal - nearExpirySavings);

  // Points -> discount (lib/loyalty.ts). One point takes ₱5 off.
  //   redeemablePoints  the most this member may use on this bill: no more
  //                     than they have, and no more than it takes to bring
  //                     the bill to ₱0 (rounded UP, so e.g. a ₱47 bill can be
  //                     fully covered with 10 points; the discount itself is
  //                     capped at ₱47)
  //   pointsApplied     what's really used. It's re-capped on every draw, so
  //                     removing items can't leave too many points applied.
  //   discount          pointsApplied × ₱5, never more than the bill
  //   finalTotal        what the customer actually pays
  const redeemablePoints = maxRedeemablePoints(currentMember?.loyalty_points ?? 0, total);
  const pointsApplied = Math.min(pointsToRedeem, redeemablePoints);
  const discount = discountForPoints(pointsApplied, total);
  const finalTotal = roundToCentavos(total - discount);

  // Points cover the whole bill: there's nothing left to pay by cash or card,
  // so the payment buttons and the cash box are hidden.
  const paidInFullWithPoints = cart.length > 0 && pointsApplied > 0 && finalTotal === 0;
  // The payment method saved with the order: 'Loyalty Points' when points paid
  // for everything, otherwise the Cash / Card button that's selected (points
  // still come off the total first, as a discount).
  const checkoutMethod: CheckoutPayload['paymentMethod'] = paidInFullWithPoints ? 'Loyalty Points' : paymentMethod;

  // How many items are in the basket in total (3 apples + 2 milk = 5).
  const basketCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Live preview under the amount box, so nobody needs a calculator.
  // It's only a preview: the real checks happen in handleCheckoutSubmit.
  //   amountTyped        the box as a number; null = empty or not a number yet
  //                      (then no line is shown)
  //   amountDifference   amount − what's due: positive = more than due (cash:
  //                      change to give back), negative = short, 0 = exact
  //   shortBy            how much is missing, as a positive number (0 = none)
  const typedNumber = amountInput.trim() === '' ? null : Number(amountInput);
  const amountTyped = typedNumber !== null && Number.isFinite(typedNumber) && typedNumber >= 0 ? typedNumber : null;
  const amountDifference = amountTyped !== null ? roundToCentavos(amountTyped - finalTotal) : null;
  const shortBy = amountDifference !== null && amountDifference < 0 ? -amountDifference : 0;
  // The line under the amount box: what it says, the peso figure beside it,
  // and whether it's fine (green) or needs fixing (red). null = no line.
  //   short (either method)         "Short"                     red
  //   Cash, enough or more          "Change due"                green
  //   Card, exactly what's due      "Matches the amount due"    green
  //   Card, more than what's due    "More than the amount due"  red (a card
  //                                 is charged the exact amount, no change)
  const amountStatus: { label: string; value: number; ok: boolean } | null =
    amountDifference === null
      ? null
      : amountDifference < 0
        ? { label: 'Short', value: shortBy, ok: false }
        : paymentMethod === 'Cash'
          ? { label: 'Change due', value: amountDifference, ok: true }
          : amountDifference === 0
            ? { label: 'Matches the amount due', value: finalTotal, ok: true }
            : { label: 'More than the amount due', value: amountDifference, ok: false };

  // ── Points in the payment area ──
  // Points are a discount (₱5 each) that works with Cash or Card. Two ways in:
  //   1. The amount typed is SHORT: "Use N points for the ₱X short" adds just
  //      enough points to cover the gap, so the points lessen what goes on
  //      the cash or card.
  //   2. The member has enough points for the WHOLE bill: "Pay all with
  //      points" uses them for everything, and no cash or card is needed.
  //   memberPoints        the member's balance
  //   pointsLeft          points they could still add on this bill
  //   pointsForShortfall  points the "short" button would add: enough to cover
  //                       the gap, or all that's left if that's not enough
  //   shortfallCovered    true when those points cover the whole gap
  //   canPayAllWithPoints the balance covers the whole bill (before points)
  const memberPoints = currentMember?.loyalty_points ?? 0;
  const pointsLeft = Math.max(0, redeemablePoints - pointsApplied);
  const pointsForShortfall = Math.min(pointsToCover(shortBy), pointsLeft);
  const shortfallCovered = pointsForShortfall >= pointsToCover(shortBy);
  const canPayAllWithPoints = cart.length > 0 && total > 0 && redeemablePoints >= pointsToCover(total);
  // The pesos those extra points would take off (the cap at the bill applies).
  const shortfallDiscount = roundToCentavos(
    discountForPoints(pointsApplied + pointsForShortfall, total) - discount
  );

  // Button 1: add just enough points to cover the short amount.
  // Points come in ₱5 steps, so they can cover a little MORE than the gap
  // (₱7 short -> 2 points = ₱10). With Cash that extra simply shows up as
  // change. A card is charged the exact amount due, so with Card the amount
  // box is then set to the new, lower amount due.
  const coverShortfallWithPoints = () => {
    const nextPoints = pointsApplied + pointsForShortfall;
    setPointsToRedeem(nextPoints);
    if (paymentMethod === 'Card' && shortfallCovered) {
      const nextDue = roundToCentavos(total - discountForPoints(nextPoints, total));
      setAmountInput(nextDue.toFixed(2));
    }
  };

  // Button 2: points pay for everything. The amount box is cleared, since
  // nothing is left to pay by cash or card.
  const payAllWithPoints = () => {
    setPointsToRedeem(redeemablePoints);
    setAmountInput('');
  };

  // "Remove": stop using points on this sale.
  const removePoints = () => setPointsToRedeem(0);

  // Switching between Cash and Card empties the amount box: a cash amount
  // (with change) isn't a sensible card amount, and the other way round.
  const choosePaymentMethod = (method: PaymentMethod) => {
    if (method === paymentMethod) return;
    setPaymentMethod(method);
    setAmountInput('');
  };

  // Empties the basket and member boxes, ready for the next customer.
  // (At self-serve the member stays: it's always the signed-in customer.)
  // The payment method is left as it was.
  const startNewSale = () => {
    setCart([]);
    setSelectedCustomer(startingMember);
    setPointsToRedeem(0);
    setPhoneSearch('');
    setAmountInput('');
  };

  // ── Completing the sale ──────────────────────────────────────────────────
  // The "Complete Transaction" button. First a series of checks, each one
  // stopping with a message if it fails; then the sale is sent to the
  // database. `async` lets it `await` (wait for) the database's answer.
  const handleCheckoutSubmit = async () => {
    // Already saving this sale (a double click): ignore. See isSubmitting.
    if (isSubmitting.current) return;
    if (cart.length === 0) return notify('Cart is empty!', 'error');

    if (isSelfServe && !selectedCustomer) {
      return notify("We couldn't load your loyalty account. Please sign out and sign back in.", 'error');
    }

    // The member box was changed after a member was chosen (typed over but
    // not looked up). If the new text exactly matches a member, switch to
    // them, but DON'T charge yet: points were reset and the total may have
    // changed, so the cashier checks it and presses Complete again.
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

    // Every sale must go on a member's account (the database insists too).
    if (!selectedCustomer) {
      return notify('Look up a member (name or loyalty ID) before checking out.', 'error');
    }

    // Check the amount box. Only cash payments send an amount received to the
    // database (null for Card, and for a bill fully paid with points, where
    // checkoutMethod is 'Loyalty Points' and there's no amount box).
    // The rules live in lib/validation.ts. safeParse() doesn't throw: it
    // returns { success: true, data } with the checked number, or
    // { success: false, error } with the messages.
    let cashReceived: number | null = null;
    if (checkoutMethod === 'Cash') {
      // A peso amount (at most 2 decimals) that covers what's due.
      const cashCheck = cashReceivedSchema(finalTotal).safeParse(amountInput);
      if (!cashCheck.success) return notify(cashCheck.error.issues[0].message, 'error');
      cashReceived = roundToCentavos(cashCheck.data);
    } else if (checkoutMethod === 'Card') {
      // Exactly what's due: a card has no change to hand back.
      const cardCheck = cardAmountSchema(finalTotal).safeParse(amountInput);
      if (!cardCheck.success) return notify(cardCheck.error.issues[0].message, 'error');
    }

    // All checks passed: lock the button (ref for instant, state for the screen).
    isSubmitting.current = true;
    setSubmitting(true);
    try {
      // Send the sale. onCheckout -> useStoreData.handleCheckout ->
      // api.processCheckout -> database function process_pos_checkout.
      // The browser sends only WHAT is being bought (product id, quantity,
      // batch for each line), the member, the points and how they pay. It
      // never sends prices: the database looks those up itself, so a
      // tampered browser can't change them.
      //
      // In the database, in ONE transaction (all or nothing: if any step
      // fails, nothing is saved), process_pos_checkout_base:
      //   1. checks the member (and that a customer only buys for
      //      themselves), the basket, the payment method and the points;
      //   2. saves the order, then its order lines, each with the price
      //      actually charged (15% off for near-expiry units; a line with no
      //      batch can become two: the marked-down units and the rest);
      //   3. takes the units off the product's stock, and a trigger takes
      //      them off the batches (the chosen batch, or soonest expiry first);
      //   4. applies the points discount (₱5 per point) and saves the totals;
      //   5. updates the member's points (minus redeemed, plus 1 per full
      //      ₱100 paid) and writes both changes to the loyalty log.
      // The process_pos_checkout wrapper then checks the cash covers the
      // total and adds the receipt details (names, lines, new balance).
      // useStoreData reloads products, stock and points afterwards, whether
      // the sale worked or not, so the screen matches the database.
      const savedReceipt = await onCheckout({
        cart,
        customerId: selectedCustomer?.id ?? null,
        pointsToRedeem: pointsApplied,
        paymentMethod: checkoutMethod,
        cashReceived,
      });
      // Saved: show the receipt and clear the basket for the next customer.
      setReceipt(savedReceipt);
      startNewSale();
    } catch (err) {
      // Something went wrong. Usually nothing was saved (all or nothing),
      // the basket stays as it was, and the database's message is shown
      // (e.g. "Not enough stock for "Milk": only 2 left.").
      if (err instanceof SaleSavedWithoutReceiptError) {
        // The sale DID go through, only the receipt is missing. Start a fresh
        // basket so pressing Complete again can't charge the customer twice.
        startNewSale();
        notify(`${err.message} Don't ring it up again: an admin can see it in the Orders tab.`, 'info');
      } else {
        notify(err instanceof Error ? err.message : 'Checkout failed', 'error');
      }
    } finally {
      // `finally` runs whether it worked or failed: unlock the button.
      isSubmitting.current = false;
      setSubmitting(false);
    }
  };

  // ── What's drawn on screen ───────────────────────────────────────────────
  // A grid: on large screens (lg:) 12 columns, the menu takes 7 (8 on xl)
  // and the basket the rest; on smaller screens they stack.
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
      {/* ── Left: search + the product menu, grouped by category ─────────── */}
      {/* The search itself happens here in POS (filteredProducts); the menu
          just shows the result and reports clicks back through these props. */}
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
                {/* A "controlled" input: it always shows phoneSearch, and every
                    keystroke goes through handleMemberInput. role="combobox"
                    and the aria-… attributes tell screen readers that this box
                    has a suggestion list (the <ul> below) and whether it's open. */}
                <Input
                  id="pos-member"
                  maxLength={100}
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

                {/* The suggestion list, floating under the box. Each row: name,
                    then loyalty ID · phone · email (email only if it isn't
                    already shown as the name) · points. */}
                {suggestionsOpen && (
                  <ul
                    className="absolute right-0 left-0 z-30 mt-1 max-h-56 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
                    id="member-suggestions"
                    role="listbox"
                  >
                    {memberSuggestions.length === 0 ? (
                      <li className="px-3 py-2 text-center text-xs text-ink-muted">No members match</li>
                    ) : (
                      // onMouseDown (not onClick) with preventDefault: pressing the
                      // mouse would normally take the focus away from the box first,
                      // and its onBlur would close this list before the click
                      // landed. Stopping that lets the pick go through.
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
        {/* Uses currentMember (the fresh copy) so the balance is up to date. */}
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

            {/* (Using the points is done in the payment area below.) */}
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
            // One row per basket line: name, batch + expiry, − qty +, line
            // price, × to remove, and (if any units are marked down) a note
            // like "2 × ₱80.75 (15% off)".
            cart.map((item) => (
              <div key={lineKey(item)} className="flex items-start justify-between gap-3 py-3 first:pt-0">
                <div className="min-w-0 space-y-1.5">
                  {/* Brand above the name, and the description (cut to one
                      line) under it, so the cashier sees exactly which item. */}
                  <div>
                    {item.brand && (
                      <div className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">{item.brand}</div>
                    )}
                    <strong className="block text-sm font-semibold text-ink">{item.name}</strong>
                    {item.description && <p className="line-clamp-1 text-xs text-ink-muted">{item.description}</p>}
                  </div>
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

        {/* Totals: Subtotal − near-expiry markdown − points discount = Total.
            The discount rows only appear when they're more than ₱0. */}
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
          {/* e.g. "Points (4 × ₱5)  −₱20.00" */}
          {discount > 0 && (
            <div className="flex justify-between font-medium text-brand-strong">
              <dt>
                Points ({pointsApplied} × ₱{PESO_VALUE_PER_POINT})
              </dt>
              <dd>−{peso(discount)}</dd>
            </div>
          )}
          {/* The amount to pay, set apart by a dashed rule so it reads as
              the answer to the lines above it. */}
          <div className="mt-1 flex items-baseline justify-between border-t border-dashed border-gray-200 pt-2.5 text-ink">
            <dt className="text-base font-bold">Total due</dt>
            <dd className="text-2xl font-extrabold text-brand-strong">{peso(finalTotal)}</dd>
          </div>
        </dl>

        {/* Payment: its own section under a small "PAYMENT" heading, so the
            method, the amount, its status line and the points read as one
            group, separate from the bill above. */}
        <div className="space-y-3 border-t border-gray-200 pt-4">
          <h3 className="text-[11px] font-semibold tracking-wider text-ink-muted uppercase">Payment</h3>
          {paidInFullWithPoints ? (
            // Points cover everything: nothing to pay by cash or card, so the
            // buttons and the amount box are replaced by this note. The sale
            // is saved as paid with Loyalty Points (checkoutMethod).
            <div className="flex items-center justify-between gap-3 rounded-md bg-brand/10 px-3 py-2.5 text-sm">
              <p className="flex items-center gap-2 font-semibold text-brand-strong">
                <Star className="size-4 shrink-0" aria-hidden="true" />
                Paid in full with {pointsApplied} points
              </p>
              <Button variant="ghost" size="sm" onClick={removePoints}>
                Don&apos;t use points
              </Button>
            </div>
          ) : (
            // <>...</> groups the method buttons and the amount box without
            // adding an extra element around them.
            <>
              <fieldset>
                {/* "Pay the rest by" once points have taken something off. */}
                <legend className="mb-1.5 text-xs font-medium text-ink-muted">
                  {pointsApplied > 0 ? 'Pay the rest by' : 'Pay by'}
                </legend>
                {/* Side-by-side buttons instead of a dropdown: one click instead of two. */}
                <div className="grid grid-cols-2 gap-1 rounded-full bg-subtle p-1">
                  {/* `icon: Icon` renames the field to a capitalised name, because
                      JSX only treats <Icon /> as a component if it starts with a
                      capital letter. aria-pressed tells screen readers which
                      button is switched on. */}
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
                        onClick={() => choosePaymentMethod(value)}
                      >
                        <Icon className="size-4" aria-hidden="true" />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {/* The amount box, for both methods: the cash handed over, or
                  the amount to charge on the card. Under it, the live status
                  line (amountStatus). min/step are just hints for the browser;
                  the real checks are cashReceivedSchema / cardAmountSchema in
                  handleCheckoutSubmit. */}
              <div className="space-y-1.5">
                <label htmlFor="pos-amount" className="block text-xs font-medium text-ink-muted">
                  {paymentMethod === 'Cash' ? 'Cash received' : 'Amount to charge on card'}
                </label>
                <div className="flex gap-2">
                  <Input
                    id="pos-amount"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder={finalTotal.toFixed(2)}
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    autoComplete="off"
                    className="tabular-nums"
                    aria-describedby="pos-amount-status"
                    required
                  />
                  {/* Fills in exactly what's due (exact cash, or the card amount). */}
                  <Button variant="outline" onClick={() => setAmountInput(finalTotal.toFixed(2))} disabled={cart.length === 0}>
                    Exact
                  </Button>
                </div>
                {amountStatus && cart.length > 0 && (
                  <p
                    id="pos-amount-status"
                    className={cn(
                      'flex justify-between rounded-md px-3 py-2 text-sm font-semibold tabular-nums',
                      amountStatus.ok ? 'bg-brand/10 text-brand-strong' : 'bg-danger/10 text-danger-strong'
                    )}
                  >
                    <span>{amountStatus.label}</span>
                    <span>{peso(amountStatus.value)}</span>
                  </p>
                )}
              </div>
            </>
          )}

          {/* Loyalty points: only for a member who has some, once the basket
              has something in it. Shows what's being used (with Remove) and
              the two ways to use points (see coverShortfallWithPoints and
              payAllWithPoints above). */}
          {currentMember && memberPoints > 0 && cart.length > 0 && !paidInFullWithPoints && (
            <div className="space-y-2 rounded-md border border-brand/20 bg-brand/5 p-3">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-ink">Loyalty points</span>
                <span className="font-medium text-ink-muted tabular-nums">
                  {memberPoints} available · ₱{PESO_VALUE_PER_POINT} off each
                </span>
              </div>

              {/* Points already on this sale, e.g. "Using 4 points (−₱20.00)". */}
              {pointsApplied > 0 && (
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-semibold text-brand-strong tabular-nums">
                    Using {pointsApplied} points (−{peso(discount)})
                  </span>
                  <button
                    type="button"
                    className="text-xs font-semibold text-ink-muted transition-colors hover:text-danger-strong"
                    onClick={removePoints}
                  >
                    Remove
                  </button>
                </div>
              )}

              {/* The amount typed is short: cover the gap with points. If
                  there aren't enough, this uses the last ones and the rest
                  still has to be paid. */}
              {shortBy > 0 && pointsForShortfall > 0 && (
                <Button variant="outline" size="sm" className="w-full" onClick={coverShortfallWithPoints}>
                  <Star aria-hidden="true" />
                  {shortfallCovered
                    ? `Use ${pointsForShortfall} points (−${peso(shortfallDiscount)}) to cover the short`
                    : `Use your last ${pointsForShortfall} points (−${peso(shortfallDiscount)})`}
                </Button>
              )}

              {/* Enough points for the whole bill: pay it all with points. */}
              {canPayAllWithPoints && (
                <Button variant="outline" size="sm" className="w-full" onClick={payAllWithPoints}>
                  <Star aria-hidden="true" />
                  Pay the whole bill with {pointsToCover(total)} points
                </Button>
              )}

              {/* Nothing to offer yet: say how it works. */}
              {pointsApplied === 0 && shortBy === 0 && !canPayAllWithPoints && (
                <p className="text-xs text-ink-muted">
                  {isSelfServe
                    ? 'Enter what you’ll pay. If it’s short, your points can cover the rest.'
                    : 'Enter what the customer pays. If it’s short, points can cover the rest.'}
                </p>
              )}
            </div>
          )}

          {/* The big button. Greyed out with an empty basket or while the
              sale is being saved (the `submitting` state). */}
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
      {/* `x && <Thing />` draws Thing only while x is set. The details
          pop-up gets only this product's sellable batches and basket counts;
          its "Add" goes through addToCart like everything else, then closes. */}
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
      {/* The receipt from the last sale, until the cashier closes it. */}
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
