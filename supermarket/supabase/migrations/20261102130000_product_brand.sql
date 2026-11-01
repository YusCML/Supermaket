-- =============================================================================
-- Products get a brand (e.g. "Bear Brand", "Nescafé", "Gardenia").
--
-- Shown in Inventory, on the POS menu and in the product details pop-up, and
-- searchable at the till. Required in the Add / Edit product forms; the
-- column itself allows null so products saved before this keep working.
-- At most 60 characters, and never just spaces.
-- =============================================================================

alter table public.products
  add column if not exists brand text;

alter table public.products
  drop constraint if exists products_brand_check;

alter table public.products
  add constraint products_brand_check
  check (brand is null or (btrim(brand) <> '' and char_length(brand) <= 60));

-- Who may read it. Since 20261101160000 signed-in users may only read the
-- products columns they're given one by one (so `cost` stays admin-only), so
-- the new column has to be added to that list. Adding and changing products
-- is allowed table-wide (and row-level security keeps that to admins), which
-- already covers new columns.
grant select (brand) on public.products to authenticated;
