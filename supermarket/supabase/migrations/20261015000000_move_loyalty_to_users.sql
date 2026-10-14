-- Move loyalty ownership from customers to users (discard customer data)

-- 1. Extend public.users for loyalty members
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS name VARCHAR(255);

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS loyalty_id VARCHAR(50);

-- Unique loyalty IDs (multiple NULLs allowed for admins/non-members)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_loyalty_id_key'
  ) THEN
    ALTER TABLE public.users
    ADD CONSTRAINT users_loyalty_id_key UNIQUE (loyalty_id);
  END IF;
END $$;

-- 2. Keep admin-only loyalty fields null automatically
CREATE OR REPLACE FUNCTION public.null_admin_loyalty_fields()
RETURNS trigger AS $$
BEGIN
  IF NEW.is_admin THEN
    NEW.loyalty_points := NULL;
    NEW.loyalty_id := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_null_loyalty_if_admin ON public.users;
DROP TRIGGER IF EXISTS users_null_admin_loyalty_fields ON public.users;
CREATE TRIGGER users_null_admin_loyalty_fields
BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.null_admin_loyalty_fields();

-- 3. Detach existing customer-owned history before dropping customers
UPDATE public.orders
SET customer_id = NULL;

DELETE FROM public.loyalty_logs;

-- 4. Repoint orders.customer_id from customers(id) to users(id), keep column name
ALTER TABLE public.orders
DROP CONSTRAINT IF EXISTS orders_customer_id_fkey;

ALTER TABLE public.orders
ALTER COLUMN customer_id TYPE UUID USING NULL::uuid;

ALTER TABLE public.orders
ADD CONSTRAINT orders_customer_id_fkey
FOREIGN KEY (customer_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- 5. Repoint loyalty_logs.customer_id from customers(id) to users(id), keep column name
ALTER TABLE public.loyalty_logs
DROP CONSTRAINT IF EXISTS loyalty_log_customer_id_fkey;

ALTER TABLE public.loyalty_logs
ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE public.loyalty_logs
ALTER COLUMN customer_id TYPE UUID USING NULL::uuid;

ALTER TABLE public.loyalty_logs
ALTER COLUMN customer_id SET NOT NULL;

ALTER TABLE public.loyalty_logs
ADD CONSTRAINT loyalty_logs_customer_id_fkey
FOREIGN KEY (customer_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 6. Discard the customers table
DROP TABLE IF EXISTS public.customers CASCADE;