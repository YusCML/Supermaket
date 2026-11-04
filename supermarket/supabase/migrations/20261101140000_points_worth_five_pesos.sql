-- Loyalty points are now worth ₱5 each when redeemed (they were ₱1).
--
-- Earning is unchanged: 1 point per full ₱100 paid. So a member now gets 5%
-- back instead of 1%. The project spec only says points are redeemed "as
-- monetary discounts"; it doesn't fix their value, so this stays within it.
--
-- This is the live process_pos_checkout_base() exactly as it was in the
-- database on 2026-11-01, with ONLY peso_value_per_point changed (1 -> 5) and
-- the comment about rounding updated. Keep src/lib/loyalty.ts
-- (PESO_VALUE_PER_POINT) in step with it.

CREATE OR REPLACE FUNCTION public.process_pos_checkout_base(p_cart_items jsonb, p_customer_id uuid DEFAULT NULL::uuid, p_points_redeemed integer DEFAULT 0, p_payment_method text DEFAULT 'Cash'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  peso_value_per_point   constant numeric := 5;
  pesos_per_point_earned constant numeric := 100;

  -- Near-expiry markdown (keep in sync with src/lib/pricing.ts).
  near_expiry_days        constant integer := 7;
  near_expiry_percent_off constant numeric := 15;
  today                   constant date    := (now() at time zone 'Asia/Manila')::date;

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

  near_expiry_units integer;
  marked_down_qty   integer;
  full_price_qty    integer;
  marked_down_price numeric(10, 2);
  markdown_savings  numeric(10, 2) := 0;
  chosen_batch      record;
  line_price        numeric(10, 2);
begin
  -- 1. Sanity checks -----------------------------------------------------------
  -- Every sale goes on a loyalty account. (The default above is only kept
  -- because Postgres can't drop a default from an existing function.)
  if p_customer_id is null then
    raise exception 'Look up a member (name or loyalty ID) before checking out.';
  end if;

  -- Staff can sell to anyone. Customers can only buy for themselves.
  -- ("is distinct from" also catches a customer sending no member at all.)
  if not public.is_staff() and p_customer_id is distinct from auth.uid() then
    raise exception 'At self-checkout, purchases can only go on your own account.';
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
  -- Lock every product in the cart first, in id order. Two checkouts touching
  -- the same products then always lock them in the same order (no deadlocks),
  -- whatever order the lines below are handled in.
  perform 1
     from public.products
    where id in (select (item ->> 'product_id')::bigint
                   from jsonb_array_elements(p_cart_items) as item)
    order by id
      for update;

  -- One line per product + batch. If the same product and batch show up twice
  -- we add the quantities together. Lines with a chosen batch go first, so the
  -- "soonest expiry first" lines (no batch) can't use up stock someone picked.
  for line in
    select (item ->> 'product_id')::bigint     as product_id,
           (item ->> 'batch_id')::bigint       as batch_id,
           sum((item ->> 'quantity')::integer) as quantity
      from jsonb_array_elements(p_cart_items) as item
     group by 1, 2
     order by 2 nulls last, 1
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

    marked_down_price := round(product.price * (100 - near_expiry_percent_off) / 100, 2);

    if line.batch_id is not null then
      -- A batch the cashier chose. Checked here so the message is clear; the
      -- batch trigger checks again when it takes the stock out.
      select id, product_id, batch_code, quantity_remaining, expiry_date, status
        into chosen_batch
        from public.product_batches
       where id = line.batch_id;

      if not found or chosen_batch.product_id <> product.id then
        raise exception 'That batch doesn''t belong to "%".', product.name;
      end if;

      if chosen_batch.status <> 'active' or chosen_batch.expiry_date <= today then
        raise exception 'Batch % of "%" has expired and can''t be sold.', chosen_batch.batch_code, product.name;
      end if;

      if chosen_batch.quantity_remaining < line.quantity then
        raise exception 'Batch % of "%" only has % left.',
          chosen_batch.batch_code, product.name, chosen_batch.quantity_remaining;
      end if;

      -- The whole line is 15% off if this batch is near expiry, otherwise
      -- it's full price.
      if chosen_batch.expiry_date > today
         and chosen_batch.expiry_date <= today + near_expiry_days then
        line_price       := marked_down_price;
        markdown_savings := markdown_savings + (product.price - marked_down_price) * line.quantity;
      else
        line_price := product.price;
      end if;

      insert into public.order_items (order_id, product_id, quantity, unit_price, subtotal, batch_id)
      values (new_order_id, product.id, line.quantity, line_price, line_price * line.quantity, chosen_batch.id);

      cart_total := cart_total + line_price * line.quantity;
    else
      -- No batch chosen (self-serve): soonest expiry first, as before.
      --
      -- How many units of this product expire within the next 7 days (and
      -- haven't expired yet). Those sell at 15% off. Batches are used
      -- soonest-expiry first, so they're exactly the first units of this line.
      select coalesce(sum(b.quantity_remaining), 0)::integer
        into near_expiry_units
        from public.product_batches b
       where b.product_id = product.id
         and b.status = 'active'
         and b.quantity_remaining > 0
         and b.expiry_date > today
         and b.expiry_date <= today + near_expiry_days;

      marked_down_qty := least(line.quantity, near_expiry_units);
      full_price_qty  := line.quantity - marked_down_qty;

      -- Marked-down units first, so the batch trigger takes them out of the
      -- near-expiry batches; then the rest at the normal price.
      if marked_down_qty > 0 then
        insert into public.order_items (order_id, product_id, quantity, unit_price, subtotal)
        values (new_order_id, product.id, marked_down_qty, marked_down_price, marked_down_price * marked_down_qty);
      end if;

      if full_price_qty > 0 then
        insert into public.order_items (order_id, product_id, quantity, unit_price, subtotal)
        values (new_order_id, product.id, full_price_qty, product.price, product.price * full_price_qty);
      end if;

      cart_total       := cart_total + marked_down_price * marked_down_qty + product.price * full_price_qty;
      markdown_savings := markdown_savings + (product.price - marked_down_price) * marked_down_qty;
    end if;
  end loop;

  -- 4. Points discount and what's left to pay ---------------------------------
  -- Points can't push the bill below ₱0, and we don't let anyone burn more
  -- points than the bill needs. We round up so points can cover the last few
  -- pesos too (a ₱47 bill can be fully paid with 10 points, worth ₱50; the
  -- discount itself never goes above the bill).
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
    'final_amount',    amount_to_pay,
    'near_expiry_savings', markdown_savings
  );
end;
$function$;
