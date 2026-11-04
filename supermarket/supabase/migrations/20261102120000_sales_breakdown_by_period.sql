-- =============================================================================
-- Sales breakdown for any period (Analytics tab). Two functions:
--   get_sales_breakdown()     payment mix + top products for a range
--   get_profit_loss_series()  profit & loss for a range, hour by hour, day by
--                             day or month by month (further down)
--
-- The Analytics tab has one Day / Week / Month switch that drives the whole
-- page, and the admin can click a single day, week or month to focus on it.
-- The profit & loss numbers per period already come from
-- get_admin_sales_analytics(). This adds the two cards that used to be fixed
-- to "this year": the payment mix and the top products. The page asks for
-- whatever range is showing (the last 30 days, one day, one week, …).
--
-- get_sales_breakdown(p_from, p_to): Philippine calendar days p_from to p_to,
-- BOTH included. Admins only. Returns:
--   {
--     "from": "2026-10-04", "to": "2026-11-02",
--     "payment_mix":  [{ "name": "Cash", "value": 1234.50, "orders": 9 }, …],
--     "top_products": [{ "name": "Fresh Milk 1L", "revenue": 950.00, "quantity": 10 }, …]
--   }
-- The definitions match get_admin_sales_analytics(), so the numbers agree:
--   payment mix   money taken in (orders.final_amount) per payment method,
--                 largest first, with how many orders used it.
--   top products  the 10 products that brought in the most. A line's share
--                 of what was actually paid = its line total scaled by
--                 final_amount / total_amount, which spreads the points
--                 discount over the order's lines. Quantity = units sold.
--                 The name is the one frozen on the most recent order line
--                 (order_items.product_name), else the current product name.
-- =============================================================================

create or replace function public.get_sales_breakdown(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set "TimeZone" to 'UTC'
as $$
declare
  -- The range as exact moments: midnight Manila time at the start of p_from,
  -- up to (not including) midnight at the start of the day after p_to.
  range_start timestamptz;
  range_end timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Only admins can view sales analytics.';
  end if;

  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Pick a valid date range (the end can''t be before the start).';
  end if;

  -- 12 months is the longest range the page asks for; this leaves room.
  if p_to - p_from > 400 then
    raise exception 'Pick a range of at most 400 days.';
  end if;

  range_start := p_from::timestamp at time zone 'Asia/Manila';
  range_end := (p_to + 1)::timestamp at time zone 'Asia/Manila';

  return jsonb_build_object(
    'from', to_char(p_from, 'YYYY-MM-DD'),
    'to', to_char(p_to, 'YYYY-MM-DD'),

    'payment_mix',
    coalesce((
      select jsonb_agg(
        jsonb_build_object('name', payments.payment_method, 'value', payments.revenue, 'orders', payments.orders)
        order by payments.revenue desc, payments.payment_method
      )
        from (
          select o.payment_method,
                 sum(o.final_amount) as revenue,
                 count(*)::integer as orders
            from public.orders o
           where o.created_at >= range_start
             and o.created_at < range_end
           group by o.payment_method
        ) payments
    ), '[]'::jsonb),

    'top_products',
    coalesce((
      select jsonb_agg(
        jsonb_build_object('name', product_sales.name, 'revenue', round(product_sales.revenue, 2), 'quantity', product_sales.quantity)
        order by product_sales.revenue desc, product_sales.name
      )
        from (
          select (array_agg(coalesce(oi.product_name, p.name, 'Product #' || oi.product_id) order by oi.id desc))[1] as name,
                 sum(oi.quantity)::integer as quantity,
                 sum(oi.subtotal * coalesce(o.final_amount / nullif(o.total_amount, 0), 0)) as revenue
            from public.order_items oi
            join public.orders o on o.id = oi.order_id
            left join public.products p on p.id = oi.product_id
           where o.created_at >= range_start
             and o.created_at < range_end
           group by oi.product_id
           order by revenue desc
           limit 10
        ) product_sales
    ), '[]'::jsonb)
  );
end;
$$;

-- Only signed-in people may call it (and inside, only admins get an answer).
revoke execute on function public.get_sales_breakdown(date, date) from public, anon;
grant execute on function public.get_sales_breakdown(date, date) to authenticated;


-- =============================================================================
-- get_profit_loss_series(p_from, p_to, p_step): profit & loss for any range,
-- split into hours, days or months. Admins only.
--
-- The Analytics tab browses one day (hour by hour), one month (day by day) or
-- one year (month by month), with ‹ › to move to the previous / next one.
-- Philippine calendar days p_from to p_to, BOTH included, cut into steps:
--   'hour'   a day's 24 hours (at most 7 days, so at most 168 rows)
--   'day'    one row per day
--   'month'  one row per month (p_from should be the 1st of a month)
-- Returns:
--   {
--     "from": "2026-11-01", "to": "2026-11-30", "step": "day",
--     "periods": [ { "start": "2026-11-01", "orders": 3, "revenue": 412.00, … }, … ],
--     "totals":  { "orders": 41, "revenue": 3913.85, … }
--   }
-- Each period's numbers, and the totals, come from profit_and_loss_between()
-- (orders, revenue, cost_of_goods, gross_profit, near_expiry_discount,
-- points_discount, expired_loss, spoiled_loss, damaged_loss, total_losses,
-- net_profit), so they match the rest of Analytics. An hour's "start" is
-- written with its time ("2026-11-02T08:00"); days and months as dates.
-- =============================================================================

create or replace function public.get_profit_loss_series(p_from date, p_to date, p_step text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set "TimeZone" to 'UTC'
as $$
declare
  -- The length of one row: 1 hour, 1 day or 1 month.
  slot_length interval;
  periods jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can view sales analytics.';
  end if;

  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Pick a valid date range (the end can''t be before the start).';
  end if;

  if p_to - p_from > 400 then
    raise exception 'Pick a range of at most 400 days.';
  end if;

  slot_length := case p_step
    when 'hour' then interval '1 hour'
    when 'day' then interval '1 day'
    when 'month' then interval '1 month'
  end;

  if slot_length is null then
    raise exception 'The step must be hour, day or month.';
  end if;

  if p_step = 'hour' and p_to - p_from > 6 then
    raise exception 'Hour by hour works for at most 7 days.';
  end if;

  -- One row per slot, from the start of p_from up to the last slot that
  -- begins before the day after p_to. Slots are Manila wall-clock times
  -- (timestamp without time zone); "at time zone 'Asia/Manila'" turns each
  -- edge into the exact moment, as profit_and_loss_between() expects.
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'start',
             case when p_step = 'hour' then to_char(slots.slot, 'YYYY-MM-DD"T"HH24:MI') else to_char(slots.slot, 'YYYY-MM-DD') end
           )
           || public.profit_and_loss_between(
                slots.slot at time zone 'Asia/Manila',
                (slots.slot + slot_length) at time zone 'Asia/Manila'
              )
           order by slots.slot
         ), '[]'::jsonb)
    into periods
    from generate_series(p_from::timestamp, (p_to + 1)::timestamp - slot_length, slot_length) as slots(slot);

  return jsonb_build_object(
    'from', to_char(p_from, 'YYYY-MM-DD'),
    'to', to_char(p_to, 'YYYY-MM-DD'),
    'step', p_step,
    'periods', periods,
    'totals', public.profit_and_loss_between(
      p_from::timestamp at time zone 'Asia/Manila',
      (p_to + 1)::timestamp at time zone 'Asia/Manila'
    )
  );
end;
$$;

revoke execute on function public.get_profit_loss_series(date, date, text) from public, anon;
grant execute on function public.get_profit_loss_series(date, date, text) to authenticated;
