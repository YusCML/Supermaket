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

  return analytics;
end;
$$;
