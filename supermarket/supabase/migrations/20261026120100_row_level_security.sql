-- =============================================================================
-- Who can see and change what.
--
--   Admin    -> read everything, add/edit/delete products
--   Cashier  -> read products and loyalty members (needed at the till)
--   Customer -> read products and their own account / loyalty profile
--   Logged out -> nothing
--
-- Nobody writes orders, receipts or loyalty points directly from the browser.
-- A sale goes through process_pos_checkout() (next migration), which checks
-- everything itself. That way stock and points can't be edited from the
-- browser's dev tools.
-- =============================================================================

-- Start from a clean slate. Policies are OR-ed together, so a leftover
-- "allow everything" policy made in the dashboard would quietly cancel out the
-- rules below. Drop whatever is there and define the full set here.
do $$
declare
  existing record;
begin
  for existing in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('users', 'admin', 'cashier', 'customer',
                        'products', 'orders', 'order_items', 'loyalty_logs')
  loop
    execute format('drop policy %I on public.%I', existing.policyname, existing.tablename);
  end loop;
end;
$$;

alter table public.users        enable row level security;
alter table public.admin        enable row level security;
alter table public.cashier      enable row level security;
alter table public.customer     enable row level security;
alter table public.products     enable row level security;
alter table public.orders       enable row level security;
alter table public.order_items  enable row level security;
alter table public.loyalty_logs enable row level security;


-- -----------------------------------------------------------------------------
-- Table-level permissions. Row-level security only filters rows, so the role
-- still needs basic access to the table. New Supabase projects no longer hand
-- these out automatically, so we spell them out.
-- -----------------------------------------------------------------------------
revoke all on public.users, public.admin, public.cashier, public.customer,
              public.products, public.orders, public.order_items, public.loyalty_logs
  from anon;

grant select on public.users, public.admin, public.cashier, public.customer,
                public.products, public.orders, public.order_items, public.loyalty_logs
  to authenticated;

-- Admins manage the catalog from the Inventory tab.
grant insert, update, delete on public.products to authenticated;

-- Roles, loyalty points, orders and the points log are never written from the
-- browser. In particular, nobody gets to change their own role.
revoke insert, update, delete on public.users, public.admin, public.cashier, public.customer,
                                 public.orders, public.order_items, public.loyalty_logs
  from authenticated;

-- Needed so admins can insert products (the id column uses a sequence).
grant usage, select on all sequences in schema public to authenticated;


-- users / customer (loyalty profiles) --------------------------------------------
-- Everyone can see their own account (that's how the app knows which tabs to
-- show). Staff can see everyone, so the POS can look members up by phone or
-- loyalty ID and show their name and points.
create policy "See your own account, staff see everyone"
  on public.users for select to authenticated
  using (id = auth.uid() or public.is_staff());

create policy "See your own loyalty profile, staff see everyone"
  on public.customer for select to authenticated
  using (user_id = auth.uid() or public.is_staff());


-- admin / cashier profile tables -----------------------------------------------
create policy "See your own admin profile, admins see all"
  on public.admin for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "See your own cashier profile, admins see all"
  on public.cashier for select to authenticated
  using (user_id = auth.uid() or public.is_admin());


-- products ----------------------------------------------------------------------
create policy "Anyone signed in can view products"
  on public.products for select to authenticated
  using (true);

create policy "Admins can add products"
  on public.products for insert to authenticated
  with check (public.is_admin());

create policy "Admins can edit products"
  on public.products for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can delete products"
  on public.products for delete to authenticated
  using (public.is_admin());


-- sales history and the points log ----------------------------------------------
-- Read-only, admins only. For anyone else these just come back empty.
create policy "Admins can view orders"
  on public.orders for select to authenticated
  using (public.is_admin());

create policy "Admins can view order items"
  on public.order_items for select to authenticated
  using (public.is_admin());

create policy "Admins can view the loyalty log"
  on public.loyalty_logs for select to authenticated
  using (public.is_admin());
