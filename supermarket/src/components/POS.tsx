import { useRef, useState } from 'react';
import type { ProductInventorySummary, Customer, CartItem, CheckoutPayload } from '../types/app';
import { discountForPoints, maxRedeemablePoints, roundToCentavos } from '../lib/loyalty';
import { useAuth } from '../contexts/AuthContext';

interface POSProps {
  products: ProductInventorySummary[];
  customers: Customer[];
  onCheckout: (payload: CheckoutPayload) => Promise<void>;
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

export default function POS({ products = [], customers = [], onCheckout }: POSProps) {
  const { user } = useAuth();

  const me = customers.find((c) => c.id === user?.id) ?? null;
  const myMemberCode = me?.loyalty_id ?? me?.email ?? '';

  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [phoneSearch, setPhoneSearch] = useState(myMemberCode);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(me);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card' | 'Loyalty Points'>('Cash');

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

  const handleScan = () => {
    const code = search.trim();
    if (!code) return;

    const lowered = code.toLowerCase();
    const match =
      products.find((p) => p.barcode === code) ||
      products.find((p) => (p.sku || '').toLowerCase() === lowered) ||
      (filteredProducts.length === 1 ? filteredProducts[0] : undefined);

    if (!match) {
      if (/^\d+$/.test(code)) alert(`No product found with barcode ${code}`);
      return;
    }

    addToCart(match);
    setSearch('');
  };

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
      setPointsToRedeem(0);
    } else {
      alert('Customer not found!');
    }
  };

  // --- Bill Math ---
  const total = roundToCentavos(
    cart.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0)
  );

  const redeemablePoints = maxRedeemablePoints(selectedCustomer?.loyalty_points ?? 0, total);
  const pointsApplied = Math.min(pointsToRedeem, redeemablePoints);
  const discount = discountForPoints(pointsApplied, total);
  const finalTotal = roundToCentavos(total - discount);

  const handlePointsChange = (value: string) => {
    const points = Math.floor(Number(value) || 0);
    setPointsToRedeem(Math.max(0, Math.min(points, redeemablePoints)));
  };

  const handleCheckoutSubmit = async () => {
    if (isSubmitting.current) return;
    if (cart.length === 0) return alert('Cart is empty!');

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
      setSelectedCustomer(me);
      setPointsToRedeem(0);
      setPhoneSearch(myMemberCode);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      isSubmitting.current = false;
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-6 min-h-screen bg-[#F5F5F5] text-[#333333] font-sans antialiased selection:bg-[#2E7D32]/15 selection:text-[#2E7D32]">
      {/* Left Column: Product Search & Catalog */}
      <div className="flex-1 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight text-[#333333]">Items Lookup</h2>
          <span className="text-xs text-[#333333]/60 font-medium">
            {filteredProducts.length} items available
          </span>
        </div>

        <input
          type="text"
          placeholder="Scan barcode, SKU, or search product name..."
          className="w-full rounded-xl border border-gray-300 bg-[#FFFFFF] px-4 py-3 text-sm text-[#333333] placeholder-[#333333]/40 shadow-sm outline-none transition-all focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleScan();
          }}
        />

        {/* Product Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 overflow-y-auto max-h-[calc(100vh-180px)] pr-1">
          {filteredProducts.length === 0 ? (
            <div className="col-span-full py-12 text-center rounded-2xl border border-dashed border-gray-300 bg-[#FFFFFF]">
              <p className="text-sm font-medium text-[#333333]/50">No products found</p>
            </div>
          ) : (
            filteredProducts.map((p) => (
              <div
                key={p.id}
                onClick={() => addToCart(p)}
                className="group relative flex flex-col justify-between rounded-xl border border-gray-200/80 bg-[#FFFFFF] p-4 shadow-sm transition-all hover:border-[#2E7D32]/50 hover:shadow-md cursor-pointer select-none"
              >
                <div>
                  <h4 className="text-sm font-semibold text-[#333333] group-hover:text-[#2E7D32] transition-colors line-clamp-2">
                    {p.name}
                  </h4>
                  <p className="mt-1 text-base font-bold text-[#2E7D32]">
                    ₱{(p.price || 0).toFixed(2)}
                  </p>
                </div>

                <div className="mt-3 flex items-center justify-between pt-2 border-t border-gray-100">
                  <span
                    className={`text-xs font-medium ${
                      p.stock_quantity <= 0 ? 'text-red-500 font-semibold' : 'text-[#333333]/60'
                    }`}
                  >
                    Stock: {p.stock_quantity}
                  </span>
                  {p.expires_soon && (
                    <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                      {p.near_expiry_count} expiring
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Column: Checkout & Cart */}
      <div className="w-full lg:w-[400px] flex flex-col gap-4">
        <div className="rounded-2xl border border-gray-200/80 bg-[#FFFFFF] p-5 shadow-sm flex flex-col gap-4">
          <h2 className="text-xl font-bold tracking-tight text-[#333333]">Active Basket</h2>

          {/* Customer Search */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Phone / Loyalty ID"
              className="flex-1 rounded-lg border border-gray-300 bg-[#FFFFFF] px-3 py-2 text-xs text-[#333333] placeholder-[#333333]/40 outline-none transition-all focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20"
              value={phoneSearch}
              onChange={(e) => handleMemberInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') findCustomer();
              }}
            />
            <button
              type="button"
              onClick={findCustomer}
              className="rounded-lg bg-[#2E7D32] px-3 py-2 text-xs font-semibold text-[#FFFFFF] shadow-sm hover:bg-[#246628] transition-colors"
            >
              Lookup
            </button>
          </div>

          {/* Member Card Banner */}
          {selectedCustomer && (
            <div className="rounded-xl bg-[#2E7D32]/10 border border-[#2E7D32]/20 p-3 text-xs text-[#333333]">
              <div className="flex items-center justify-between font-semibold">
                <span className="flex items-center gap-1.5 text-[#2E7D32]">
                  👤 {selectedCustomer.name}
                </span>
                <span className="rounded-full bg-[#FFFFFF] px-2 py-0.5 text-[11px] font-bold text-[#2E7D32] border border-[#2E7D32]/20 shadow-xs">
                  {selectedCustomer.loyalty_points ?? 0} pts
                </span>
              </div>

              {(selectedCustomer.loyalty_points ?? 0) > 0 && (
                <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-[#2E7D32]/15">
                  <label className="font-medium text-[#333333]/80 text-[11px]">
                    Redeem Points (₱1/pt):
                  </label>
                  <input
                    type="number"
                    max={redeemablePoints}
                    min="0"
                    className="w-20 rounded-md border border-gray-300 bg-[#FFFFFF] px-2 py-1 text-xs text-right font-semibold text-[#333333] outline-none focus:border-[#2E7D32]"
                    value={pointsApplied}
                    onChange={(e) => handlePointsChange(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          {/* Cart Items List */}
          <div className="flex flex-col gap-2 max-h-[260px] overflow-y-auto pr-1">
            {cart.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#333333]/40 border border-dashed border-gray-200 rounded-xl">
                Basket is empty
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg bg-[#F5F5F5] p-2.5 text-xs border border-gray-200/60"
                >
                  <div className="flex flex-col">
                    <span className="font-semibold text-[#333333]">{item.name}</span>
                    <span className="text-[11px] text-[#333333]/60">x{item.quantity}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#333333]">
                      ₱{((item.price || 0) * item.quantity).toFixed(2)}
                    </span>
                    <button
                      type="button"
                      className="flex h-5 w-5 items-center justify-center rounded-md bg-red-100 text-xs font-bold text-red-600 hover:bg-red-200 transition-colors"
                      onClick={() => removeFromCart(item.id)}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Summary & Checkout Controls */}
          <div className="pt-3 border-t border-gray-200 space-y-2 text-xs">
            <div className="flex justify-between text-[#333333]/70 font-medium">
              <span>Subtotal</span>
              <span>₱{total.toFixed(2)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-[#2E7D32] font-semibold">
                <span>Discount (Points)</span>
                <span>-₱{discount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-[#333333] pt-1 border-t border-gray-100">
              <span>Total</span>
              <span className="text-[#2E7D32]">₱{finalTotal.toFixed(2)}</span>
            </div>

            <div className="pt-2">
              <label className="block text-[11px] font-semibold text-[#333333] mb-1">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value as 'Cash' | 'Card' | 'Loyalty Points')
                }
                className="w-full rounded-lg border border-gray-300 bg-[#FFFFFF] px-3 py-2 text-xs text-[#333333] font-medium outline-none transition-all focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20"
              >
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="Loyalty Points">Loyalty Points</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleCheckoutSubmit}
              className="mt-2 w-full rounded-xl bg-[#2E7D32] py-3 text-sm font-bold text-[#FFFFFF] shadow-md hover:bg-[#246628] active:scale-[0.99] transition-all"
            >
              Complete Transaction
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}