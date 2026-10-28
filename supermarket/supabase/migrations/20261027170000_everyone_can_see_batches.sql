-- =============================================================================
-- Everyone signed in can see stock batches (read only).
--
-- Customers at self-serve can now choose which batch they're buying from,
-- just like the till: e.g. take the 15% off near-expiry milk, or the batch
-- that keeps longer. For that they need to see each batch's code, how many
-- are left and when it expires.
--
-- Nothing else opens up: batches are still only created by admins (via
-- receive_stock), and only checkout and expiry processing take stock out.
-- Spoilage logs stay admin-only. Checkout already lets a customer pick a
-- batch, as long as the sale is on their own account.
-- =============================================================================
drop policy if exists "Staff can view product batches" on public.product_batches;
drop policy if exists "Anyone signed in can view product batches" on public.product_batches;

create policy "Anyone signed in can view product batches"
  on public.product_batches for select to authenticated
  using (true);
