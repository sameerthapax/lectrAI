create table if not exists public.user_stats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  streak_days integer not null default 0 check (streak_days >= 0),
  last_incremented_on date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_user_stats_user_id on public.user_stats(user_id);

drop trigger if exists set_user_stats_updated_at on public.user_stats;
create trigger set_user_stats_updated_at
before update on public.user_stats
for each row
execute function public.set_updated_at();

alter table public.user_stats enable row level security;

drop policy if exists "user_stats_select_owner_or_admin" on public.user_stats;
create policy "user_stats_select_owner_or_admin"
on public.user_stats
for select
using (
  user_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "user_stats_insert_owner_or_admin" on public.user_stats;
create policy "user_stats_insert_owner_or_admin"
on public.user_stats
for insert
with check (
  user_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "user_stats_update_owner_or_admin" on public.user_stats;
create policy "user_stats_update_owner_or_admin"
on public.user_stats
for update
using (
  user_id = auth.uid()
  or public.is_admin()
)
with check (
  user_id = auth.uid()
  or public.is_admin()
);
