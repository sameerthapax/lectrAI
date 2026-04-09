alter table public.course_files enable row level security;

drop policy if exists "course_files_select_course_members_or_admin" on public.course_files;
create policy "course_files_select_course_members_or_admin"
on public.course_files
for select
using (
  public.can_view_course(course_id)
);

drop policy if exists "course_files_insert_course_managers_or_admin" on public.course_files;
create policy "course_files_insert_course_managers_or_admin"
on public.course_files
for insert
with check (
  uploaded_by_user_id = auth.uid()
  and public.can_manage_course(course_id)
);

drop policy if exists "course_files_update_course_managers_or_admin" on public.course_files;
create policy "course_files_update_course_managers_or_admin"
on public.course_files
for update
using (
  public.can_manage_course(course_id)
)
with check (
  public.can_manage_course(course_id)
);

drop policy if exists "course_files_delete_course_managers_or_admin" on public.course_files;
create policy "course_files_delete_course_managers_or_admin"
on public.course_files
for delete
using (
  public.can_manage_course(course_id)
);
