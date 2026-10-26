-- =============================================================================
-- Roles, and making every account a loyalty customer.
--
-- Builds on 20261017000000_role_profile_tables.sql, where users.role is one of:
--
--   'admin'    -> POS + Inventory + Loyalty & Rewards
--   'cashier'  -> POS only
--   'customer' -> loyalty member (the default for every new account)
--
-- The role only decides which screens you get. EVERY account in auth.users,
-- whatever its role (store owner and admins included), also has a loyalty
-- profile in public.customer, can earn and spend points, and is listed in the
-- Loyalty & Rewards tab.
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
-- setup_customer_account(): the one place that turns an account into a
-- loyalty customer. Used by the sign-up trigger, the login check and the
-- catch-up at the bottom of this file, so they can never disagree.
--
--   * No public.users row yet?  -> add one as a 'customer'
--   * No loyalty profile yet?   -> add one (with a loyalty ID)
--   * Already set up?           -> leave it alone. It never changes a role,
--                                  so admins and the store owner stay admins
--                                  and are customers at the same time.
--
-- Not callable from the app (it takes any user id), only by the functions below.
-- -----------------------------------------------------------------------------
create or replace function public.setup_customer_account(
  p_user_id  uuid,
  p_email    text,
  p_metadata jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- users.email is required, so accounts without one (e.g. phone-only) are skipped.
  if p_user_id is null or p_email is null then
    return;
  end if;

  insert into public.users (id, email, name)
  values (
    p_user_id,
    p_email,
    -- Google sign-ins send the person's name along. Use it if we have it.
    left(coalesce(p_metadata ->> 'full_name', p_metadata ->> 'name'), 255)
  )
  on conflict do nothing;

  -- The users_ensure_profiles trigger normally creates the loyalty profile when
  -- the users row is inserted, but older accounts may be missing it.
  --   * "exists": the insert above can be skipped in the rare case where an
  --     old row already uses this email, and a profile needs a users row.
  --   * "not exists": only insert when it's really missing. Otherwise every
  --     login would use up a loyalty ID number and the IDs would skip.
  insert into public.customer (user_id)
  select p_user_id
  where exists (select 1 from public.users where id = p_user_id)
    and not exists (select 1 from public.customer where user_id = p_user_id)
  on conflict (user_id) do nothing;
end;
$$;

revoke execute on function public.setup_customer_account(uuid, text, jsonb) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 1) The moment an account is created (email sign-up, Google, or added from
--    the Supabase dashboard), it becomes a customer.
--
-- If anything goes wrong here we only log a warning. A broken trigger on
-- auth.users would stop people from signing up at all, which is much worse
-- than setting them up a moment later at their first login (step 2).
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.setup_customer_account(new.id, new.email, new.raw_user_meta_data);
  exception when others then
    raise warning 'Could not set up customer account for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();


-- -----------------------------------------------------------------------------
-- 2) ensure_my_account(): the app calls this right after every login (see
--    src/lib/roles.ts) as a safety net. If the trigger above ever missed
--    someone, this sets them up.
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

  if found then
    perform public.setup_customer_account(me.id, me.email, me.raw_user_meta_data);
  end if;
end;
$$;

revoke execute on function public.ensure_my_account() from public, anon;
grant  execute on function public.ensure_my_account() to authenticated;


-- -----------------------------------------------------------------------------
-- 3) Catch up every account that already exists (all of auth.users, including
--    the store owner and admins), so they're in the Loyalty & Rewards list
--    straight away instead of on their next login.
-- -----------------------------------------------------------------------------
select public.setup_customer_account(id, email, raw_user_meta_data)
from auth.users;

-- Rows in public.users that were added by hand (not through sign-up) get a
-- loyalty profile too...
insert into public.customer (user_id)
select u.id from public.users u
where not exists (select 1 from public.customer c where c.user_id = u.id);

-- ...and every loyalty profile gets a loyalty ID.
update public.customer
   set loyalty_id = default
 where loyalty_id is null;
