do $$
begin
  create type public.audio_chunk_status as enum ('uploaded', 'transcribing', 'done', 'failed');
exception
  when duplicate_object then null;
end
$$;

alter table public.lectures
  add column if not exists expected_chunk_count integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'lectures_expected_chunk_count_check'
      and conrelid = 'public.lectures'::regclass
  ) then
    alter table public.lectures
      add constraint lectures_expected_chunk_count_check
      check (expected_chunk_count is null or expected_chunk_count > 0);
  end if;
end
$$;

alter table public.processing_jobs
  drop constraint if exists processing_jobs_job_type_check;

alter table public.processing_jobs
  add constraint processing_jobs_job_type_check
  check (
    job_type in (
      'upload',
      'transcription',
      'segmentation',
      'summary',
      'concept_extraction',
      'timeline',
      'quiz_generation',
      'embedding',
      'rag_index',
      'chunk_transcription',
      'merge',
      'processing',
      'embeddings'
    )
  );

create table if not exists public.audio_chunks (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  chunk_index integer not null,
  storage_path text not null,
  duration_seconds numeric(10,3),
  status public.audio_chunk_status not null default 'uploaded',
  created_at timestamptz not null default timezone('utc', now()),
  unique (lecture_id, chunk_index)
);

create table if not exists public.chunk_transcriptions (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  chunk_id uuid not null unique references public.audio_chunks(id) on delete cascade,
  raw_diarized_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_audio_chunks_lecture_id
  on public.audio_chunks(lecture_id);

create index if not exists idx_audio_chunks_lecture_id_chunk_index
  on public.audio_chunks(lecture_id, chunk_index);

create index if not exists idx_chunk_transcriptions_lecture_id
  on public.chunk_transcriptions(lecture_id);

create index if not exists idx_transcript_segments_lecture_id
  on public.transcript_segments(lecture_id);

alter table public.transcript_chunks
  add column if not exists lecture_id uuid references public.lectures(id) on delete cascade;

update public.transcript_chunks tc
set lecture_id = pt.lecture_id
from public.processed_transcripts pt
where pt.id = tc.transcript_id
  and tc.lecture_id is null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transcript_chunks'
      and column_name = 'lecture_id'
      and is_nullable = 'YES'
  ) then
    alter table public.transcript_chunks
      alter column lecture_id set not null;
  end if;
exception
  when others then
    null;
end
$$;

create index if not exists idx_transcript_chunks_lecture_id
  on public.transcript_chunks(lecture_id);

alter table public.audio_chunks enable row level security;
alter table public.chunk_transcriptions enable row level security;

drop policy if exists "audio_chunks_select_course_members_or_admin" on public.audio_chunks;
create policy "audio_chunks_select_course_members_or_admin"
on public.audio_chunks
for select
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = audio_chunks.lecture_id
      and public.can_view_course(lectures.course_id)
  )
);

drop policy if exists "audio_chunks_insert_course_managers_or_admin" on public.audio_chunks;
create policy "audio_chunks_insert_course_managers_or_admin"
on public.audio_chunks
for insert
with check (
  exists (
    select 1
    from public.lectures
    where lectures.id = audio_chunks.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "audio_chunks_update_course_managers_or_admin" on public.audio_chunks;
create policy "audio_chunks_update_course_managers_or_admin"
on public.audio_chunks
for update
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = audio_chunks.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
)
with check (
  exists (
    select 1
    from public.lectures
    where lectures.id = audio_chunks.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "audio_chunks_delete_course_managers_or_admin" on public.audio_chunks;
create policy "audio_chunks_delete_course_managers_or_admin"
on public.audio_chunks
for delete
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = audio_chunks.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "chunk_transcriptions_select_course_members_or_admin" on public.chunk_transcriptions;
create policy "chunk_transcriptions_select_course_members_or_admin"
on public.chunk_transcriptions
for select
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = chunk_transcriptions.lecture_id
      and public.can_view_course(lectures.course_id)
  )
);

drop policy if exists "chunk_transcriptions_insert_course_managers_or_admin" on public.chunk_transcriptions;
create policy "chunk_transcriptions_insert_course_managers_or_admin"
on public.chunk_transcriptions
for insert
with check (
  exists (
    select 1
    from public.lectures
    where lectures.id = chunk_transcriptions.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "chunk_transcriptions_update_course_managers_or_admin" on public.chunk_transcriptions;
create policy "chunk_transcriptions_update_course_managers_or_admin"
on public.chunk_transcriptions
for update
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = chunk_transcriptions.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
)
with check (
  exists (
    select 1
    from public.lectures
    where lectures.id = chunk_transcriptions.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "chunk_transcriptions_delete_course_managers_or_admin" on public.chunk_transcriptions;
create policy "chunk_transcriptions_delete_course_managers_or_admin"
on public.chunk_transcriptions
for delete
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = chunk_transcriptions.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "transcript_chunks_select_course_members_or_admin" on public.transcript_chunks;
create policy "transcript_chunks_select_course_members_or_admin"
on public.transcript_chunks
for select
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = transcript_chunks.lecture_id
      and public.can_view_course(lectures.course_id)
  )
);

drop policy if exists "transcript_chunks_insert_course_managers_or_admin" on public.transcript_chunks;
create policy "transcript_chunks_insert_course_managers_or_admin"
on public.transcript_chunks
for insert
with check (
  exists (
    select 1
    from public.lectures
    where lectures.id = transcript_chunks.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "transcript_chunks_update_course_managers_or_admin" on public.transcript_chunks;
create policy "transcript_chunks_update_course_managers_or_admin"
on public.transcript_chunks
for update
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = transcript_chunks.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
)
with check (
  exists (
    select 1
    from public.lectures
    where lectures.id = transcript_chunks.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "transcript_chunks_delete_course_managers_or_admin" on public.transcript_chunks;
create policy "transcript_chunks_delete_course_managers_or_admin"
on public.transcript_chunks
for delete
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = transcript_chunks.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);
