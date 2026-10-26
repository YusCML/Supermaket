-- Lock products before batches in both checkout and expiry processing. This
-- makes concurrent stock changes follow one lock order and prevents oversells.
create or replace function public._process_expired_batches()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  processed_count integer;
begin
  perform p.id
    from public.products p
   where exists (
     select 1 from public.product_batches b
      where b.product_id = p.id
        and b.status = 'active'
        and b.quantity_remaining > 0
        and b.expiry_date <= (now() at time zone 'Asia/Manila')::date
   )
   order by p.id
   for update;

  with expired as (
    select b.id, b.product_id, b.quantity_remaining
      from public.product_batches b
     where b.status = 'active'
       and b.quantity_remaining > 0
       and b.expiry_date <= (now() at time zone 'Asia/Manila')::date
     order by b.product_id, b.id
     for update skip locked
  ), marked as (
    update public.product_batches b
       set quantity_remaining = 0,
           status = 'expired',
           expired_at = now()
      from expired e
     where b.id = e.id
    returning e.id, e.product_id, e.quantity_remaining
  )
  insert into public.spoilage_logs (
    batch_id, product_id, quantity, unit_cost, loss_amount, expired_at
  )
  select e.id, e.product_id, e.quantity_remaining, p.cost,
         e.quantity_remaining * p.cost, now()
    from marked e
    join public.products p on p.id = e.product_id;

  get diagnostics processed_count = row_count;

  update public.products p
     set stock_quantity = coalesce((
           select sum(b.quantity_remaining)::integer
             from public.product_batches b
            where b.product_id = p.id and b.status = 'active'
              and (b.expiry_date is null
                or b.expiry_date > (now() at time zone 'Asia/Manila')::date)
         ), 0),
         updated_at = now()
   where p.stock_quantity is distinct from coalesce((
           select sum(b.quantity_remaining)::integer
             from public.product_batches b
            where b.product_id = p.id and b.status = 'active'
              and (b.expiry_date is null
                or b.expiry_date > (now() at time zone 'Asia/Manila')::date)
         ), 0);

  return processed_count;
end;
$$;

create or replace function public.consume_product_batches(
  p_product_id integer,
  p_quantity integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch record;
  available integer;
  remaining integer := p_quantity;
  taken integer;
begin
  select coalesce(sum(b.quantity_remaining), 0)::integer
    into available
    from public.product_batches b
   where b.product_id = p_product_id
     and b.status = 'active'
     and b.quantity_remaining > 0
     and (b.expiry_date is null
       or b.expiry_date > (now() at time zone 'Asia/Manila')::date);

  if available < p_quantity then
    raise exception 'Not enough unexpired stock for product #%: only % available.',
      p_product_id, available;
  end if;

  for batch in
    select b.id, b.quantity_remaining
      from public.product_batches b
     where b.product_id = p_product_id
       and b.status = 'active'
       and b.quantity_remaining > 0
       and (b.expiry_date is null
         or b.expiry_date > (now() at time zone 'Asia/Manila')::date)
     order by b.expiry_date asc nulls last, b.received_at, b.id
     for update
  loop
    taken := least(batch.quantity_remaining, remaining);
    update public.product_batches
       set quantity_remaining = quantity_remaining - taken
     where id = batch.id;

    remaining := remaining - taken;
    exit when remaining = 0;
  end loop;
end;
$$;

create or replace function public.allocate_order_item_to_batches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.consume_product_batches(new.product_id, new.quantity);
  return new;
end;
$$;

drop trigger if exists order_items_allocate_batches on public.order_items;
create trigger order_items_allocate_batches
  after insert on public.order_items
  for each row execute function public.allocate_order_item_to_batches();

revoke execute on function public.consume_product_batches(integer, integer)
  from public, anon, authenticated;
revoke execute on function public.allocate_order_item_to_batches()
  from public, anon, authenticated;
