-- Rider shift roster (standing assignment per rider) — applied to aamofkqdmqtpnqdxximh.
create table if not exists public.rider_shifts (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null unique references public.profiles(id) on delete cascade,
  hub_id uuid references public.hubs(id),
  zone_label text,
  start_time time not null,
  end_time time not null,
  effective_date date not null default current_date,
  active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.rider_shifts enable row level security;
drop policy if exists rider_shifts_select on public.rider_shifts;
create policy rider_shifts_select on public.rider_shifts
  for select using (public.is_staff() or rider_id = auth.uid());
drop policy if exists rider_shifts_write on public.rider_shifts;
create policy rider_shifts_write on public.rider_shifts
  for all using (public.is_staff()) with check (public.is_staff());
grant select, insert, update, delete on public.rider_shifts to authenticated;
