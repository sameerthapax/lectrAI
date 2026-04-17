drop policy if exists "audio_files_select_course_members_or_admin" on public.audio_files;
create policy "audio_files_select_course_members_or_admin"
on public.audio_files
for select
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = audio_files.lecture_id
      and public.can_view_course(lectures.course_id)
  )
);

drop policy if exists "audio_files_insert_course_managers_or_admin" on public.audio_files;
create policy "audio_files_insert_course_managers_or_admin"
on public.audio_files
for insert
with check (
  uploaded_by_user_id = auth.uid()
  and exists (
    select 1
    from public.lectures
    where lectures.id = audio_files.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "audio_files_update_course_managers_or_admin" on public.audio_files;
create policy "audio_files_update_course_managers_or_admin"
on public.audio_files
for update
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = audio_files.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
)
with check (
  exists (
    select 1
    from public.lectures
    where lectures.id = audio_files.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "audio_files_delete_course_managers_or_admin" on public.audio_files;
create policy "audio_files_delete_course_managers_or_admin"
on public.audio_files
for delete
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = audio_files.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "processing_jobs_select_course_members_or_admin" on public.processing_jobs;
create policy "processing_jobs_select_course_members_or_admin"
on public.processing_jobs
for select
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = processing_jobs.lecture_id
      and public.can_view_course(lectures.course_id)
  )
);

drop policy if exists "processing_jobs_insert_course_managers_or_admin" on public.processing_jobs;
create policy "processing_jobs_insert_course_managers_or_admin"
on public.processing_jobs
for insert
with check (
  (
    triggered_by_user_id = auth.uid()
    or triggered_by_user_id is null
  )
  and exists (
    select 1
    from public.lectures
    where lectures.id = processing_jobs.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "processing_jobs_update_course_managers_or_admin" on public.processing_jobs;
create policy "processing_jobs_update_course_managers_or_admin"
on public.processing_jobs
for update
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = processing_jobs.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
)
with check (
  exists (
    select 1
    from public.lectures
    where lectures.id = processing_jobs.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "processing_jobs_delete_course_managers_or_admin" on public.processing_jobs;
create policy "processing_jobs_delete_course_managers_or_admin"
on public.processing_jobs
for delete
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = processing_jobs.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "transcripts_select_course_members_or_admin" on public.transcripts;
create policy "transcripts_select_course_members_or_admin"
on public.transcripts
for select
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = transcripts.lecture_id
      and public.can_view_course(lectures.course_id)
  )
);

drop policy if exists "transcripts_insert_course_managers_or_admin" on public.transcripts;
create policy "transcripts_insert_course_managers_or_admin"
on public.transcripts
for insert
with check (
  exists (
    select 1
    from public.lectures
    where lectures.id = transcripts.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "transcripts_update_course_managers_or_admin" on public.transcripts;
create policy "transcripts_update_course_managers_or_admin"
on public.transcripts
for update
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = transcripts.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
)
with check (
  exists (
    select 1
    from public.lectures
    where lectures.id = transcripts.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "transcripts_delete_course_managers_or_admin" on public.transcripts;
create policy "transcripts_delete_course_managers_or_admin"
on public.transcripts
for delete
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = transcripts.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "transcript_segments_select_course_members_or_admin" on public.transcript_segments;
create policy "transcript_segments_select_course_members_or_admin"
on public.transcript_segments
for select
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = transcript_segments.lecture_id
      and public.can_view_course(lectures.course_id)
  )
);

drop policy if exists "transcript_segments_insert_course_managers_or_admin" on public.transcript_segments;
create policy "transcript_segments_insert_course_managers_or_admin"
on public.transcript_segments
for insert
with check (
  exists (
    select 1
    from public.lectures
    where lectures.id = transcript_segments.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "transcript_segments_update_course_managers_or_admin" on public.transcript_segments;
create policy "transcript_segments_update_course_managers_or_admin"
on public.transcript_segments
for update
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = transcript_segments.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
)
with check (
  exists (
    select 1
    from public.lectures
    where lectures.id = transcript_segments.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "transcript_segments_delete_course_managers_or_admin" on public.transcript_segments;
create policy "transcript_segments_delete_course_managers_or_admin"
on public.transcript_segments
for delete
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = transcript_segments.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "lecture_summaries_select_course_members_or_admin" on public.lecture_summaries;
create policy "lecture_summaries_select_course_members_or_admin"
on public.lecture_summaries
for select
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = lecture_summaries.lecture_id
      and public.can_view_course(lectures.course_id)
  )
);

drop policy if exists "lecture_summaries_insert_course_managers_or_admin" on public.lecture_summaries;
create policy "lecture_summaries_insert_course_managers_or_admin"
on public.lecture_summaries
for insert
with check (
  exists (
    select 1
    from public.lectures
    where lectures.id = lecture_summaries.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "lecture_summaries_update_course_managers_or_admin" on public.lecture_summaries;
create policy "lecture_summaries_update_course_managers_or_admin"
on public.lecture_summaries
for update
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = lecture_summaries.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
)
with check (
  exists (
    select 1
    from public.lectures
    where lectures.id = lecture_summaries.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "lecture_summaries_delete_course_managers_or_admin" on public.lecture_summaries;
create policy "lecture_summaries_delete_course_managers_or_admin"
on public.lecture_summaries
for delete
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = lecture_summaries.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "key_concepts_select_course_members_or_admin" on public.key_concepts;
create policy "key_concepts_select_course_members_or_admin"
on public.key_concepts
for select
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = key_concepts.lecture_id
      and public.can_view_course(lectures.course_id)
  )
);

drop policy if exists "key_concepts_insert_course_managers_or_admin" on public.key_concepts;
create policy "key_concepts_insert_course_managers_or_admin"
on public.key_concepts
for insert
with check (
  exists (
    select 1
    from public.lectures
    where lectures.id = key_concepts.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "key_concepts_update_course_managers_or_admin" on public.key_concepts;
create policy "key_concepts_update_course_managers_or_admin"
on public.key_concepts
for update
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = key_concepts.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
)
with check (
  exists (
    select 1
    from public.lectures
    where lectures.id = key_concepts.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "key_concepts_delete_course_managers_or_admin" on public.key_concepts;
create policy "key_concepts_delete_course_managers_or_admin"
on public.key_concepts
for delete
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = key_concepts.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "timeline_events_select_course_members_or_admin" on public.timeline_events;
create policy "timeline_events_select_course_members_or_admin"
on public.timeline_events
for select
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = timeline_events.lecture_id
      and public.can_view_course(lectures.course_id)
  )
);

drop policy if exists "timeline_events_insert_course_managers_or_admin" on public.timeline_events;
create policy "timeline_events_insert_course_managers_or_admin"
on public.timeline_events
for insert
with check (
  exists (
    select 1
    from public.lectures
    where lectures.id = timeline_events.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "timeline_events_update_course_managers_or_admin" on public.timeline_events;
create policy "timeline_events_update_course_managers_or_admin"
on public.timeline_events
for update
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = timeline_events.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
)
with check (
  exists (
    select 1
    from public.lectures
    where lectures.id = timeline_events.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "timeline_events_delete_course_managers_or_admin" on public.timeline_events;
create policy "timeline_events_delete_course_managers_or_admin"
on public.timeline_events
for delete
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = timeline_events.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "embedding_documents_select_course_members_or_admin" on public.embedding_documents;
create policy "embedding_documents_select_course_members_or_admin"
on public.embedding_documents
for select
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = embedding_documents.lecture_id
      and public.can_view_course(lectures.course_id)
  )
);

drop policy if exists "embedding_documents_insert_course_managers_or_admin" on public.embedding_documents;
create policy "embedding_documents_insert_course_managers_or_admin"
on public.embedding_documents
for insert
with check (
  exists (
    select 1
    from public.lectures
    where lectures.id = embedding_documents.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "embedding_documents_update_course_managers_or_admin" on public.embedding_documents;
create policy "embedding_documents_update_course_managers_or_admin"
on public.embedding_documents
for update
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = embedding_documents.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
)
with check (
  exists (
    select 1
    from public.lectures
    where lectures.id = embedding_documents.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "embedding_documents_delete_course_managers_or_admin" on public.embedding_documents;
create policy "embedding_documents_delete_course_managers_or_admin"
on public.embedding_documents
for delete
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = embedding_documents.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);
