-- Convert users to role-based profiles; move loyalty fields into customer

-- 1. Create profile tables
CREATE TABLE IF NOT EXISTS public.admin (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cashier (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.customer (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
    loyalty_id VARCHAR(50) UNIQUE,
    loyalty_points INT NOT NULL DEFAULT 0 CHECK (loyalty_points >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add role to users, defaulting existing users to customer
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'customer';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_role_check'
  ) THEN
    ALTER TABLE public.users
    ADD CONSTRAINT users_role_check
    CHECK (role IN ('admin', 'cashier', 'customer'));
  END IF;
END $$;

-- 3. Convert old is_admin values to role when that column still exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_admin'
  ) THEN
    UPDATE public.users SET role = 'admin' WHERE is_admin IS TRUE;
    ALTER TABLE public.users DROP COLUMN is_admin;
  END IF;
END $$;

-- 4. Backfill customer loyalty profiles from old users columns, then drop those columns
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'loyalty_id'
  ) THEN
    INSERT INTO public.customer (user_id, loyalty_id, loyalty_points)
    SELECT
      id,
      loyalty_id,
      COALESCE(loyalty_points, 0)
    FROM public.users
    ON CONFLICT (user_id) DO UPDATE
      SET loyalty_id = EXCLUDED.loyalty_id,
          loyalty_points = EXCLUDED.loyalty_points;

    ALTER TABLE public.users DROP COLUMN IF EXISTS loyalty_points;
    ALTER TABLE public.users DROP COLUMN IF EXISTS loyalty_id;
  END IF;
END $$;

-- 5. Every user has customer benefits
INSERT INTO public.customer (user_id)
SELECT id FROM public.users
ON CONFLICT (user_id) DO NOTHING;

-- 6. Create admin/cashier profiles for matching roles
INSERT INTO public.admin (user_id)
SELECT id FROM public.users WHERE role = 'admin'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.cashier (user_id)
SELECT id FROM public.users WHERE role = 'cashier'
ON CONFLICT (user_id) DO NOTHING;

-- 7. Triggers to keep profiles in sync
CREATE OR REPLACE FUNCTION public.ensure_user_profiles()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.customer (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  IF NEW.role = 'admin' THEN
    INSERT INTO public.admin (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  IF NEW.role = 'cashier' THEN
    INSERT INTO public.cashier (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_ensure_profiles ON public.users;
CREATE TRIGGER users_ensure_profiles
AFTER INSERT OR UPDATE OF role ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.ensure_user_profiles();

-- 8. Remove old loyalty-specific user constraints/triggers
DROP TRIGGER IF EXISTS users_null_loyalty_if_admin ON public.users;
DROP TRIGGER IF EXISTS users_null_admin_loyalty_fields ON public.users;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_loyalty_points_null_if_admin;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_loyalty_id_null_if_admin;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_loyalty_id_key;

-- 9. Ensure checkout function updates customer profiles
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
  v_points_earned := FLOOR(p_final_amount / 100)::integer;

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

  IF p_customer_id IS NOT NULL THEN
    UPDATE public.customer
    SET loyalty_points = GREATEST(0, COALESCE(loyalty_points, 0) - p_points_redeemed + v_points_earned)
    WHERE user_id = p_customer_id;

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