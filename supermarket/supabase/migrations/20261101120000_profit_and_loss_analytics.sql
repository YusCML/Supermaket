-- Profit & loss for the Analytics tab.
--
-- Adds day-by-day, week-by-week and month-by-month breakdowns to
-- get_admin_sales_analytics(). For each period the admin sees:
--
--   sales                 money actually taken in. This is orders.final_amount,
--                         so it is AFTER the 15% near-expiry markdown and AFTER
--                         loyalty points.
--   cost of goods         what the items that were sold cost the store
--   gross profit          sales - cost of goods   (the "gain")
--   near-expiry discount  how much the 15% markdowns gave away (info only; it
--                         is already taken out of sales)
--   points discount       how much loyalty points paid for (info only; also
--                         already taken out of sales)
--   losses                stock that left the shelves without being sold,
--                         valued at cost: expired, spoiled and damaged
--   net profit            gross profit - losses
--
-- Everything the function returned before is still returned unchanged, so an
-- older copy of the app keeps working.


-- 1. The maths for one period ------------------------------------------------
-- Start time included, end time excluded.
create or replace function public.profit_and_loss_between(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
set timezone = 'UTC'
as $$
  with sales as (
    select coalesce(sum(o.final_amount), 0)    as revenue,
           coalesce(sum(o.discount_amount), 0) as points_discount,
           count(*)::integer                   as orders
      from public.orders o
     where o.created_at::timestamptz >= p_from
       and o.created_at::timestamptz <  p_to
  ),
  sold_items as (
    -- order_items.unit_price is the price that was charged. If it is below the
    -- product's normal price, that line was sold at the near-expiry markdown
    -- (the receipt works the markdown out the same way).
    -- order_items doesn't store what an item cost the store, so the product's
    -- current cost is used.
    select coalesce(sum(oi.quantity * p.cost), 0)                                   as cost_of_goods,
           coalesce(sum(greatest(p.price - oi.unit_price, 0) * oi.quantity), 0)     as near_expiry_discount
      from public.order_items oi
      join public.orders   o on o.id = oi.order_id
      join public.products p on p.id = oi.product_id
     where o.created_at::timestamptz >= p_from
       and o.created_at::timestamptz <  p_to
  ),
  losses as (
    -- Every unit removed without being sold is logged in spoilage_logs with
    -- its cost: 'expired' by expiry processing, 'damaged' / 'spoiled' by an
    -- admin's write-off.
    select coalesce(sum(s.loss_amount) filter (where s.kind = 'expired'), 0) as expired,
           coalesce(sum(s.loss_amount) filter (where s.kind = 'spoiled'), 0) as spoiled,
           coalesce(sum(s.loss_amount) filter (where s.kind = 'damaged'), 0) as damaged
      from public.spoilage_logs s
     where s.expired_at >= p_from
       and s.expired_at <  p_to
  )
  select jsonb_build_object(
           'orders',               sales.orders,
           'revenue',              sales.revenue,
           'cost_of_goods',        sold_items.cost_of_goods,
           'gross_profit',         sales.revenue - sold_items.cost_of_goods,
           'near_expiry_discount', sold_items.near_expiry_discount,
           'points_discount',      sales.points_discount,
           'expired_loss',         losses.expired,
           'spoiled_loss',         losses.spoiled,
           'damaged_loss',         losses.damaged,
           'total_losses',         losses.expired + losses.spoiled + losses.damaged,
           'net_profit',           sales.revenue - sold_items.cost_of_goods
                                     - (losses.expired + losses.spoiled + losses.damaged)
         )
    from sales, sold_items, losses;
$$;

-- Only get_admin_sales_analytics() below uses this helper (it runs as the
-- function owner). Nobody should call it directly, because it has no admin check.
revoke execute on function public.profit_and_loss_between(timestamptz, timestamptz)
  from public, anon, authenticated;


-- 2. The analytics function, now with the breakdowns -------------------------
create or replace function public.get_admin_sales_analytics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  today_pht date := (now() at time zone 'Asia/Manila')::date;
  week_start date;
  month_start date;
  year_start date;
  analytics jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can view sales analytics.';
  end if;

  week_start := date_trunc('week', today_pht::timestamp)::date;
  month_start := date_trunc('month', today_pht::timestamp)::date;
  year_start := date_trunc('year', today_pht::timestamp)::date;

  -- Unchanged from 20261026120700 --------------------------------------------
  select jsonb_build_object(
    'today_revenue',
    coalesce(sum(o.final_amount) filter (
      where o.created_at::timestamptz >= today_pht::timestamp at time zone 'Asia/Manila'
        and o.created_at::timestamptz < (today_pht + 1)::timestamp at time zone 'Asia/Manila'
    ), 0),
    'week_revenue',
    coalesce(sum(o.final_amount) filter (
      where o.created_at::timestamptz >= week_start::timestamp at time zone 'Asia/Manila'
        and o.created_at::timestamptz < (today_pht + 1)::timestamp at time zone 'Asia/Manila'
    ), 0),
    'month_revenue',
    coalesce(sum(o.final_amount) filter (
      where o.created_at::timestamptz >= month_start::timestamp at time zone 'Asia/Manila'
        and o.created_at::timestamptz < (today_pht + 1)::timestamp at time zone 'Asia/Manila'
    ), 0),
    'year_revenue',
    coalesce(sum(o.final_amount) filter (
      where o.created_at::timestamptz >= year_start::timestamp at time zone 'Asia/Manila'
        and o.created_at::timestamptz < (today_pht + 1)::timestamp at time zone 'Asia/Manila'
    ), 0),
    'net_revenue',
    coalesce(sum(o.final_amount), 0)
  )
    into analytics
    from public.orders o;

  analytics := analytics || jsonb_build_object(
    'thirty_day_trend',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'date', to_char(days.day, 'YYYY-MM-DD'),
          'revenue', coalesce(daily.revenue, 0)
        ) order by days.day
      )
        from generate_series(
          (today_pht - 29)::timestamp,
          today_pht::timestamp,
          interval '1 day'
        ) as days(day)
        left join lateral (
          select sum(o.final_amount) as revenue
            from public.orders o
           where o.created_at::timestamptz >= days.day at time zone 'Asia/Manila'
             and o.created_at::timestamptz < (days.day + interval '1 day') at time zone 'Asia/Manila'
        ) daily on true
    ), '[]'::jsonb),
    'monthly_revenue',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'month', to_char(months.month, 'YYYY-MM'),
          'revenue', coalesce(monthly.revenue, 0)
        ) order by months.month
      )
        from generate_series(
          year_start::timestamp,
          month_start::timestamp,
          interval '1 month'
        ) as months(month)
        left join lateral (
          select sum(o.final_amount) as revenue
            from public.orders o
           where o.created_at::timestamptz >= months.month at time zone 'Asia/Manila'
             and o.created_at::timestamptz < (months.month + interval '1 month') at time zone 'Asia/Manila'
        ) monthly on true
    ), '[]'::jsonb),
    'payment_mix',
    coalesce((
      select jsonb_agg(jsonb_build_object('name', payments.payment_method, 'value', payments.revenue))
        from (
          select o.payment_method, sum(o.final_amount) as revenue
            from public.orders o
           where o.created_at::timestamptz >= year_start::timestamp at time zone 'Asia/Manila'
             and o.created_at::timestamptz < (today_pht + 1)::timestamp at time zone 'Asia/Manila'
           group by o.payment_method
           order by o.payment_method
        ) payments
    ), '[]'::jsonb),
    'top_products',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name', product_sales.name,
          'revenue', product_sales.revenue,
          'quantity', product_sales.quantity
        ) order by product_sales.revenue desc, product_sales.name
      )
        from (
          select p.name,
                 sum(oi.quantity)::integer as quantity,
                 sum(
                   oi.subtotal * coalesce(o.final_amount / nullif(o.total_amount, 0), 0)
                 ) as revenue
            from public.order_items oi
            join public.orders o on o.id = oi.order_id
            join public.products p on p.id = oi.product_id
           where o.created_at::timestamptz >= year_start::timestamp at time zone 'Asia/Manila'
             and o.created_at::timestamptz < (today_pht + 1)::timestamp at time zone 'Asia/Manila'
           group by p.id, p.name
           order by revenue desc, p.name
           limit 10
        ) product_sales
    ), '[]'::jsonb),
    'spoilage_losses',
    coalesce((
      select sum(s.loss_amount)
        from public.spoilage_logs s
       where s.expired_at >= year_start::timestamp at time zone 'Asia/Manila'
         and s.expired_at < (today_pht + 1)::timestamp at time zone 'Asia/Manila'
    ), 0)
  );

  -- New: profit & loss breakdowns --------------------------------------------
  -- Each entry is { "start": "<first day of the period>", ...the numbers from
  -- profit_and_loss_between() }. Periods follow the Philippine calendar.
  analytics := analytics || jsonb_build_object(
    -- Last 30 days, one entry per day.
    'daily_breakdown',
    coalesce((
      select jsonb_agg(
        jsonb_build_object('start', to_char(days.day, 'YYYY-MM-DD'))
          || public.profit_and_loss_between(
               days.day at time zone 'Asia/Manila',
               (days.day + interval '1 day') at time zone 'Asia/Manila'
             )
        order by days.day
      )
        from generate_series(
          (today_pht - 29)::timestamp,
          today_pht::timestamp,
          interval '1 day'
        ) as days(day)
    ), '[]'::jsonb),

    -- Last 12 weeks (Monday to Sunday), one entry per week.
    'weekly_breakdown',
    coalesce((
      select jsonb_agg(
        jsonb_build_object('start', to_char(weeks.week, 'YYYY-MM-DD'))
          || public.profit_and_loss_between(
               weeks.week at time zone 'Asia/Manila',
               (weeks.week + interval '1 week') at time zone 'Asia/Manila'
             )
        order by weeks.week
      )
        from generate_series(
          (week_start - 77)::timestamp,
          week_start::timestamp,
          interval '1 week'
        ) as weeks(week)
    ), '[]'::jsonb),

    -- Last 12 months, one entry per month.
    'monthly_breakdown',
    coalesce((
      select jsonb_agg(
        jsonb_build_object('start', to_char(months.month, 'YYYY-MM-DD'))
          || public.profit_and_loss_between(
               months.month at time zone 'Asia/Manila',
               (months.month + interval '1 month') at time zone 'Asia/Manila'
             )
        order by months.month
      )
        from generate_series(
          month_start::timestamp - interval '11 months',
          month_start::timestamp,
          interval '1 month'
        ) as months(month)
    ), '[]'::jsonb),

    -- This year so far, as one total (used for the losses breakdown card).
    'year_summary',
    public.profit_and_loss_between(
      year_start::timestamp at time zone 'Asia/Manila',
      (today_pht + 1)::timestamp at time zone 'Asia/Manila'
    )
  );

  return analytics;
end;
$$;
