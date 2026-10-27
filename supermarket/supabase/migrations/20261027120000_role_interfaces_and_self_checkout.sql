-- =============================================================================
-- Multiple roles per person, one interface per role, admins manage roles,
-- cashiers get read-only stock, and customers can check themselves out.
--
-- A person can now have any mix of roles. What they hold is simply which
-- profile tables they have a row in:
--
--   public.customer -> Customer: self-serve checkout on your own account.
--                      EVERYONE has this (it's also their loyalty profile),
--                      and it is never removed.
--   public.cashier  -> Cashier: ring up sales for any member at the till,
--                      view stock levels (read only, no restocking).
--   public.admin    -> Admin: restock, catalog, loyalty log, analytics,
--                      and assigning roles. Admins can also work the till.
--
-- After logging in, the app asks which of their roles to continue as (see
-- src/lib/roles.ts). Roles are assigned on the admin page, Users & Roles tab,
-- which calls set_user_roles() below.
--
-- users.role is kept up to date as the person's highest role, for anything
-- that still reads it, but it no longer decides permissions.
--
-- Restocking was already admin-only and stays that way: receive_stock() and
-- process_expired_batches() check is_admin(), and only admins may insert or
-- update products (row-level security migration).
--
-- Safe to run more than once (e.g. pasted into the SQL editor first and
-- pushed with `supabase db push` later).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) One-time catch-up: make the admin/cashier tables match users.role.
--
-- Until now users.role was the real answer, and the profile tables could be
-- out of date (e.g. someone demoted by hand still has an admin row). Since the
-- tables become the real answer below, line them up first:
--   * remove rows that don't match users.role,
--   * add rows that are missing,
--   * admins could always work the till, so they also get Cashier and lose
--     nothing. It can be unticked later in Users & Roles.
--
-- Only on the first run (set_user_roles doesn't exist yet). Running it again
-- later would undo role changes made since, because users.role can only hold
-- one role.
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.set_user_roles(uuid, text[])') is null then
    delete from public.admin a
     where not exists (select 1 from public.users u
                        where u.id = a.user_id and u.role = 'admin');

    delete from public.cashier c
     where not exists (select 1 from public.users u
                        where u.id = c.user_id and u.role in ('cashier', 'admin'));

    insert into public.admin (user_id)
    select id from public.users where role = 'admin'
    on conflict (user_id) do nothing;

    insert into public.cashier (user_id)
    select id from public.users where role in ('cashier', 'admin')
    on conflict (user_id) do nothing;
  end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- 2) is_admin() / is_staff() now read the profile tables.
--
-- Every security rule and checkout check goes through these two, so this is
-- the switch that makes multiple roles real. Same names and arguments as
-- before, so nothing that calls them has to change (and their grants stay).
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin a where a.user_id = auth.uid());
$$;

-- "Staff" = anyone who can work the till: cashiers, and admins too.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin   a where a.user_id = auth.uid())
      or exists (select 1 from public.cashier c where c.user_id = auth.uid());
$$;


-- -----------------------------------------------------------------------------
-- 3) set_user_roles(): the Users & Roles tab calls this with the full list of
--    roles the person should have, e.g. '{customer,cashier}'.
--
-- Nobody can write the users / admin / cashier tables from the browser, so
-- this function is the only way in, and it checks the caller is an admin.
-- -----------------------------------------------------------------------------
drop function if exists public.set_user_role(uuid, text);  -- single-role version from an earlier draft

create or replace function public.set_user_roles(
  p_user_id uuid,
  p_roles   text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted        text[]  := coalesce(p_roles, '{}');
  wants_admin   boolean := 'admin'   = any(wanted);
  wants_cashier boolean := 'cashier' = any(wanted);
begin
  -- Handle one role change at a time, store-wide. Otherwise two admins
  -- removing each other's admin role at the same moment could both succeed
  -- and leave the store with no admin.
  perform pg_advisory_xact_lock(hashtext('public.set_user_roles'));

  if not public.is_admin() then
    raise exception 'Only admins can change roles.';
  end if;

  if exists (select 1 from unnest(wanted) as r
              where r not in ('customer', 'cashier', 'admin')) then
    raise exception 'Unknown role in %', wanted;
  end if;

  perform 1 from public.users where id = p_user_id;
  if not found then
    raise exception 'That account no longer exists.';
  end if;

  -- You can't take away your own admin role. That stops anyone locking
  -- themselves out by accident, and means the store always keeps at least one
  -- admin: the last one is the only person who could remove it, and they
  -- aren't allowed to. (Your own Cashier role you can change freely.)
  if p_user_id = auth.uid() and not wants_admin then
    raise exception 'You can''t remove your own admin role. Ask another admin to do it.';
  end if;

  if wants_admin then
    insert into public.admin (user_id) values (p_user_id) on conflict (user_id) do nothing;
  else
    delete from public.admin where user_id = p_user_id;
  end if;

  if wants_cashier then
    insert into public.cashier (user_id) values (p_user_id) on conflict (user_id) do nothing;
  else
    delete from public.cashier where user_id = p_user_id;
  end if;

  -- Customer can't be switched off: everyone keeps their loyalty profile.
  -- ("not exists" so we don't use up a loyalty ID number for nothing.)
  insert into public.customer (user_id)
  select p_user_id
   where not exists (select 1 from public.customer where user_id = p_user_id)
  on conflict (user_id) do nothing;

  -- Keep users.role as their highest role, for anything that still reads it.
  update public.users
     set role = case
                  when wants_admin   then 'admin'
                  when wants_cashier then 'cashier'
                  else 'customer'
                end
   where id = p_user_id;
end;
$$;

revoke execute on function public.set_user_roles(uuid, text[]) from public, anon;
grant  execute on function public.set_user_roles(uuid, text[]) to authenticated;


-- -----------------------------------------------------------------------------
-- 4) Cashiers can look at stock batches (the "Batch details" in the Stock
--    tab). Read only: nobody writes product_batches from the browser.
--    get_product_inventory() already lets any staff member read stock levels.
-- -----------------------------------------------------------------------------
drop policy if exists "Admins can view product batches" on public.product_batches;
drop policy if exists "Staff can view product batches" on public.product_batches;

create policy "Staff can view product batches"
  on public.product_batches for select to authenticated
  using (public.is_staff());


-- -----------------------------------------------------------------------------
-- 5) Self-checkout: let customers pay for their own shopping.
--
-- Same process_pos_checkout() as 20261026120200_secure_checkout.sql. The ONLY
-- change is the first check in step 1. Before, only staff could save a sale.
-- Now:
--   * staff (admin / cashier) can ring up a sale for any member, or for a
--     walk-in with no member, exactly as before;
--   * anyone else is at self-checkout, and the sale has to go on their own
--     account. So a customer can't spend somebody else's points, and can't
--     earn points onto somebody else's account either.
--
-- Everything else (database prices, stock checks, points rules) is unchanged.
-- -----------------------------------------------------------------------------
create or replace function public.process_pos_checkout(
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

-- Unchanged: only signed-in users can call it, and step 1 decides what they
-- may do with it.
revoke execute on function public.process_pos_checkout(jsonb, uuid, integer, text) from public, anon;
grant  execute on function public.process_pos_checkout(jsonb, uuid, integer, text) to authenticated;
