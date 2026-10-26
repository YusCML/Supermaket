-- =============================================================================
-- process_pos_checkout(): saves one sale, start to finish.
--
-- Replaces the version from 20261017000000_role_profile_tables.sql. That one
-- trusted the prices and totals sent by the browser, never checked stock, and
-- left loyalty_logs.reason empty (it's a required column, so any sale that
-- earned or redeemed points failed).
--
-- The POS calls this through supabase.rpc() when the cashier hits "Complete
-- Transaction". Everything below happens in a single transaction: if any check
-- fails (not enough stock, not enough points, ...) the whole sale is cancelled
-- and nothing is saved.
--
--   1. Check the request makes sense (staff only, cart not empty, ...)
--   2. Lock the member's loyalty profile and check they have the points
--   3. For every item: lock the product, check stock, take it off the shelf,
--      and write the receipt line using the price from the DATABASE
--   4. Apply the points discount and work out what the customer pays
--   5. Update the member's points and write the loyalty log
--
-- The browser only sends WHAT is being bought, WHO the member is and HOW MANY
-- points to use. Prices and totals are always worked out here.
--
-- Loyalty rules (keep in sync with src/lib/loyalty.ts):
--   * 1 point = ₱1 off the bill
--   * members earn 1 point for every full ₱100 they pay in cash/card
--   * the part of the bill paid with points doesn't earn new points
--
-- Returns { success, order_id, points_earned, points_redeemed, total_amount, final_amount }.
-- =============================================================================

-- Older versions of this function took different arguments (there are two of
-- them live right now). Drop every version so only the one below is left.
do $$
declare
  old_version regprocedure;
begin
  for old_version in
    select oid::regprocedure
    from pg_proc
    where proname = 'process_pos_checkout'
      and pronamespace = 'public'::regnamespace
  loop
    execute format('drop function %s', old_version);
  end loop;
end;
$$;


create function public.process_pos_checkout(
  p_cart_items      jsonb,                   -- [{ "product_id": 1, "quantity": 2 }, ...]
  p_customer_id     uuid    default null,    -- the member's users.id, or null for a walk-in
  p_points_redeemed integer default 0,       -- how many points to put toward the bill
  p_payment_method  text    default 'Cash'   -- 'Cash' | 'Card' | 'Loyalty Points'
)
returns jsonb
language plpgsql
-- Runs with the owner's rights so it can update stock, points and orders,
-- which nobody is allowed to write directly (see the row-level security migration).
security definer
set search_path = ''
as $$
declare
  peso_value_per_point   constant numeric := 1;
  pesos_per_point_earned constant numeric := 100;

  member         record;
  line           record;
  product        record;
  new_order_id   bigint;
  points_to_use  integer        := coalesce(p_points_redeemed, 0);
  points_earned  integer        := 0;
  cart_total     numeric(10, 2) := 0;
  points_needed  integer;
  discount       numeric(10, 2) := 0;
  amount_to_pay  numeric(10, 2) := 0;
begin
  -- 1. Sanity checks -----------------------------------------------------------
  if not public.is_staff() then
    raise exception 'Only admins and cashiers can complete a sale.';
  end if;

  if p_cart_items is null
     or jsonb_typeof(p_cart_items) <> 'array'
     or jsonb_array_length(p_cart_items) = 0 then
    raise exception 'The cart is empty.';
  end if;

  if p_payment_method is null or p_payment_method not in ('Cash', 'Card', 'Loyalty Points') then
    raise exception 'Unknown payment method: %', p_payment_method;
  end if;

  if points_to_use < 0 then
    raise exception 'Points to redeem can''t be negative.';
  end if;

  if p_customer_id is null and (points_to_use > 0 or p_payment_method = 'Loyalty Points') then
    raise exception 'Look up a member first before using loyalty points.';
  end if;

  -- 2. The member ------------------------------------------------------------
  -- FOR UPDATE locks their loyalty profile until we're done, so two tills
  -- can't spend the same points at the same moment.
  if p_customer_id is not null then
    select user_id, loyalty_points
      into member
      from public.customer
     where user_id = p_customer_id
       for update;

    if not found then
      raise exception 'That member doesn''t have a loyalty profile.';
    end if;

    if points_to_use > member.loyalty_points then
      raise exception 'This member only has % points.', member.loyalty_points;
    end if;
  end if;

  -- Create the order first so the receipt lines have something to point at.
  -- The totals get filled in at step 4 once we know them.
  insert into public.orders (customer_id, total_amount, discount_amount, final_amount, payment_method, points_redeemed)
  values (p_customer_id, 0, 0, 0, p_payment_method, 0)
  returning id into new_order_id;

  -- 3. The items -------------------------------------------------------------
  -- If the same product shows up twice in the cart we add the quantities
  -- together. Going through products in id order means two checkouts touching
  -- the same products always lock them in the same order (no deadlocks).
  for line in
    select (item ->> 'product_id')::bigint     as product_id,
           sum((item ->> 'quantity')::integer) as quantity
      from jsonb_array_elements(p_cart_items) as item
     group by 1
     order by 1
  loop
    if line.product_id is null then
      raise exception 'One of the cart items is missing a product.';
    end if;

    if line.quantity is null or line.quantity <= 0 then
      raise exception 'Every item needs a quantity of at least 1.';
    end if;

    select id, name, price, stock_quantity
      into product
      from public.products
     where id = line.product_id
       for update;

    if not found then
      raise exception 'Product #% no longer exists.', line.product_id;
    end if;

    if product.stock_quantity < line.quantity then
      raise exception 'Not enough stock for "%": only % left.', product.name, product.stock_quantity;
    end if;

    update public.products
       set stock_quantity = stock_quantity - line.quantity
     where id = product.id;

    insert into public.order_items (order_id, product_id, quantity, unit_price, subtotal)
    values (new_order_id, product.id, line.quantity, product.price, product.price * line.quantity);

    cart_total := cart_total + product.price * line.quantity;
  end loop;

  -- 4. Points discount and what's left to pay ---------------------------------
  -- Points can't push the bill below ₱0, and we don't let anyone burn more
  -- points than the bill needs. We round up so points can cover the centavos
  -- too (a ₱45.50 bill can be fully paid with 46 points).
  points_needed := ceil(cart_total / peso_value_per_point);

  if points_to_use > points_needed then
    raise exception 'Only % points are needed to cover this bill.', points_needed;
  end if;

  discount      := least(points_to_use * peso_value_per_point, cart_total);
  amount_to_pay := cart_total - discount;

  if p_payment_method = 'Loyalty Points' and amount_to_pay > 0 then
    raise exception 'Not enough points to pay the whole bill with Loyalty Points (₱% still due).', amount_to_pay;
  end if;

  update public.orders
     set total_amount    = cart_total,
         discount_amount = discount,
         final_amount    = amount_to_pay,
         points_redeemed = points_to_use
   where id = new_order_id;

  -- 5. Loyalty points -------------------------------------------------------------
  -- Points are only earned on money that was actually paid, not on the part
  -- covered by points. floor() means ₱199 earns 1 point, ₱200 earns 2.
  if p_customer_id is not null then
    points_earned := floor(amount_to_pay / pesos_per_point_earned);

    update public.customer
       set loyalty_points = loyalty_points - points_to_use + points_earned
     where user_id = p_customer_id;

    -- Write both sides to the log so the Loyalty tab shows the full story.
    if points_to_use > 0 then
      insert into public.loyalty_logs (customer_id, order_id, points_changed, type, reason)
      values (p_customer_id, new_order_id, -points_to_use, 'REDEEMED',
              format('Redeemed %s points on order #%s', points_to_use, new_order_id));
    end if;

    if points_earned > 0 then
      insert into public.loyalty_logs (customer_id, order_id, points_changed, type, reason)
      values (p_customer_id, new_order_id, points_earned, 'EARNED',
              format('Earned %s points on order #%s (₱%s paid)', points_earned, new_order_id, amount_to_pay));
    end if;
  end if;

  return jsonb_build_object(
    'success',         true,
    'order_id',        new_order_id,
    'points_earned',   points_earned,
    'points_redeemed', points_to_use,
    'total_amount',    cart_total,
    'final_amount',    amount_to_pay
  );
end;
$$;

-- Only signed-in users can even call it (and step 1 turns away non-staff).
revoke execute on function public.process_pos_checkout(jsonb, uuid, integer, text) from public, anon;
grant execute on function public.process_pos_checkout(jsonb, uuid, integer, text) to authenticated;
