-- Update POS checkout RPC to use public.users UUIDs and the users.loyalty_points column
CREATE OR REPLACE FUNCTION public.process_pos_checkout(
  p_customer_id uuid,
  p_total_amount numeric,
  p_discount_amount numeric,
  p_final_amount numeric,
  p_payment_method character varying,
  p_points_redeemed integer,
  p_cart_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_order_id bigint;
  item jsonb;
  v_qty integer;
  v_price numeric;
  v_subtotal numeric;
  v_points_earned integer;
BEGIN
  -- 1. Adjust earned points formula here.
  v_points_earned := FLOOR(p_final_amount / 100)::integer;

  -- 2. Insert into orders table
  INSERT INTO public.orders (
    customer_id,
    total_amount,
    discount_amount,
    final_amount,
    payment_method,
    points_redeemed
  )
  VALUES (
    p_customer_id,
    p_total_amount,
    p_discount_amount,
    p_final_amount,
    p_payment_method,
    p_points_redeemed
  )
  RETURNING id INTO v_order_id;

  -- 3. Process cart items
  FOR item IN SELECT * FROM jsonb_array_elements(p_cart_items)
  LOOP
    v_qty := COALESCE((item->>'quantity')::integer, 1);
    v_price := COALESCE((item->>'price')::numeric, (item->>'unit_price')::numeric, 0);
    v_subtotal := v_qty * v_price;

    INSERT INTO public.order_items (
      order_id, product_id, quantity, unit_price, subtotal
    )
    VALUES (
      v_order_id, (item->>'id')::bigint, v_qty, v_price, v_subtotal
    );

    UPDATE public.products
    SET stock_quantity = stock_quantity - v_qty
    WHERE id = (item->>'id')::bigint;
  END LOOP;

  -- 4. Update loyalty points and log audit history
  IF p_customer_id IS NOT NULL THEN
    UPDATE public.users
    SET loyalty_points = GREATEST(0, COALESCE(loyalty_points, 0) - p_points_redeemed + v_points_earned)
    WHERE id = p_customer_id;

    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'loyalty_logs') THEN
      IF p_points_redeemed > 0 THEN
        INSERT INTO public.loyalty_logs (customer_id, order_id, type, points_changed)
        VALUES (p_customer_id, v_order_id, 'REDEEMED', -p_points_redeemed);
      END IF;

      IF v_points_earned > 0 THEN
        INSERT INTO public.loyalty_logs (customer_id, order_id, type, points_changed)
        VALUES (p_customer_id, v_order_id, 'EARNED', v_points_earned);
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'points_earned', v_points_earned
  );
END;
$function$;