// Initial Mock Data
let products = [
  { id: 1, sku: 'SKU-001', barcode: '1001', name: 'Whole Milk 1L', category: 'Dairy', price: 95.00, cost: 70.00, stock_quantity: 25, reorder_level: 10 },
  { id: 2, sku: 'SKU-002', barcode: '1002', name: 'White Bread', category: 'Bakery', price: 65.00, cost: 45.00, stock_quantity: 5, reorder_level: 8 },
  { id: 3, sku: 'SKU-003', barcode: '1003', name: 'Brown Eggs (12s)', category: 'Dairy', price: 180.00, cost: 130.00, stock_quantity: 15, reorder_level: 5 },
  { id: 4, sku: 'SKU-004', barcode: '1004', name: 'Instant Coffee 100g', category: 'Pantry', price: 210.00, cost: 160.00, stock_quantity: 3, reorder_level: 10 }
];

let customers = [
  { id: 1, name: 'Juan Dela Cruz', phone: '09171234567', loyalty_id: 'LOY-1001', points_balance: 150 },
  { id: 2, name: 'Maria Santos', phone: '09189876543', loyalty_id: 'LOY-1002', points_balance: 45 }
];

let orders = [];
let orderItems = [];
let loyaltyLogs = [];

export const api = {
  getProducts: () => [...products],
  getCustomers: () => [...customers],
  getLoyaltyLogs: () => [...loyaltyLogs],

  addProduct: (product) => {
    const newProduct = { ...product, id: Date.now() };
    products.push(newProduct);
    return newProduct;
  },

  updateStock: (productId, delta) => {
    products = products.map(p => {
      if (p.id === productId) {
        const updated = p.stock_quantity + delta;
        return { ...p, stock_quantity: updated < 0 ? 0 : updated };
      }
      return p;
    });
  },

  // POS Atomic Transaction Simulation
  processCheckout: ({ cart, customerId, pointsToRedeem, paymentMethod }) => {
    // 1. Check stock availability
    for (let item of cart) {
      const prod = products.find(p => p.id === item.id);
      if (!prod || prod.stock_quantity < item.quantity) {
        throw new Error(`Insufficient stock for product: ${item.name}`);
      }
    }

    const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const discountAmount = pointsToRedeem; // ₱1 per point
    const finalAmount = Math.max(0, totalAmount - discountAmount);

    // 2. Insert order
    const orderId = orders.length + 1;
    const newOrder = {
      id: orderId,
      customer_id: customerId || null,
      total_amount: totalAmount,
      discount_amount: discountAmount,
      final_amount: finalAmount,
      payment_method: paymentMethod,
      created_at: new Date().toISOString()
    };
    orders.push(newOrder);

    // 3. Insert order items & update inventory
    cart.forEach(item => {
      orderItems.push({
        id: orderItems.length + 1,
        order_id: orderId,
        product_id: item.id,
        quantity: item.quantity,
        unit_price: item.price,
        subtotal: item.price * item.quantity
      });

      const prod = products.find(p => p.id === item.id);
      prod.stock_quantity -= item.quantity;
    });

    // 4. Update customer points balance and log activity
    if (customerId) {
      const cust = customers.find(c => c.id === customerId);
      if (cust) {
        if (pointsToRedeem > 0) {
          cust.points_balance -= pointsToRedeem;
          loyaltyLogs.push({
            id: loyaltyLogs.length + 1,
            customer_id: customerId,
            order_id: orderId,
            points_changed: -pointsToRedeem,
            type: 'REDEEMED',
            created_at: new Date().toISOString()
          });
        }

        // Award 1 point per ₱100 spent
        const pointsEarned = Math.floor(finalAmount / 100);
        if (pointsEarned > 0) {
          cust.points_balance += pointsEarned;
          loyaltyLogs.push({
            id: loyaltyLogs.length + 1,
            customer_id: customerId,
            order_id: orderId,
            points_changed: pointsEarned,
            type: 'EARNED',
            created_at: new Date().toISOString()
          });
        }
      }
    }

    return { success: true, orderId };
  }
};