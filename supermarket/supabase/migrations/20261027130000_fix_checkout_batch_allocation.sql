-- =============================================================================
-- Fix: no sale could be completed after 20261026120500_fefo_checkout.sql.
--
-- When a receipt line is saved, the order_items_allocate_batches trigger takes
-- that quantity out of the product's batches (earliest expiry first) by
-- calling consume_product_batches(product_id integer, quantity integer).
--
-- But order_items.product_id is a BIGINT. Postgres only turns a bigint into an
-- integer by itself when you assign it to an integer column, not when it is
-- picking which function to call. So it went looking for
-- consume_product_batches(bigint, integer), found nothing, and raised
-- "function ... does not exist". That error cancelled the whole sale.
--
-- Fix: convert the id to integer ourselves. Product ids are nowhere near the
-- integer limit, and product_batches.product_id is an integer column anyway.
-- Nothing else changes.
-- =============================================================================
create or replace function public.allocate_order_item_to_batches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.consume_product_batches(new.product_id::integer, new.quantity);
  return new;
end;
$$;

-- Same as before: only the trigger uses this, never the browser.
revoke execute on function public.allocate_order_item_to_batches()
  from public, anon, authenticated;
