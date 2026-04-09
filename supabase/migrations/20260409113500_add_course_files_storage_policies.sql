drop policy if exists "course_files_select_course_members_or_admin" on storage.objects;
create policy "course_files_select_course_members_or_admin"
on storage.objects
for select
using (
  bucket_id = 'course-files'
  and array_length(storage.foldername(name), 1) >= 2
  and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
  and public.can_view_course(((storage.foldername(name))[2])::uuid)
);

drop policy if exists "course_files_insert_course_managers_or_admin" on storage.objects;
create policy "course_files_insert_course_managers_or_admin"
on storage.objects
for insert
with check (
  bucket_id = 'course-files'
  and auth.uid() is not null
  and array_length(storage.foldername(name), 1) >= 2
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
  and public.can_manage_course(((storage.foldername(name))[2])::uuid)
);

drop policy if exists "course_files_update_course_managers_or_admin" on storage.objects;
create policy "course_files_update_course_managers_or_admin"
on storage.objects
for update
using (
  bucket_id = 'course-files'
  and auth.uid() is not null
  and array_length(storage.foldername(name), 1) >= 2
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
  and public.can_manage_course(((storage.foldername(name))[2])::uuid)
)
with check (
  bucket_id = 'course-files'
  and auth.uid() is not null
  and array_length(storage.foldername(name), 1) >= 2
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
  and public.can_manage_course(((storage.foldername(name))[2])::uuid)
);

drop policy if exists "course_files_delete_course_managers_or_admin" on storage.objects;
create policy "course_files_delete_course_managers_or_admin"
on storage.objects
for delete
using (
  bucket_id = 'course-files'
  and auth.uid() is not null
  and array_length(storage.foldername(name), 1) >= 2
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
  and public.can_manage_course(((storage.foldername(name))[2])::uuid)
);
