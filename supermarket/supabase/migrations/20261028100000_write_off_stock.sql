alter table public.spoilage_logs
  add column kind text not null default 'expired'
    check (kind in ('expired', 'damaged', 'spoiled')),
  add column reason text not null default 'Expired by expiry processing'
    check (btrim(reason) <> '');

create or replace function public.write_off_stock(
  p_batch_id bigint,
  p_quantity integer,
  p_kind text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_batch record;
  selected_product record;
  remaining_after integer;
begin
  if not public.is_admin() then
    raise exception 'Only admins can write off stock.';
  end if;

  if p_batch_id is null or p_quantity is null or p_quantity <= 0 then
    raise exception 'Choose a batch and enter a quantity greater than zero.';
  end if;
  if p_kind is null or p_kind not in ('damaged', 'spoiled') then
    raise exception 'Write-off kind must be damaged or spoiled.';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Enter a reason for writing off this stock.';
  end if;

  select b.id, b.product_id, b.batch_code, b.quantity_remaining, b.status
    into selected_batch
    from public.product_batches b
   where b.id = p_batch_id;

  if not found then
    raise exception 'That batch no longer exists.';
  end if;

  select p.id, p.cost, p.stock_quantity
    into selected_product
    from public.products p
   where p.id = selected_batch.product_id
   for update;

  select b.id, b.product_id, b.batch_code, b.quantity_remaining, b.status
    into selected_batch
    from public.product_batches b
   where b.id = p_batch_id
   for update;

  if not found or selected_batch.product_id <> selected_product.id then
    raise exception 'That batch no longer exists.';
  end if;
  if selected_batch.status <> 'active' then
    raise exception 'Only active batches can be written off.';
  end if;
  if selected_batch.quantity_remaining < p_quantity then
    raise exception 'Batch % only has % units remaining.',
      selected_batch.batch_code, selected_batch.quantity_remaining;
  end if;
  if selected_product.stock_quantity < p_quantity then
    raise exception 'The product stock total is inconsistent with this batch.';
  end if;

  remaining_after := selected_batch.quantity_remaining - p_quantity;

  update public.product_batches
     set quantity_remaining = remaining_after,
         status = case when remaining_after = 0 then 'spoiled' else status end
   where id = p_batch_id;

  update public.products
     set stock_quantity = stock_quantity - p_quantity,
         updated_at = now()
   where id = selected_product.id;

  insert into public.spoilage_logs (
    batch_id, product_id, quantity, unit_cost, loss_amount, expired_at, kind, reason
  )
  values (
    p_batch_id,
    selected_product.id,
    p_quantity,
    selected_product.cost,
    p_quantity * selected_product.cost,
    now(),
    p_kind,
    btrim(p_reason)
  );

  return jsonb_build_object(
    'success', true,
    'batch_code', selected_batch.batch_code,
    'quantity_remaining', remaining_after
  );
end;
$$;

revoke execute on function public.write_off_stock(bigint, integer, text, text)
  from public, anon;
grant execute on function public.write_off_stock(bigint, integer, text, text)
  to authenticated;
