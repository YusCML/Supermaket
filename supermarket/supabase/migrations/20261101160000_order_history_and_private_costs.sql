-- Order history that never changes, and product costs only admins can see.
--
-- 1. FROZEN ORDER LINES
--    Each order line (order_items) now keeps three facts from the moment of
--    sale: the product's normal price (list_price), what it cost the store
--    (unit_cost) and its name (product_name). Before, reports and receipts
--    looked these up from the products table, so editing a product's price or
--    cost later quietly changed past profit, and renaming it changed old
--    receipts. A trigger fills the three columns in automatically whenever a
--    line is saved, so the checkout function itself didn't need changing.
--    Sales made before this file was applied are filled in once with the
--    product's values as they are today (the best information there is).
--
-- 2. PROFIT & LOSS and 3. RECEIPTS now read those frozen values.
--
-- 4. COST IS ADMIN-ONLY
--    Signed-in users could read every column of products, including cost.
--    Now they can read every column EXCEPT cost (Postgres "column privileges"),
--    and admins get costs through get_product_costs(), which checks is_admin().
--    (get_product_inventory() also only fills in cost for admins; see
--    20261101150000.)


-- ── 1. Frozen order lines ───────────────────────────────────────────────────

alter table public.order_items
  add column if not exists list_price   numeric(10, 2),
  add column if not exists unit_cost    numeric(10, 2),
  add column if not exists product_name text;

-- Past sales: today's values, once.
update public.order_items oi
   set list_price   = coalesce(oi.list_price, p.price),
       unit_cost    = coalesce(oi.unit_cost, p.cost),
       product_name = coalesce(oi.product_name, p.name)
  from public.products p
 where p.id = oi.product_id;

-- Runs just BEFORE each new order line is saved and copies the product's
-- current price, cost and name onto it (unless they were given already).
-- Checkout has already locked the product row, so these are exactly the
-- values the sale used.
create or replace function public.snapshot_order_item_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  product record;
begin
  select p.price, p.cost, p.name
    into product
    from public.products p
   where p.id = new.product_id;

  new.list_price   := coalesce(new.list_price, product.price);
  new.unit_cost    := coalesce(new.unit_cost, product.cost);
  new.product_name := coalesce(new.product_name, product.name);
  return new;
end;
$$;

revoke execute on function public.snapshot_order_item_product() from public, anon, authenticated;

drop trigger if exists order_items_snapshot_product on public.order_items;
create trigger order_items_snapshot_product
  before insert on public.order_items
  for each row execute function public.snapshot_order_item_product();


-- ── 2. Profit & loss uses the frozen values ─────────────────────────────────
-- Same as 20261101120000 except the sold_items part.

create or replace function public.profit_and_loss_between(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
set timezone = 'UTC'
as $$
  with sales as (
    select coalesce(sum(o.final_amount), 0)    as revenue,
           coalesce(sum(o.discount_amount), 0) as points_discount,
           count(*)::integer                   as orders
      from public.orders o
     where o.created_at::timestamptz >= p_from
       and o.created_at::timestamptz <  p_to
  ),
  sold_items as (
    -- order_items.unit_price is the price that was charged. If it is below the
    -- normal price AT THE TIME OF SALE (list_price), that line was sold at the
    -- near-expiry markdown. unit_cost is what the item cost the store at the
    -- time of sale. Both are frozen on each order line (see part 1), so later
    -- price or cost edits don't rewrite past profit. The coalesce(..., p.x) is
    -- only a safety net for a line that somehow has no frozen value.
    select coalesce(sum(oi.quantity * coalesce(oi.unit_cost, p.cost)), 0) as cost_of_goods,
           coalesce(sum(greatest(coalesce(oi.list_price, p.price) - oi.unit_price, 0) * oi.quantity), 0)
             as near_expiry_discount
      from public.order_items oi
      join public.orders   o on o.id = oi.order_id
      join public.products p on p.id = oi.product_id
     where o.created_at::timestamptz >= p_from
       and o.created_at::timestamptz <  p_to
  ),
  losses as (
    -- Every unit removed without being sold is logged in spoilage_logs with
    -- its cost: 'expired' by expiry processing, 'damaged' / 'spoiled' by an
    -- admin's write-off.
    select coalesce(sum(s.loss_amount) filter (where s.kind = 'expired'), 0) as expired,
           coalesce(sum(s.loss_amount) filter (where s.kind = 'spoiled'), 0) as spoiled,
           coalesce(sum(s.loss_amount) filter (where s.kind = 'damaged'), 0) as damaged
      from public.spoilage_logs s
     where s.expired_at >= p_from
       and s.expired_at <  p_to
  )
  select jsonb_build_object(
           'orders',               sales.orders,
           'revenue',              sales.revenue,
           'cost_of_goods',        sold_items.cost_of_goods,
           'gross_profit',         sales.revenue - sold_items.cost_of_goods,
           'near_expiry_discount', sold_items.near_expiry_discount,
           'points_discount',      sales.points_discount,
           'expired_loss',         losses.expired,
           'spoiled_loss',         losses.spoiled,
           'damaged_loss',         losses.damaged,
           'total_losses',         losses.expired + losses.spoiled + losses.damaged,
           'net_profit',           sales.revenue - sold_items.cost_of_goods
                                     - (losses.expired + losses.spoiled + losses.damaged)
         )
    from sales, sold_items, losses;
$$;


-- ── 3. Receipts use the frozen values ───────────────────────────────────────
-- The live process_pos_checkout() as it was on 2026-11-01, with only the
-- product price / name lookups changed to prefer the frozen values.

CREATE OR REPLACE FUNCTION public.process_pos_checkout(p_cart_items jsonb, p_customer_id uuid DEFAULT NULL::uuid, p_points_redeemed integer DEFAULT 0, p_payment_method text DEFAULT 'Cash'::text, p_cash_received numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  checkout_result jsonb;
  receipt_data jsonb;
  saved_order_id bigint;
begin
  checkout_result := public.process_pos_checkout_base(
    p_cart_items,
    p_customer_id,
    p_points_redeemed,
    p_payment_method
  );
  saved_order_id := (checkout_result ->> 'order_id')::bigint;

  select jsonb_build_object(
    'created_at', o.created_at,
    'member_name', coalesce(nullif(u.name, ''), u.email),
    'member_email', u.email,
    'member_loyalty_id', c.loyalty_id,
    'points_balance', c.loyalty_points,
    'subtotal', coalesce(sum(coalesce(oi.list_price, p.price) * oi.quantity), 0),
    'near_expiry_savings', coalesce((checkout_result ->> 'near_expiry_savings')::numeric, 0),
    'total_amount', o.total_amount,
    'points_discount', coalesce(o.discount_amount, 0),
    'total_paid', o.final_amount,
    'payment_method', o.payment_method,
    'cash_received', case when o.payment_method = 'Cash' then p_cash_received else null end,
    'change', case
      when o.payment_method = 'Cash' then round(p_cash_received - o.final_amount, 2)
      else null
    end,
    'items', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'product_name', coalesce(oi.product_name, p.name),
          'quantity', oi.quantity,
          'unit_price', oi.unit_price,
          'subtotal', oi.subtotal,
          'original_unit_price', coalesce(oi.list_price, p.price),
          'near_expiry_discount',
            round((coalesce(oi.list_price, p.price) - oi.unit_price) * oi.quantity, 2),
          'near_expiry_percent_off',
            case when oi.unit_price < coalesce(oi.list_price, p.price) then 15 else 0 end,
          'batch_code', b.batch_code
        ) order by oi.id
      ) filter (where oi.id is not null),
      '[]'::jsonb
    )
  )
    into receipt_data
    from public.orders o
    join public.users u on u.id = o.customer_id
    join public.customer c on c.user_id = o.customer_id
    left join public.order_items oi on oi.order_id = o.id
    left join public.products p on p.id = oi.product_id
    left join public.product_batches b on b.id = oi.batch_id
   where o.id = saved_order_id
   group by o.id, u.name, u.email, c.loyalty_id, c.loyalty_points;

  if receipt_data is null then
    raise exception 'Checkout succeeded but the saved receipt could not be loaded.';
  end if;

  if p_payment_method = 'Cash'
     and (p_cash_received is null or p_cash_received < (receipt_data ->> 'total_paid')::numeric) then
    raise exception 'Cash received must cover the amount due (₱%).',
      (receipt_data ->> 'total_paid')::numeric;
  end if;

  return checkout_result || receipt_data;
end;
$function$;


-- ── 4. Cost is admin-only ───────────────────────────────────────────────────

revoke select on public.products from anon, authenticated;
grant select (
  id, sku, barcode, name, category, price,
  stock_quantity, reorder_level, image_url, description,
  created_at, updated_at
) on public.products to authenticated;

-- What each product costs the store, for the admin's Inventory screen.
create or replace function public.get_product_costs()
returns table (id integer, cost numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can see product costs.';
  end if;

  return query
    select p.id::integer, p.cost
      from public.products p
     order by p.id;
end;
$$;

revoke execute on function public.get_product_costs() from public, anon;
grant  execute on function public.get_product_costs() to authenticated;
