-- =============================================================================
-- Role helpers + making sure every account has a public.users row.
--
-- Builds on 20261017000000_role_profile_tables.sql, where users.role is one of:
--
--   'admin'    -> POS + Inventory + Loyalty & Rewards
--   'cashier'  -> POS only
--   'customer' -> loyalty member (the default for every new sign-up)
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
-- New sign-ups (email/password or Google) get a public.users row as a
-- 'customer'. The existing users_ensure_profiles trigger then gives them a
-- loyalty profile in public.customer, so they show up in the member lookup.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Some accounts (e.g. phone-only) have no email, and users.email is required.
  if new.email is null then
    return new;
  end if;

  insert into public.users (id, email, name)
  values (
    new.id,
    new.email,
    -- Google sign-ins send the person's name along. Use it if we have it.
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict do nothing;

  return new;
end;
$$;

-- If someone already set up their own sign-up trigger from the dashboard,
-- leave it alone rather than have two triggers fighting over the same row.
do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'auth.users'::regclass
      and not tgisinternal
      and tgname <> 'on_auth_user_created'
  ) then
    drop trigger if exists on_auth_user_created on auth.users;
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_auth_user();
  end if;
end;
$$;

-- Accounts created before this migration might not have a row yet. Add them
-- now (as customers; anyone already in public.users keeps their role).
insert into public.users (id, email)
select id, email
from auth.users
where email is not null
on conflict do nothing;
