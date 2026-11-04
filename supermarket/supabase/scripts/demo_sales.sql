-- =============================================================================
-- demo_sales.sql: about six weeks of realistic sales, to show the POS,
-- Orders, Loyalty and Analytics working with real data.
--
-- Run it with:   npx supabase db query --linked -f supabase/scripts/demo_sales.sql
-- (A one-off data script, NOT a migration. Run it after reset_demo_data.sql.)
--
-- Every sale goes through the REAL checkout function, process_pos_checkout(),
-- exactly like pressing "Complete Transaction" at the till, so everything
-- stays consistent: stock comes off the right batches (soonest expiry first),
-- prices come from the database, points are earned (1 per ₱100) and some are
-- redeemed (₱5 each), and the loyalty audit log is written. Afterwards each
-- order (and its log entries) is dated back to a day in the last 6 weeks, at
-- an opening-hours time in Philippine time, so the Analytics and Orders tabs
-- have history to show.
--
-- What it makes:
--   - 0 to 2 sales a day (one more on weekends) for the last 42 days, plus a
--     few today; each sale 1 to 3 different products, 1 or 2 of each;
--   - members take turns, so everyone has points and history;
--   - about 60% Cash (handed over rounded up to the next ₱50) and 40% Card;
--   - once a member has 10+ points, some sales redeem a few of them;
--   - two write-offs: 2 dented sardine cans (damaged) and 1 Yakult with a
--     broken seal (spoiled).
-- Products with a batch expiring within 7 days, and products at or below
-- their reorder level, are left out of the sales, so the 15%-off and
-- Low-stock examples are still there to show.
--
-- random() is seeded (setseed), so running it on the same catalogue gives
-- the same sales. Everything is in ONE transaction: if anything fails,
-- nothing is saved.
-- =============================================================================

begin;

-- Act as the first admin (checkout for any member and write-offs need staff).
select set_config(
  'request.jwt.claims',
  json_build_object('sub', (select user_id from public.admin order by created_at limit 1), 'role', 'authenticated')::text,
  true
);

do $$
declare
  today       date := (now() at time zone 'Asia/Manila')::date;
  members     uuid[] := array(select u.id from public.users u order by u.created_at);
  day_offset  integer;
  per_day     integer;
  sale_no     integer := 0;
  n           integer;
  member      uuid;
  cart        jsonb;
  list_total  numeric;
  line        record;
  balance     integer;
  use_points  integer;
  pay         text;
  cash        numeric;
  receipt     jsonb;
  order_no    bigint;
  stamp       timestamptz;
  batch       bigint;
begin
  perform setseed(0.42);

  for day_offset in reverse 42..0 loop
    -- How many sales that day: 0-2, one more on Saturday/Sunday, 3 today.
    per_day := case
      when day_offset = 0 then 3
      else floor(random() * 3)::integer
           + case when extract(isodow from today - day_offset) in (6, 7) then 1 else 0 end
    end;

    for n in 1..per_day loop
      sale_no := sale_no + 1;
      member := members[1 + (sale_no % array_length(members, 1))];

      -- The basket: 1-3 different products that are safe to sell (see top).
      cart := '[]'::jsonb;
      list_total := 0;
      for line in
        select p.id, p.price, least(1 + floor(random() * 2)::integer, p.stock_quantity - 1) as qty
          from public.products p
         where p.stock_quantity > p.reorder_level + 2
           and not exists (
             select 1 from public.product_batches b
              where b.product_id = p.id and b.quantity_remaining > 0
                and b.expiry_date <= today + 7
           )
         order by random()
         limit 1 + floor(random() * 3)::integer
      loop
        if line.qty > 0 then
          cart := cart || jsonb_build_array(jsonb_build_object('product_id', line.id, 'quantity', line.qty));
          list_total := list_total + line.price * line.qty;
        end if;
      end loop;
      continue when jsonb_array_length(cart) = 0;

      -- Points: once a member has 10+, about a third of their sales use 2-6
      -- of them (never more than about 80% of the bill).
      select loyalty_points into balance from public.customer where user_id = member;
      use_points := 0;
      if coalesce(balance, 0) >= 10 and random() < 0.35 then
        use_points := least(balance, 2 + floor(random() * 5)::integer, floor(list_total * 0.8 / 5)::integer);
      end if;

      -- Payment: about 60% cash (handed over rounded up to the next ₱50,
      -- always enough), 40% card.
      if random() < 0.6 then
        pay := 'Cash';
        cash := ceil(list_total / 50) * 50;
      else
        pay := 'Card';
        cash := null;
      end if;

      receipt := public.process_pos_checkout(cart, member, use_points, pay, cash);
      order_no := (receipt ->> 'order_id')::bigint;

      -- Date it back: that day, between 8:00 AM and 8:59 PM Manila time
      -- (today's sales: earlier today).
      stamp := ((today - day_offset)::timestamp
                + make_interval(hours => 8 + floor(random() * 13)::integer, mins => floor(random() * 60)::integer))
               at time zone 'Asia/Manila';
      if stamp > now() then
        stamp := now() - make_interval(mins => 20 * n);
      end if;
      update public.orders set created_at = stamp where id = order_no;
      update public.loyalty_logs set created_at = stamp where order_id = order_no;
    end loop;
  end loop;

  -- Two write-offs, dated a few weeks back.
  select b.id into batch
    from public.product_batches b join public.products p on p.id = b.product_id
   where p.sku = 'PN-SARDINES-155G' and b.quantity_remaining >= 2
   order by b.expiry_date limit 1;
  if batch is not null then
    perform public.write_off_stock(batch, 2, 'damaged', 'Cans dented during delivery');
    update public.spoilage_logs
       set created_at = now() - interval '20 days', expired_at = now() - interval '20 days'
     where batch_id = batch;
  end if;

  select b.id into batch
    from public.product_batches b join public.products p on p.id = b.product_id
   where p.sku = 'DY-YAKULT-5X80ML' and b.quantity_remaining >= 1
   order by b.expiry_date desc limit 1;
  if batch is not null then
    perform public.write_off_stock(batch, 1, 'spoiled', 'Seal broken, found during shelf check');
    update public.spoilage_logs
       set created_at = now() - interval '9 days', expired_at = now() - interval '9 days'
     where batch_id = batch;
  end if;
end;
$$;

-- What's there now (shown when the script finishes).
select (select count(*) from public.orders)                             as orders,
       (select coalesce(sum(final_amount), 0) from public.orders)       as money_taken_in,
       (select count(*) from public.orders where points_redeemed > 0)   as orders_using_points,
       (select count(*) from public.loyalty_logs)                       as loyalty_log_entries,
       (select coalesce(sum(loyalty_points), 0) from public.customer)   as points_held_now,
       (select count(*) from public.spoilage_logs)                      as write_offs,
       (select min(created_at)::date from public.orders)                as first_sale,
       (select max(created_at)::date from public.orders)                as last_sale;

commit;
