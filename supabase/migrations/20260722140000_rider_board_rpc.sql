-- Rider board: one row per rider with outstanding, today's delivered/failed/ongoing, shift.
create or replace function public.rider_board()
returns table(rider_id uuid, outstanding numeric, today_delivered int, today_failed int,
              today_ongoing int, shift_start time, shift_end time)
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select p.id, coalesce(w.pending_amount,0),
    coalesce(de.completed_orders,0), coalesce(de.cancelled_orders,0),
    greatest(0, coalesce(de.total_orders,0)-coalesce(de.completed_orders,0)-coalesce(de.cancelled_orders,0)),
    s.start_time, s.end_time
  from public.profiles p
  left join public.rider_wallets w on w.rider_id = p.id
  left join public.data_entries de on de.rider_id = p.id and de.entry_date = current_date
  left join public.rider_shifts s on s.rider_id = p.id and s.active
  where p.role='rider' and public.is_staff();
$$;
grant execute on function public.rider_board() to authenticated;
