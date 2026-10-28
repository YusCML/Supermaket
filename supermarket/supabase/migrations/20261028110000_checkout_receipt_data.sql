-- Keep the existing checkout implementation as the transaction authority,
-- then enrich its result from the rows it just saved for the receipt.
alter function public.process_pos_checkout(jsonb, uuid, integer, text)
  rename to process_pos_checkout_base;

revoke execute on function public.process_pos_checkout_base(jsonb, uuid, integer, text)
  from public, anon, authenticated;

create function public.process_pos_checkout(
  p_cart_items jsonb,
  p_customer_id uuid default null,
  p_points_redeemed integer default 0,
  p_payment_method text default 'Cash',
  p_cash_received numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  checkout_result jsonb;
  receipt_data jsonb;
  saved_order_id bigint;
begin
  checkout_result := public.process_pos_checkout_base(
    p_cart_items,
    p_customer_id,
    p_points_redeemed,
    p_payment_method
  );
  saved_order_id := (checkout_result ->> 'order_id')::bigint;

  select jsonb_build_object(
    'created_at', o.created_at,
    'member_name', coalesce(nullif(u.name, ''), u.email),
    'member_email', u.email,
    'member_loyalty_id', c.loyalty_id,
    'points_balance', c.loyalty_points,
    'subtotal', coalesce(sum(p.price * oi.quantity), 0),
    'near_expiry_savings', coalesce((checkout_result ->> 'near_expiry_savings')::numeric, 0),
    'total_amount', o.total_amount,
    'points_discount', coalesce(o.discount_amount, 0),
    'total_paid', o.final_amount,
    'payment_method', o.payment_method,
    'cash_received', case when o.payment_method = 'Cash' then p_cash_received else null end,
    'change', case
      when o.payment_method = 'Cash' then round(p_cash_received - o.final_amount, 2)
      else null
    end,
    'items', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'product_name', p.name,
          'quantity', oi.quantity,
          'unit_price', oi.unit_price,
          'subtotal', oi.subtotal,
          'original_unit_price', p.price,
          'near_expiry_discount',
            round((p.price - oi.unit_price) * oi.quantity, 2),
          'near_expiry_percent_off',
            case when oi.unit_price < p.price then 15 else 0 end,
          'batch_code', b.batch_code
        ) order by oi.id
      ) filter (where oi.id is not null),
      '[]'::jsonb
    )
  )
    into receipt_data
    from public.orders o
    join public.users u on u.id = o.customer_id
    join public.customer c on c.user_id = o.customer_id
    left join public.order_items oi on oi.order_id = o.id
    left join public.products p on p.id = oi.product_id
    left join public.product_batches b on b.id = oi.batch_id
   where o.id = saved_order_id
   group by o.id, u.name, u.email, c.loyalty_id, c.loyalty_points;

  if receipt_data is null then
    raise exception 'Checkout succeeded but the saved receipt could not be loaded.';
  end if;

  if p_payment_method = 'Cash'
     and (p_cash_received is null or p_cash_received < (receipt_data ->> 'total_paid')::numeric) then
    raise exception 'Cash received must cover the amount due (₱%).',
      (receipt_data ->> 'total_paid')::numeric;
  end if;

  return checkout_result || receipt_data;
end;
$$;

revoke execute on function public.process_pos_checkout(jsonb, uuid, integer, text, numeric)
  from public, anon;
grant execute on function public.process_pos_checkout(jsonb, uuid, integer, text, numeric)
  to authenticated;
