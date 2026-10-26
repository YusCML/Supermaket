-- =============================================================================
-- Roles, and making sure everyone who logs in is a loyalty customer.
--
-- Builds on 20261017000000_role_profile_tables.sql, where users.role is one of:
--
--   'admin'    -> POS + Inventory + Loyalty & Rewards
--   'cashier'  -> POS only
--   'customer' -> loyalty member (the default for everyone who logs in)
--
-- Every account has a loyalty profile in public.customer, and that table is
-- what the Loyalty & Rewards tab lists.
--
-- There's no screen for changing roles yet. To promote someone, run this in
-- the Supabase SQL editor (the admin/cashier profile row is created for you
-- by the users_ensure_profiles trigger):
--
--   update public.users set role = 'cashier' where email = 'someone@example.com';
--   update public.users set role = 'admin'   where email = 'someone@example.com';
-- =============================================================================


-- -----------------------------------------------------------------------------
-- current_app_role(): the role of whoever is making this request.
-- is_admin() / is_staff(): yes/no shortcuts used by the security rules and the
-- checkout function.
--
-- They're SECURITY DEFINER so they can read public.users directly. Otherwise
-- the users table's own security rules would call them again, in a loop.
-- -----------------------------------------------------------------------------
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.role from public.users u where u.id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = 'admin', false);
$$;

-- "Staff" = anyone who can work the till.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() in ('admin', 'cashier'), false);
$$;

revoke execute on function public.current_app_role() from public, anon;
revoke execute on function public.is_admin()         from public, anon;
revoke execute on function public.is_staff()         from public, anon;
grant  execute on function public.current_app_role() to authenticated;
grant  execute on function public.is_admin()         to authenticated;
grant  execute on function public.is_staff()         to authenticated;


-- -----------------------------------------------------------------------------
-- Loyalty IDs: every member gets one automatically (LOY-000001, LOY-000002...)
-- so cashiers have something to look them up by, even if the customer never
-- gave a phone number.
-- -----------------------------------------------------------------------------
create sequence if not exists public.loyalty_id_seq;

-- If some members already have IDs like LOY-0042, start counting after the
-- highest one so we never hand out a number that's already taken.
select setval(
  'public.loyalty_id_seq',
  coalesce(
    (select max(substring(loyalty_id from '^LOY-([0-9]+)$')::bigint) from public.customer),
    0
  ) + 1,
  false
);

alter table public.customer
  alter column loyalty_id set default ('LOY-' || lpad(nextval('public.loyalty_id_seq')::text, 6, '0'));


-- -----------------------------------------------------------------------------
-- ensure_my_account(): "whoever just logged in is a customer".
--
-- The app calls this right after every login (see src/lib/roles.ts). If this
-- person doesn't have a public.users row yet, they get one as a 'customer',
-- and either way they end up with a loyalty profile. That's what makes them
-- show up in the Loyalty & Rewards tab.
--
-- Doing it at login (instead of with a trigger on sign-up) means it works no
-- matter how the account was created: email sign-up, Google, or added from
-- the dashboard. It never touches an existing role, so it can't be used to
-- promote yourself.
-- -----------------------------------------------------------------------------
create or replace function public.ensure_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me record;
begin
  select id, email, raw_user_meta_data
    into me
    from auth.users
   where id = auth.uid();

  -- Not logged in, or no email (users.email is required). Nothing to do.
  if not found or me.email is null then
    return;
  end if;

  insert into public.users (id, email, name)
  values (
    me.id,
    me.email,
    -- Google sign-ins send the person's name along. Use it if we have it.
    coalesce(me.raw_user_meta_data ->> 'full_name', me.raw_user_meta_data ->> 'name')
  )
  on conflict do nothing;

  -- The users_ensure_profiles trigger normally creates this when the users
  -- row is inserted, but older accounts may be missing it.
  --   * "exists": the insert above can be skipped in the rare case where an
  --     old row already uses this email, and a profile needs a users row.
  --   * "not exists": only insert when it's really missing. Otherwise every
  --     login would use up a loyalty ID number and the IDs would skip.
  insert into public.customer (user_id)
  select me.id
  where exists (select 1 from public.users where id = me.id)
    and not exists (select 1 from public.customer where user_id = me.id)
  on conflict (user_id) do nothing;
end;
$$;

revoke execute on function public.ensure_my_account() from public, anon;
grant  execute on function public.ensure_my_account() to authenticated;


-- -----------------------------------------------------------------------------
-- Catch up everyone who already has an account, so they show up in the
-- Loyalty tab right away instead of on their next login.
-- -----------------------------------------------------------------------------

-- Accounts with no public.users row yet become customers.
-- (Anyone already in public.users keeps their role.)
insert into public.users (id, email, name)
select id, email, coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name')
from auth.users
where email is not null
on conflict do nothing;

-- Everyone gets a loyalty profile...
insert into public.customer (user_id)
select u.id from public.users u
where not exists (select 1 from public.customer c where c.user_id = u.id);

-- ...and every loyalty profile gets a loyalty ID.
update public.customer
   set loyalty_id = default
 where loyalty_id is null;
