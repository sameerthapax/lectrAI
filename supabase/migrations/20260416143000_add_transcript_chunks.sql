create schema if not exists extensions;
create extension if not exists vector with schema extensions;

do $$
begin
  if exists (
    select 1
    from pg_extension ext
    join pg_namespace nsp
      on nsp.oid = ext.extnamespace
    where ext.extname = 'vector'
      and nsp.nspname <> 'extensions'
  ) then
    execute 'alter extension vector set schema extensions';
  end if;
end
$$;

create table if not exists public.transcript_chunks (
  id uuid primary key default gen_random_uuid(),
  transcript_id uuid not null references public.processed_transcripts(id) on delete cascade,
  chunk_index integer not null,
  speaker text,
  content text not null,
  chunk_text text not null,
  embedding extensions.vector(1536) not null,
  embedding_model text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint transcript_chunks_transcript_id_chunk_index_key unique (transcript_id, chunk_index)
);

comment on table public.transcript_chunks is
  'Chunk-level transcript embeddings for retrieval over processed transcript speaker segments.';
comment on column public.transcript_chunks.chunk_text is
  'Normalized speaker-prefixed text sent to the embeddings API, for example "Professor: Today we will discuss supervised learning."';

create index if not exists idx_transcript_chunks_transcript_id
  on public.transcript_chunks(transcript_id);

create index if not exists idx_transcript_chunks_chunk_index
  on public.transcript_chunks(chunk_index);

create index if not exists idx_transcript_chunks_embedding_hnsw
  on public.transcript_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.transcript_chunks enable row level security;

drop policy if exists "transcript_chunks_select_course_members_or_admin" on public.transcript_chunks;
create policy "transcript_chunks_select_course_members_or_admin"
on public.transcript_chunks
for select
using (
  exists (
    select 1
    from public.processed_transcripts pt
    inner join public.lectures l
      on l.id = pt.lecture_id
    where pt.id = transcript_chunks.transcript_id
      and public.can_view_course(l.course_id)
  )
);

drop policy if exists "transcript_chunks_insert_course_managers_or_admin" on public.transcript_chunks;
create policy "transcript_chunks_insert_course_managers_or_admin"
on public.transcript_chunks
for insert
with check (
  exists (
    select 1
    from public.processed_transcripts pt
    inner join public.lectures l
      on l.id = pt.lecture_id
    where pt.id = transcript_chunks.transcript_id
      and public.can_manage_course(l.course_id)
  )
);

drop policy if exists "transcript_chunks_update_course_managers_or_admin" on public.transcript_chunks;
create policy "transcript_chunks_update_course_managers_or_admin"
on public.transcript_chunks
for update
using (
  exists (
    select 1
    from public.processed_transcripts pt
    inner join public.lectures l
      on l.id = pt.lecture_id
    where pt.id = transcript_chunks.transcript_id
      and public.can_manage_course(l.course_id)
  )
)
with check (
  exists (
    select 1
    from public.processed_transcripts pt
    inner join public.lectures l
      on l.id = pt.lecture_id
    where pt.id = transcript_chunks.transcript_id
      and public.can_manage_course(l.course_id)
  )
);

drop policy if exists "transcript_chunks_delete_course_managers_or_admin" on public.transcript_chunks;
create policy "transcript_chunks_delete_course_managers_or_admin"
on public.transcript_chunks
for delete
using (
  exists (
    select 1
    from public.processed_transcripts pt
    inner join public.lectures l
      on l.id = pt.lecture_id
    where pt.id = transcript_chunks.transcript_id
      and public.can_manage_course(l.course_id)
  )
);
