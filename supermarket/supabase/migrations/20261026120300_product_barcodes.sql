-- =============================================================================
-- Every product has a barcode (Feature 2: barcode lookup at the POS).
--
--   * barcode is required, can't be blank, and no two products can share one,
--     so a scan at the till always finds exactly one product.
--   * If a product is saved without a barcode, the database gives it an
--     in-store barcode automatically (see next_store_barcode() below).
--
-- Barcodes that are already filled in are left exactly as they are.
-- =============================================================================

create sequence if not exists public.store_barcode_seq;

-- -----------------------------------------------------------------------------
-- next_store_barcode(): makes a new in-store barcode, e.g. 2000000000015.
--
-- It uses the standard 13-digit EAN-13 format so any scanner can read it, and
-- starts with a "2". Barcodes starting with 2 are reserved for a store's own
-- use, so they can never clash with a manufacturer's barcode on real packaging.
-- -----------------------------------------------------------------------------
create or replace function public.next_store_barcode()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  first_12  text;
  total     integer;
  digit_no  integer;
  candidate text;
begin
  loop
    first_12 := '2' || lpad(nextval('public.store_barcode_seq')::text, 11, '0');

    -- The 13th digit is a check digit, so a scanner can tell when it misread
    -- the code. Rule: multiply the 12 digits by 1, 3, 1, 3, ... add them up,
    -- and the check digit is whatever brings the total to a multiple of 10.
    total := 0;
    for digit_no in 1..12 loop
      total := total + substr(first_12, digit_no, 1)::integer
                     * case when digit_no % 2 = 0 then 3 else 1 end;
    end loop;
    candidate := first_12 || ((10 - total % 10) % 10)::text;

    -- In the unlikely case someone already typed this exact number in by
    -- hand, skip it and try the next one.
    exit when not exists (select 1 from public.products where barcode = candidate);
  end loop;

  return candidate;
end;
$$;

-- Admins add products from the Inventory tab, and the column default below
-- runs as them, so they need to be allowed to call it.
revoke execute on function public.next_store_barcode() from public, anon;
grant  execute on function public.next_store_barcode() to authenticated;


-- Clean up what's already there: stray spaces would stop a scan from matching,
-- and any product without a barcode gets an in-store one.
update public.products
   set barcode = btrim(barcode)
 where barcode <> btrim(barcode);

update public.products
   set barcode = public.next_store_barcode()
 where barcode is null or barcode = '';

-- From now on: always filled in (automatically if left out), never blank,
-- never shared between two products.
alter table public.products
  alter column barcode set default public.next_store_barcode(),
  alter column barcode set not null;

alter table public.products drop constraint if exists products_barcode_not_blank;
alter table public.products
  add constraint products_barcode_not_blank check (btrim(barcode) <> '');

alter table public.products drop constraint if exists products_barcode_key;
alter table public.products
  add constraint products_barcode_key unique (barcode);
