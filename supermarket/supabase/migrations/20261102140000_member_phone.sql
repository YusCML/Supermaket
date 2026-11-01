-- =============================================================================
-- Members' phone numbers can be saved, so the POS can look members up by
-- phone (the project spec: "Search customers at checkout using their phone
-- number or loyalty ID").
--
-- The `users` table only has a read policy, so nobody could set a phone
-- before. Instead of opening the whole table to updates, this one checked
-- function changes just the phone:
--   set_member_phone(p_user_id, p_phone)
--     - staff (cashiers and admins) may set any member's phone; anyone may
--       set their own;
--     - spaces, dashes and brackets are ignored; +639… is turned into 09…;
--     - it must be a Philippine mobile number: 09 followed by 9 digits;
--     - an empty phone removes it;
--     - two members can't share a number (the lookup must find ONE member).
--   Returns the phone as saved (e.g. '09171234567'), or null when removed.
-- =============================================================================

create or replace function public.set_member_phone(p_user_id uuid, p_phone text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean text;
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.';
  end if;

  if not (public.is_staff() or p_user_id = auth.uid()) then
    raise exception 'You can only change your own phone number.';
  end if;

  -- "0917 123-4567" -> "09171234567"; "+63 917 123 4567" -> "09171234567".
  clean := regexp_replace(coalesce(p_phone, ''), '[[:space:]()-]', '', 'g');
  if clean ~ '^\+639[0-9]{9}$' then
    clean := '0' || substr(clean, 4);
  end if;

  if clean = '' then
    update public.users set phone = null where id = p_user_id;
    if not found then
      raise exception 'That member no longer exists.';
    end if;
    return null;
  end if;

  if clean !~ '^09[0-9]{9}$' then
    raise exception 'Enter a mobile number like 0917 123 4567.';
  end if;

  if exists (select 1 from public.users where phone = clean and id <> p_user_id) then
    raise exception 'Another member already uses that phone number.';
  end if;

  update public.users set phone = clean where id = p_user_id;
  if not found then
    raise exception 'That member no longer exists.';
  end if;

  return clean;
end;
$$;

revoke execute on function public.set_member_phone(uuid, text) from public, anon;
grant execute on function public.set_member_phone(uuid, text) to authenticated;
