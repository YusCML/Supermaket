-- Add loyalty_points to public.users and enforce NULL for admins
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS loyalty_points INTEGER;

UPDATE public.users
SET loyalty_points = 0
WHERE is_admin = FALSE
  AND loyalty_points IS NULL;

ALTER TABLE public.users
ADD CONSTRAINT users_loyalty_points_null_if_admin
CHECK (NOT is_admin OR loyalty_points IS NULL);

-- Auto-null loyalty_points for admins on write
CREATE OR REPLACE FUNCTION public.null_loyalty_for_admin()
RETURNS trigger AS $$
BEGIN
  IF NEW.is_admin THEN
    NEW.loyalty_points := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_null_loyalty_if_admin ON public.users;
CREATE TRIGGER users_null_loyalty_if_admin
BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.null_loyalty_for_admin();