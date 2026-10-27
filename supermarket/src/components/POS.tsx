import { useRef, useState } from 'react';
import type { ProductInventorySummary, Customer, CartItem, CheckoutPayload } from '../types/app';
import { discountForPoints, maxRedeemablePoints, roundToCentavos } from '../lib/loyalty';
import { useAuth } from '../contexts/AuthContext';

interface POSProps {
  products: ProductInventorySummary[];
  customers: Customer[];
  onCheckout: (payload: CheckoutPayload) => Promise<void>;
  // 'self-serve': a customer buying for themselves. The sale always goes on
  //   their own loyalty account, so there's no member lookup at all.
  // 'staff': a cashier or admin at the till. They look the customer up by
  //   loyalty ID / phone / email, or leave the box empty for a walk-in.
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

export default function POS({ products = [], customers = [], onCheckout, mode = 'staff' }: POSProps) {
  const { user } = useAuth();
  const isSelfServe = mode === 'self-serve';

  // Who the sale goes on when the screen opens (and again after each sale).
  // At self-serve that's always you: everyone who logs in is a loyalty member.
  // At the till it starts empty: the cashier is serving someone else, so they
  // look that customer up. Left empty, it's a walk-in (no member, no points).
  const me = customers.find((c) => c.id === user?.id) ?? null;
  const startingMember = isSelfServe ? me : null;

  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [phoneSearch, setPhoneSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(startingMember);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card' | 'Loyalty Points'>('Cash');

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

  // Clicking a product adds one to the basket. The stock checks happen out
  // here rather than inside setCart, because React may run that callback twice
  // in development (StrictMode), which would pop the alert twice.
  const addToCart = (product: ProductInventorySummary) => {
    const alreadyInCart = cart.find((item) => item.id === product.id)?.quantity ?? 0;

    if (product.stock_quantity <= 0) return alert('Item is out of stock!');
    if (alreadyInCart >= product.stock_quantity) return alert('Cannot exceed available stock!');

    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (id: number) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
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
      if (/^\d+$/.test(code)) alert(`No product found with barcode ${code}`);
      return;
    }

    addToCart(match);
    setSearch('');
  };

  // Clearing the member box turns the sale into a walk-in: no member, no points.
  const handleMemberInput = (value: string) => {
    setPhoneSearch(value);
    if (!value.trim()) {
      setSelectedCustomer(null);
      setPointsToRedeem(0);
    }
  };

  const findCustomer = () => {
    const query = phoneSearch.trim();
    if (!query) return;
    const cust = customers.find((c) => matchesMember(c, query));
    if (cust) {
      setSelectedCustomer(cust);
      // Points typed in for the previous member shouldn't carry over.
      setPointsToRedeem(0);
    } else {
      alert('Customer not found!');
    }
  };

  // --- Bill math -------------------------------------------------------------
  // This is only a preview for the cashier. The database recalculates all of
  // it from the real prices when the sale is saved.
  const total = roundToCentavos(
    cart.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0)
  );

  // The member can't use more points than they have, or more than the bill
  // needs. Clamping here (not only when typing) also covers the case where
  // the cashier removes items after entering points.
  const redeemablePoints = maxRedeemablePoints(selectedCustomer?.loyalty_points ?? 0, total);
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
    if (cart.length === 0) return alert('Cart is empty!');

    // Self-serve sales must go on your own account (the database insists). If
    // your loyalty profile didn't load, say so instead of a confusing error.
    if (isSelfServe && !selectedCustomer) {
      return alert("We couldn't load your loyalty account. Please sign out and sign back in.");
    }

    // Whoever's ID is in the member box is who gets the points. If the cashier
    // typed a different ID but never pressed Lookup, catch it here so the
    // points don't land on the wrong account. We switch to that member and
    // stop, so the cashier can check the total (their points may differ).
    const memberQuery = phoneSearch.trim();
    if (memberQuery && !(selectedCustomer && matchesMember(selectedCustomer, memberQuery))) {
      const typedMember = customers.find((c) => matchesMember(c, memberQuery));
      if (!typedMember) return alert('Customer not found!');
      setSelectedCustomer(typedMember);
      setPointsToRedeem(0);
      return alert(
        `Member changed to ${typedMember.name || typedMember.email}. Check the total, then press Complete Transaction again.`
      );
    }

    // "Loyalty Points" as the payment method means the whole bill is paid
    // with points, so there has to be a member and enough points to reach ₱0.
    // The database checks this too. Catching it here just saves a round trip.
    if (paymentMethod === 'Loyalty Points') {
      if (!selectedCustomer) {
        return alert('Look up a member first to pay with loyalty points.');
      }
      if (finalTotal > 0) {
        return alert(
          `Not enough points redeemed to cover the bill. ₱${finalTotal.toFixed(2)} is still due.`
        );
      }
    }

    isSubmitting.current = true;
    try {
      await onCheckout({
        cart,
        customerId: selectedCustomer?.id ?? null,
        pointsToRedeem: pointsApplied,
        paymentMethod,
      });
      alert('Checkout completed successfully!');
      setCart([]);
      // Back to the start for the next sale: your own account at self-serve,
      // an empty member box at the till.
      setSelectedCustomer(startingMember);
      setPointsToRedeem(0);
      setPhoneSearch('');
    } catch (err) {
      // Messages like "Not enough stock for ..." come straight from the database.
      alert(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      isSubmitting.current = false;
    }
  };

  return (
    <div className="pos-layout">
      <div className="pos-left">
        <h2>Items Lookup</h2>
        <input
          type="text"
          placeholder="Scan barcode, SKU, or search product name..."
          className="search-bar"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleScan();
          }}
        />
        <div className="product-grid">
          {filteredProducts.length === 0 ? (
            <p className="no-products">No products found</p>
          ) : (
            filteredProducts.map((p) => (
              <div key={p.id} className="product-card" onClick={() => addToCart(p)}>
                <h4>{p.name}</h4>
                <p>₱{(p.price || 0).toFixed(2)}</p>
                <small>Stock: {p.stock_quantity}</small>
                {p.expires_soon && (
                  <div>
                    <span className="badge badge-warn">
                      {p.near_expiry_count} nearing expiry
                    </span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="pos-right">
        <h2>Active Basket</h2>

        {/* Self-serve shoppers can't put the sale on someone else's account,
            so they don't get the lookup box. */}
        {!isSelfServe && (
          <div className="customer-panel">
            <input
              placeholder="Phone Number / Customer ID"
              value={phoneSearch}
              onChange={(e) => handleMemberInput(e.target.value)}
              // Enter (or scanning a loyalty card) looks the member up, same as the button.
              onKeyDown={(e) => {
                if (e.key === 'Enter') findCustomer();
              }}
            />
            <button onClick={findCustomer}>Lookup Member</button>
          </div>
        )}

        {selectedCustomer && (
          <div className="member-info">
            👤 <strong>{selectedCustomer.name}</strong> | Points:{' '}
            {selectedCustomer.loyalty_points ?? 0}
            {(selectedCustomer.loyalty_points ?? 0) > 0 && (
              <div className="points-redeem">
                <label>Redeem Points (₱1/pt): </label>
                <input
                  type="number"
                  max={redeemablePoints}
                  min="0"
                  value={pointsApplied}
                  onChange={(e) => handlePointsChange(e.target.value)}
                />
              </div>
            )}
          </div>
        )}

        <div className="cart-list">
          {cart.length === 0 ? (
            <p className="empty-cart">Basket is empty</p>
          ) : (
            cart.map((item) => (
              <div key={item.id} className="cart-item">
                <div>
                  <strong>{item.name}</strong>
                  <small> x{item.quantity}</small>
                </div>
                <div>
                  <span>₱{((item.price || 0) * item.quantity).toFixed(2)} </span>
                  <button className="btn-sm btn-danger" onClick={() => removeFromCart(item.id)}>
                    ×
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="summary">
          <div>Subtotal: ₱{total.toFixed(2)}</div>
          <div>Discount: -₱{discount.toFixed(2)}</div>
          <h3>Total: ₱{finalTotal.toFixed(2)}</h3>

          <select
            value={paymentMethod}
            onChange={(e) =>
              setPaymentMethod(e.target.value as 'Cash' | 'Card' | 'Loyalty Points')
            }
          >
            <option value="Cash">Cash</option>
            <option value="Card">Card</option>
            <option value="Loyalty Points">Loyalty Points</option>
          </select>

          <button className="btn-primary checkout-btn" onClick={handleCheckoutSubmit}>
            Complete Transaction
          </button>
        </div>
      </div>
    </div>
  );
}