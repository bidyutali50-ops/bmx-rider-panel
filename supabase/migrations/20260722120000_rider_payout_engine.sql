-- BMX Rider Payout Engine — MG + Per-Order
-- Applied to Supabase project aamofkqdmqtpnqdxximh on 2026-07-22.
-- Additive & non-regressive. Drives components/PayoutsConsole.tsx (/payout-engine).

alter table public.data_entries
  add column if not exists mg_topup        numeric,
  add column if not exists delivery_pay    numeric,
  add column if not exists per_order_value numeric,
  add column if not exists calc_breakdown  jsonb,
  add column if not exists computed_at      timestamptz;

insert into public.settings(key, value)
values ('payout_policy', jsonb_build_object(
  'mg_is_floor',true,'mg_requires_orders',false,'mg_min_minutes',0,
  'half_day_factor',0.5,'incentives_on_top',true,
  'present_statuses',jsonb_build_array('present','late','half_day')))
on conflict (key) do nothing;

create or replace function public.fn_payout_policy()
returns jsonb language sql stable set search_path to 'public','pg_temp' as $$
  select jsonb_build_object(
    'mg_is_floor',true,'mg_requires_orders',false,'mg_min_minutes',0,
    'half_day_factor',0.5,'incentives_on_top',true,
    'present_statuses',jsonb_build_array('present','late','half_day')
  ) || coalesce((select value from public.settings where key='payout_policy'),'{}'::jsonb);
$$;

create or replace function public.calc_rider_day(p_rider_id uuid, p_date date)
returns jsonb language plpgsql stable security definer
set search_path to 'public','pg_temp' as $$
declare
  pol jsonb := public.fn_payout_policy();
  pr record; rc record; att record; de record; cwd record;
  present boolean; half_day boolean; is_mg_rider boolean; mins numeric;
  o int; km numeric; cod int; pen numeric;
  rate_po numeric; extra_km numeric; cod_inc numeric; xo_inc numeric;
  ot_rate numeric; work_hrs numeric; att_bonus numeric; fuel numeric;
  daily_mg numeric; req_orders int;
  delivery numeric; incentives numeric; addons numeric;
  mg_target numeric; core numeric; topup numeric; pay_type text; mg_ok boolean;
begin
  if not public.is_staff() then raise exception 'Staff access required'; end if;
  select id, full_name, rider_code, hub_id, active, rider_type,
         coalesce(ppo,0) ppo, coalesce(mg,0) mg
    into pr from public.profiles where id = p_rider_id and role='rider';
  if pr.id is null then return null; end if;
  select * into rc from public.rate_cards
   where rider_id = p_rider_id and effective_date <= p_date
   order by effective_date desc, created_at desc limit 1;
  select status, shift_minutes into att
    from public.attendance where rider_id = p_rider_id and att_date = p_date limit 1;
  select completed_orders, cod_orders, distance_km, penalty, source
    into de from public.data_entries where rider_id = p_rider_id and entry_date = p_date limit 1;
  select orders_done, minutes into cwd
    from public.client_work_days where rider_id = p_rider_id and work_date = p_date limit 1;

  rate_po   := coalesce(nullif(rc.rate_per_order,0), pr.ppo, 0);
  extra_km  := coalesce(rc.extra_km_rate,0);
  cod_inc   := coalesce(rc.cod_incentive,0);
  xo_inc    := coalesce(rc.incentive_per_extra_order,0);
  ot_rate   := coalesce(rc.overtime_rate,0);
  work_hrs  := coalesce(rc.working_hours,0);
  att_bonus := coalesce(rc.attendance_bonus,0);
  fuel      := coalesce(rc.fuel_allowance,0);
  daily_mg  := coalesce(nullif(rc.daily_mg,0), pr.mg, 0);
  req_orders:= coalesce(rc.required_orders,0);

  o   := coalesce(de.completed_orders, cwd.orders_done, 0);
  km  := coalesce(de.distance_km, 0);
  cod := coalesce(de.cod_orders, 0);
  pen := coalesce(de.penalty, 0);
  mins:= coalesce(att.shift_minutes, cwd.minutes, 0);

  present  := (att.status is not null and pol->'present_statuses' ? att.status)
              or de.completed_orders is not null or de.source is not null
              or coalesce(cwd.minutes,0) > 0;
  half_day := (att.status = 'half_day');
  is_mg_rider := (pr.rider_type = 'mg') or (coalesce(rc.payment_type,'') = 'mg')
                 or (daily_mg > 0 and coalesce(rc.payment_type,'per_order') <> 'per_order');

  delivery   := rate_po*o + extra_km*km
                + case when work_hrs>0 then ot_rate*greatest(0, mins/60.0 - work_hrs) else 0 end;
  incentives := cod_inc*cod + xo_inc*greatest(0, o - req_orders);
  addons     := case when present then att_bonus + fuel else 0 end;

  mg_ok := is_mg_rider and present
           and ( not (pol->>'mg_requires_orders')::boolean or (req_orders = 0 or o >= req_orders) )
           and ( (pol->>'mg_min_minutes')::numeric = 0 or mins >= (pol->>'mg_min_minutes')::numeric );
  mg_target := daily_mg * case when half_day then (pol->>'half_day_factor')::numeric else 1 end;

  if mg_ok and (pol->>'mg_is_floor')::boolean then
    core := greatest(mg_target, delivery); topup := greatest(0, mg_target - delivery); pay_type := 'mg';
  elsif mg_ok then
    core := mg_target; topup := greatest(0, mg_target - delivery); pay_type := 'mg';
  else
    core := delivery; topup := 0; pay_type := 'per_order';
  end if;

  return jsonb_build_object(
    'rider_id',p_rider_id,'rider_name',pr.full_name,'rider_code',pr.rider_code,'date',p_date,
    'payment_type',pay_type,'present',present,'half_day',half_day,'mg_eligible',mg_ok,
    'orders',o,'required_orders',req_orders,'cod_orders',cod,'distance_km',km,'minutes',mins,
    'rate_per_order',rate_po,'daily_mg',daily_mg,'delivery_pay',round(delivery,2),
    'per_order_value',round(delivery+incentives,2),'mg_target',round(mg_target,2),
    'mg_topup',round(topup,2),'incentives',round(incentives,2),'addons',round(addons,2),
    'earnings',round(core,2),'incentive',round(incentives+addons,2),'penalty',round(pen,2),
    'net_amount',round(core + incentives + addons - pen,2));
end; $$;

create or replace function public.apply_rider_day(p_rider_id uuid, p_date date)
returns jsonb language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare b jsonb;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  b := public.calc_rider_day(p_rider_id, p_date);
  if b is null then return null; end if;
  insert into public.data_entries(
    rider_id, entry_date, payment_type, completed_orders, cod_orders, distance_km,
    earnings, incentive, penalty, mg_topup, delivery_pay, per_order_value,
    calc_breakdown, computed_at, auto_generated, source)
  values (
    p_rider_id, p_date, b->>'payment_type',
    (b->>'orders')::int, (b->>'cod_orders')::int, (b->>'distance_km')::numeric,
    (b->>'earnings')::numeric, (b->>'incentive')::numeric, (b->>'penalty')::numeric,
    (b->>'mg_topup')::numeric, (b->>'delivery_pay')::numeric, (b->>'per_order_value')::numeric,
    b, now(), true, 'engine')
  on conflict (rider_id, entry_date) do update set
    payment_type=excluded.payment_type, earnings=excluded.earnings, incentive=excluded.incentive,
    mg_topup=excluded.mg_topup, delivery_pay=excluded.delivery_pay,
    per_order_value=excluded.per_order_value, calc_breakdown=excluded.calc_breakdown,
    computed_at=excluded.computed_at, auto_generated=true, source='engine';
  return b;
end; $$;

create or replace function public.run_earnings_day(p_date date)
returns jsonb language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare r uuid; n int := 0; tot numeric := 0; b jsonb;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  for r in
    select rider_id from public.attendance where att_date = p_date
    union select rider_id from public.data_entries where entry_date = p_date
    union select rider_id from public.client_work_days where work_date = p_date
  loop
    b := public.apply_rider_day(r, p_date);
    if b is not null then n := n+1; tot := tot + (b->>'net_amount')::numeric; end if;
  end loop;
  return jsonb_build_object('date',p_date,'riders',n,'net_total',round(tot,2));
end; $$;

create or replace function public.run_earnings_range(p_from date, p_to date)
returns jsonb language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare d date; days int := 0; tot numeric := 0; day_res jsonb;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  d := p_from;
  while d <= p_to loop
    day_res := public.run_earnings_day(d);
    days := days + 1; tot := tot + (day_res->>'net_total')::numeric; d := d + 1;
  end loop;
  return jsonb_build_object('from',p_from,'to',p_to,'days',days,'net_total',round(tot,2));
end; $$;

create or replace function public.build_rider_settlement(p_from date, p_to date, p_hub_id uuid default null)
returns uuid language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare v_batch uuid;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select id into v_batch from public.payout_batches
   where client_id is null and period_from = p_from and period_to = p_to limit 1;
  if v_batch is null then
    insert into public.payout_batches(client_id, period_from, period_to, note, created_by)
    values (null, p_from, p_to, 'Rider settlement (computed)', auth.uid()) returning id into v_batch;
  end if;
  if (select status from public.payout_batches where id = v_batch) = 'paid' then
    raise exception 'This period is already paid and cannot be rebuilt';
  end if;
  delete from public.payout_batch_lines where batch_id = v_batch and status <> 'paid';
  insert into public.payout_batch_lines(
    batch_id, rider_id, client_rider_ref, rider_name,
    client_amount, mg_days, po_days, total_minutes, orders, rider_amount, status)
  select v_batch, d.rider_id, coalesce(p.rider_code, d.rider_id::text), p.full_name, 0,
    count(*) filter (where d.payment_type = 'mg'),
    count(*) filter (where d.payment_type <> 'mg'),
    coalesce(sum(a.shift_minutes),0), coalesce(sum(d.completed_orders),0),
    round(sum(d.net_amount),2), 'pending'
  from public.data_entries d
  join public.profiles p on p.id = d.rider_id and p.role='rider'
  left join public.attendance a on a.rider_id = d.rider_id and a.att_date = d.entry_date
  where d.entry_date between p_from and p_to
    and (p_hub_id is null or p.hub_id = p_hub_id)
  group by d.rider_id, p.rider_code, p.full_name
  having round(sum(d.net_amount),2) > 0;
  return v_batch;
end; $$;

create or replace function public.rider_earnings_breakdown(p_from date, p_to date, p_rider_id uuid default null)
returns table(
  rider_id uuid, rider_name text, rider_code text, hub_name text, entry_date date,
  payment_type text, mg_eligible boolean, orders int, required_orders int,
  delivery_pay numeric, mg_target numeric, mg_topup numeric, incentive numeric,
  penalty numeric, earnings numeric, net_amount numeric)
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select d.rider_id, p.full_name, p.rider_code, h.name, d.entry_date, d.payment_type,
    coalesce((d.calc_breakdown->>'mg_eligible')::boolean, d.payment_type='mg'),
    d.completed_orders, coalesce((d.calc_breakdown->>'required_orders')::int,0),
    coalesce(d.delivery_pay,0), coalesce((d.calc_breakdown->>'mg_target')::numeric,0),
    coalesce(d.mg_topup,0), coalesce(d.incentive,0), coalesce(d.penalty,0),
    coalesce(d.earnings,0), coalesce(d.net_amount,0)
  from public.data_entries d
  join public.profiles p on p.id = d.rider_id
  left join public.hubs h on h.id = p.hub_id
  where d.entry_date between p_from and p_to
    and (p_rider_id is null or d.rider_id = p_rider_id) and public.is_staff()
  order by p.full_name, d.entry_date;
$$;

grant execute on function
  public.calc_rider_day(uuid,date), public.apply_rider_day(uuid,date),
  public.run_earnings_day(date), public.run_earnings_range(date,date),
  public.build_rider_settlement(date,date,uuid),
  public.rider_earnings_breakdown(date,date,uuid), public.fn_payout_policy()
to authenticated;
