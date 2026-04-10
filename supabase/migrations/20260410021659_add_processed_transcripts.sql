create table if not exists public.processed_transcripts (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null unique references public.lectures(id) on delete cascade,
  source_transcript_id uuid not null references public.transcripts(id) on delete cascade,
  source_audio_file_id uuid references public.audio_files(id) on delete set null,
  processing_job_id uuid references public.processing_jobs(id) on delete set null,
  provider_name varchar(100),
  model_name varchar(100),
  speaker_map jsonb not null default '[]'::jsonb,
  processed_payload jsonb not null default '{}'::jsonb,
  formatted_text text not null,
  status varchar(20) not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  generated_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_processed_transcripts_lecture_id on public.processed_transcripts(lecture_id);
create index if not exists idx_processed_transcripts_source_transcript_id on public.processed_transcripts(source_transcript_id);
create index if not exists idx_processed_transcripts_processing_job_id on public.processed_transcripts(processing_job_id);

alter table public.processed_transcripts enable row level security;

drop policy if exists "processed_transcripts_select_course_members_or_admin" on public.processed_transcripts;
create policy "processed_transcripts_select_course_members_or_admin"
on public.processed_transcripts
for select
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = processed_transcripts.lecture_id
      and public.can_view_course(lectures.course_id)
  )
);

drop policy if exists "processed_transcripts_insert_course_managers_or_admin" on public.processed_transcripts;
create policy "processed_transcripts_insert_course_managers_or_admin"
on public.processed_transcripts
for insert
with check (
  exists (
    select 1
    from public.lectures
    where lectures.id = processed_transcripts.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "processed_transcripts_update_course_managers_or_admin" on public.processed_transcripts;
create policy "processed_transcripts_update_course_managers_or_admin"
on public.processed_transcripts
for update
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = processed_transcripts.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
)
with check (
  exists (
    select 1
    from public.lectures
    where lectures.id = processed_transcripts.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "processed_transcripts_delete_course_managers_or_admin" on public.processed_transcripts;
create policy "processed_transcripts_delete_course_managers_or_admin"
on public.processed_transcripts
for delete
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = processed_transcripts.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop trigger if exists set_processed_transcripts_updated_at on public.processed_transcripts;
create trigger set_processed_transcripts_updated_at
before update on public.processed_transcripts
for each row execute function public.set_updated_at();
