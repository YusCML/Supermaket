-- Fixes found in a code review (2026-11-01).
--
-- 1. get_product_inventory() could be run by ANYONE, even people who aren't
--    signed in, so the public could download every product with its cost price.
--    (The live copy had been re-created by hand to add image_url, which lost
--    the permission rules from 20261027150000.) It's now for signed-in users only.
--
-- 2. The live copy's numbers were off:
--      near_expiry_count counted BATCHES, not units, and included sold-out batches.
--      It used the server's UTC date, not the Philippine date, so between
--      midnight and 8 a.m. Manila time "today" was still yesterday.
--      expired_quantity kept counting stock that had already been removed.
--    The screens use near_expiry_count as a number of units ("15% off · 12
--    expiring soon"), so this restores the intended rules from 20261027150000,
--    keeps image_url (product pictures), and keeps the exact columns the live
--    function already returns so nothing in the app changes shape.
--    `set search_path = ''` + table names with "public." stop anyone from
--    tricking this security-definer function into using look-alike tables.
--    It also only fills in the cost column for admins (see 20261101160000).
--
-- 3. receive_stock() accepted stock that expires TODAY, which checkout,
--    Inventory and the expiry job all treat as already expired. It now needs a
--    date after today (the app's form already asks for that).

create or replace function public.get_product_inventory()
returns table (
  id integer,
  sku text,
  barcode text,
  name text,
  category text,
  price numeric,
  cost numeric,
  stock_quantity integer,
  reorder_level integer,
  image_url text,
  available_quantity integer,
  expired_quantity integer,
  near_expiry_count integer,
  earliest_expiry_date date,
  has_expired_batches boolean,
  expires_soon boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with today as (
    -- The store's date (Philippine time), worked out once.
    select (now() at time zone 'Asia/Manila')::date as d
  )
  select p.id::integer,
         p.sku::text,
         p.barcode::text,
         p.name::text,
         p.category::text,
         p.price,
         -- What the product cost the store: admins only. Everyone else gets an
         -- empty value (customers and cashiers only ever need the price).
         case when public.is_admin() then p.cost end as cost,
         p.stock_quantity,
         p.reorder_level,
         p.image_url,
         -- Units that can still be sold: active and not past their date.
         coalesce(sum(b.quantity_remaining) filter (
           where b.status = 'active'
             and (b.expiry_date is null or b.expiry_date > today.d)
         ), 0)::integer as available_quantity,
         -- Units past their date that the expiry job hasn't removed yet.
         coalesce(sum(b.quantity_remaining) filter (
           where b.status = 'active'
             and b.expiry_date <= today.d
         ), 0)::integer as expired_quantity,
         -- UNITS expiring within the next 7 days (these sell at 15% off).
         coalesce(sum(b.quantity_remaining) filter (
           where b.status = 'active'
             and b.expiry_date > today.d
             and b.expiry_date <= today.d + 7
         ), 0)::integer as near_expiry_count,
         -- The soonest expiry date among batches that can still be sold.
         min(b.expiry_date) filter (
           where b.status = 'active'
             and b.quantity_remaining > 0
             and b.expiry_date > today.d
         ) as earliest_expiry_date,
         coalesce(bool_or(
           b.status = 'active'
           and b.quantity_remaining > 0
           and b.expiry_date <= today.d
         ), false) as has_expired_batches,
         coalesce(bool_or(
           b.status = 'active'
           and b.quantity_remaining > 0
           and b.expiry_date > today.d
           and b.expiry_date <= today.d + 7
         ), false) as expires_soon
    from public.products p
    cross join today
    left join public.product_batches b on b.product_id = p.id
   group by p.id, today.d
   order by p.id;
$$;

-- Signed-in users only (staff and customers need it for the POS).
revoke execute on function public.get_product_inventory() from public, anon;
grant  execute on function public.get_product_inventory() to authenticated;


-- receive_stock(): the live definition, with only the date rule changed
-- ("<" became "<=") and its message updated.
CREATE OR REPLACE FUNCTION public.receive_stock(p_product_id integer, p_quantity integer, p_expiry_date date, p_batch_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  new_batch_code text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can receive stock.';
  end if;
  if p_product_id is null or p_quantity is null or p_quantity <= 0 then
    raise exception 'Choose a product and enter a quantity greater than zero.';
  end if;
  if p_expiry_date is null
     or p_expiry_date <= (now() at time zone 'Asia/Manila')::date then
    raise exception 'The expiry date must be after today (stock that expires today is already expired).';
  end if;
  perform 1 from public.products where id = p_product_id for update;
  if not found then
    raise exception 'That product no longer exists.';
  end if;

  -- Always a generated code (p_batch_code is ignored). The loop skips any
  -- code that's somehow already taken, so it can never clash.
  loop
    new_batch_code := 'B-' || nextval('public.product_batch_code_seq')::text;
    exit when not exists (
      select 1 from public.product_batches where batch_code = new_batch_code
    );
  end loop;

  insert into public.product_batches (
    product_id, batch_code, quantity_received, quantity_remaining, expiry_date
  )
  values (p_product_id, new_batch_code, p_quantity, p_quantity, p_expiry_date);

  update public.products
     set stock_quantity = stock_quantity + p_quantity,
         updated_at = now()
   where id = p_product_id;

  return jsonb_build_object('success', true, 'batch_code', new_batch_code);
end;
$function$;
