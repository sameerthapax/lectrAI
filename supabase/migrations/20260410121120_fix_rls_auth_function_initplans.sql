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
    where id = (select auth.uid())
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
        and owner_user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.course_members
      where course_id = target_course_id
        and user_id = (select auth.uid())
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
        and owner_user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.course_members
      where course_id = target_course_id
        and user_id = (select auth.uid())
        and is_active = true
        and membership_role in ('instructor', 'ta')
    );
$$;

do $$
declare
  r record;
  using_expr text;
  check_expr text;
  statement text;
begin
  for r in
    select schemaname, tablename, policyname, cmd, qual, with_check
    from pg_policies
    where schemaname in ('public', 'storage')
      and (
        qual like '%auth.uid()%'
        or with_check like '%auth.uid()%'
      )
  loop
    using_expr := replace(r.qual, 'auth.uid()', '(select auth.uid())');
    check_expr := replace(r.with_check, 'auth.uid()', '(select auth.uid())');
    statement := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);

    if r.cmd in ('ALL', 'SELECT', 'UPDATE', 'DELETE') and using_expr is not null then
      statement := statement || format(' using (%s)', using_expr);
    end if;

    if r.cmd in ('ALL', 'INSERT', 'UPDATE') and check_expr is not null then
      statement := statement || format(' with check (%s)', check_expr);
    end if;

    execute statement;
  end loop;
end;
$$;
