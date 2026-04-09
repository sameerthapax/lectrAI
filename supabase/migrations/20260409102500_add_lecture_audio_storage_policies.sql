drop policy if exists "lecture_audio_select_course_members_or_admin" on storage.objects;
create policy "lecture_audio_select_course_members_or_admin"
on storage.objects
for select
using (
  bucket_id = 'lecture-audio'
  and array_length(storage.foldername(name), 1) >= 2
  and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
  and public.can_view_course(((storage.foldername(name))[2])::uuid)
);

drop policy if exists "lecture_audio_insert_course_managers_or_admin" on storage.objects;
create policy "lecture_audio_insert_course_managers_or_admin"
on storage.objects
for insert
with check (
  bucket_id = 'lecture-audio'
  and auth.uid() is not null
  and array_length(storage.foldername(name), 1) >= 2
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
  and public.can_manage_course(((storage.foldername(name))[2])::uuid)
);

drop policy if exists "lecture_audio_update_course_managers_or_admin" on storage.objects;
create policy "lecture_audio_update_course_managers_or_admin"
on storage.objects
for update
using (
  bucket_id = 'lecture-audio'
  and auth.uid() is not null
  and array_length(storage.foldername(name), 1) >= 2
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
  and public.can_manage_course(((storage.foldername(name))[2])::uuid)
)
with check (
  bucket_id = 'lecture-audio'
  and auth.uid() is not null
  and array_length(storage.foldername(name), 1) >= 2
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
  and public.can_manage_course(((storage.foldername(name))[2])::uuid)
);

drop policy if exists "lecture_audio_delete_course_managers_or_admin" on storage.objects;
create policy "lecture_audio_delete_course_managers_or_admin"
on storage.objects
for delete
using (
  bucket_id = 'lecture-audio'
  and auth.uid() is not null
  and array_length(storage.foldername(name), 1) >= 2
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
  and public.can_manage_course(((storage.foldername(name))[2])::uuid)
);
