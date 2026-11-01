-- A short, optional description for each product (e.g. "Fresh full-cream
-- milk, 1 litre"). It's shown under the product's name and picture on the
-- POS menu. Existing products simply have none until an admin adds one.
--
-- Admins set it from Inventory (Add New Product / Edit). The existing
-- row-level-security rules on products already decide who can write it.

alter table public.products
  add column if not exists description text
    check (description is null or char_length(description) <= 300);
