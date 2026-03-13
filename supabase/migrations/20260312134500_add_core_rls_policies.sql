create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role = 'admin'
      and is_active = true
  );
$$;

create or replace function public.can_view_course(target_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.courses
      where id = target_course_id
        and owner_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.course_members
      where course_id = target_course_id
        and user_id = auth.uid()
        and is_active = true
    );
$$;

create or replace function public.can_manage_course(target_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.courses
      where id = target_course_id
        and owner_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.course_members
      where course_id = target_course_id
        and user_id = auth.uid()
        and is_active = true
        and membership_role in ('instructor', 'ta')
    );
$$;

drop policy if exists "users_select_self_or_admin" on public.users;
create policy "users_select_self_or_admin"
on public.users
for select
using (
  id = auth.uid()
  or public.is_admin()
);

drop policy if exists "users_update_self_or_admin" on public.users;
create policy "users_update_self_or_admin"
on public.users
for update
using (
  id = auth.uid()
  or public.is_admin()
)
with check (
  id = auth.uid()
  or public.is_admin()
);

drop policy if exists "user_settings_select_owner_or_admin" on public.user_settings;
create policy "user_settings_select_owner_or_admin"
on public.user_settings
for select
using (
  user_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "user_settings_insert_owner_or_admin" on public.user_settings;
create policy "user_settings_insert_owner_or_admin"
on public.user_settings
for insert
with check (
  user_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "user_settings_update_owner_or_admin" on public.user_settings;
create policy "user_settings_update_owner_or_admin"
on public.user_settings
for update
using (
  user_id = auth.uid()
  or public.is_admin()
)
with check (
  user_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "courses_select_members_or_admin" on public.courses;
create policy "courses_select_members_or_admin"
on public.courses
for select
using (
  public.can_view_course(id)
);

drop policy if exists "courses_insert_owner_or_admin" on public.courses;
create policy "courses_insert_owner_or_admin"
on public.courses
for insert
with check (
  owner_user_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "courses_update_managers_or_admin" on public.courses;
create policy "courses_update_managers_or_admin"
on public.courses
for update
using (
  public.can_manage_course(id)
)
with check (
  public.can_manage_course(id)
);

drop policy if exists "courses_delete_owners_or_admin" on public.courses;
create policy "courses_delete_owners_or_admin"
on public.courses
for delete
using (
  owner_user_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "course_members_select_course_members_or_admin" on public.course_members;
create policy "course_members_select_course_members_or_admin"
on public.course_members
for select
using (
  user_id = auth.uid()
  or public.can_view_course(course_id)
);

drop policy if exists "course_members_insert_course_managers_or_admin" on public.course_members;
create policy "course_members_insert_course_managers_or_admin"
on public.course_members
for insert
with check (
  public.can_manage_course(course_id)
);

drop policy if exists "course_members_update_course_managers_or_admin" on public.course_members;
create policy "course_members_update_course_managers_or_admin"
on public.course_members
for update
using (
  public.can_manage_course(course_id)
)
with check (
  public.can_manage_course(course_id)
);

drop policy if exists "course_members_delete_course_managers_or_admin" on public.course_members;
create policy "course_members_delete_course_managers_or_admin"
on public.course_members
for delete
using (
  public.can_manage_course(course_id)
);

drop policy if exists "lectures_select_course_members_or_admin" on public.lectures;
create policy "lectures_select_course_members_or_admin"
on public.lectures
for select
using (
  public.can_view_course(course_id)
);

drop policy if exists "lectures_insert_course_managers_or_admin" on public.lectures;
create policy "lectures_insert_course_managers_or_admin"
on public.lectures
for insert
with check (
  (
    created_by_user_id = auth.uid()
    and public.can_manage_course(course_id)
  )
  or public.is_admin()
);

drop policy if exists "lectures_update_course_managers_or_admin" on public.lectures;
create policy "lectures_update_course_managers_or_admin"
on public.lectures
for update
using (
  public.can_manage_course(course_id)
)
with check (
  public.can_manage_course(course_id)
);

drop policy if exists "lectures_delete_course_managers_or_admin" on public.lectures;
create policy "lectures_delete_course_managers_or_admin"
on public.lectures
for delete
using (
  public.can_manage_course(course_id)
);
