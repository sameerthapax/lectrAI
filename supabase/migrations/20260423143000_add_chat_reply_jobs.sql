create table if not exists public.chat_reply_jobs (
  id uuid primary key default gen_random_uuid(),
  chat_session_id uuid not null references public.chat_sessions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  request_message_id uuid not null references public.chat_messages(id) on delete cascade,
  final_assistant_message_id uuid references public.chat_messages(id) on delete set null,
  status varchar(20) not null check (status in ('queued', 'running', 'completed', 'failed')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.chat_reply_job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.chat_reply_jobs(id) on delete cascade,
  event_type varchar(64) not null,
  message text not null,
  metadata_json jsonb,
  sequence_number integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (job_id, sequence_number)
);

create index if not exists idx_chat_reply_jobs_user_id
  on public.chat_reply_jobs(user_id);

create index if not exists idx_chat_reply_jobs_session_id
  on public.chat_reply_jobs(chat_session_id);

create index if not exists idx_chat_reply_jobs_status
  on public.chat_reply_jobs(status);

create index if not exists idx_chat_reply_job_events_job_id_sequence
  on public.chat_reply_job_events(job_id, sequence_number);

alter table public.chat_reply_jobs enable row level security;
alter table public.chat_reply_job_events enable row level security;

drop policy if exists "chat_reply_jobs_select_owner" on public.chat_reply_jobs;
create policy "chat_reply_jobs_select_owner"
on public.chat_reply_jobs
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "chat_reply_job_events_select_owner" on public.chat_reply_job_events;
create policy "chat_reply_job_events_select_owner"
on public.chat_reply_job_events
for select
to authenticated
using (
  exists (
    select 1
    from public.chat_reply_jobs
    where chat_reply_jobs.id = chat_reply_job_events.job_id
      and chat_reply_jobs.user_id = auth.uid()
  )
);

drop trigger if exists set_chat_reply_jobs_updated_at on public.chat_reply_jobs;
create trigger set_chat_reply_jobs_updated_at
before update on public.chat_reply_jobs
for each row
execute function public.set_updated_at();
