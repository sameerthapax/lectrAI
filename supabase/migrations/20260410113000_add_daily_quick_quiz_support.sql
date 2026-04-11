alter table public.quizzes
  alter column lecture_id drop not null;

alter table public.quiz_questions
  alter column lecture_id drop not null;

alter table public.quizzes
  add column if not exists scope varchar(20) not null default 'lecture'
    check (scope in ('lecture', 'daily_quick'));

alter table public.quizzes
  add column if not exists available_on date;

alter table public.quizzes
  drop constraint if exists quizzes_scope_context_check;

alter table public.quizzes
  add constraint quizzes_scope_context_check
  check (
    (
      scope = 'lecture'
      and lecture_id is not null
      and available_on is null
    )
    or (
      scope = 'daily_quick'
      and lecture_id is null
      and available_on is not null
    )
  );

create index if not exists idx_quizzes_scope on public.quizzes(scope);
create index if not exists idx_quizzes_available_on on public.quizzes(available_on);
create unique index if not exists idx_quizzes_daily_quick_available_on
  on public.quizzes(available_on)
  where scope = 'daily_quick';

drop policy if exists "quizzes_select_course_members_or_admin" on public.quizzes;
create policy "quizzes_select_course_members_or_admin"
on public.quizzes
for select
using (
  scope = 'daily_quick'
  or exists (
    select 1
    from public.lectures
    where lectures.id = quizzes.lecture_id
      and public.can_view_course(lectures.course_id)
  )
);

drop policy if exists "quizzes_insert_course_managers_or_admin" on public.quizzes;
create policy "quizzes_insert_course_managers_or_admin"
on public.quizzes
for insert
with check (
  (
    scope = 'daily_quick'
    and (
      generated_by_user_id = auth.uid()
      or generated_by_user_id is null
    )
  )
  or (
    (
      generated_by_user_id = auth.uid()
      or generated_by_user_id is null
    )
    and exists (
      select 1
      from public.lectures
      where lectures.id = quizzes.lecture_id
        and public.can_manage_course(lectures.course_id)
    )
  )
);

drop policy if exists "quizzes_update_course_managers_or_admin" on public.quizzes;
create policy "quizzes_update_course_managers_or_admin"
on public.quizzes
for update
using (
  (
    scope = 'daily_quick'
    and generated_by_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.lectures
    where lectures.id = quizzes.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
)
with check (
  (
    scope = 'daily_quick'
    and generated_by_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.lectures
    where lectures.id = quizzes.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "quizzes_delete_course_managers_or_admin" on public.quizzes;
create policy "quizzes_delete_course_managers_or_admin"
on public.quizzes
for delete
using (
  (
    scope = 'daily_quick'
    and generated_by_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.lectures
    where lectures.id = quizzes.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "quiz_questions_select_course_members_or_admin" on public.quiz_questions;
create policy "quiz_questions_select_course_members_or_admin"
on public.quiz_questions
for select
using (
  exists (
    select 1
    from public.quizzes
    where quizzes.id = quiz_questions.quiz_id
      and (
        quizzes.scope = 'daily_quick'
        or exists (
          select 1
          from public.lectures
          where lectures.id = quiz_questions.lecture_id
            and public.can_view_course(lectures.course_id)
        )
      )
  )
);

drop policy if exists "quiz_questions_insert_course_managers_or_admin" on public.quiz_questions;
create policy "quiz_questions_insert_course_managers_or_admin"
on public.quiz_questions
for insert
with check (
  exists (
    select 1
    from public.quizzes
    where quizzes.id = quiz_questions.quiz_id
      and (
        (
          quizzes.scope = 'daily_quick'
          and quiz_questions.lecture_id is null
          and quizzes.generated_by_user_id = auth.uid()
        )
        or (
          quizzes.scope = 'lecture'
          and quizzes.lecture_id = quiz_questions.lecture_id
          and exists (
            select 1
            from public.lectures
            where lectures.id = quiz_questions.lecture_id
              and public.can_manage_course(lectures.course_id)
          )
        )
      )
  )
);

drop policy if exists "quiz_questions_update_course_managers_or_admin" on public.quiz_questions;
create policy "quiz_questions_update_course_managers_or_admin"
on public.quiz_questions
for update
using (
  exists (
    select 1
    from public.quizzes
    where quizzes.id = quiz_questions.quiz_id
      and (
        (
          quizzes.scope = 'daily_quick'
          and quizzes.generated_by_user_id = auth.uid()
        )
        or (
          quizzes.scope = 'lecture'
          and exists (
            select 1
            from public.lectures
            where lectures.id = quiz_questions.lecture_id
              and public.can_manage_course(lectures.course_id)
          )
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.quizzes
    where quizzes.id = quiz_questions.quiz_id
      and (
        (
          quizzes.scope = 'daily_quick'
          and quiz_questions.lecture_id is null
          and quizzes.generated_by_user_id = auth.uid()
        )
        or (
          quizzes.scope = 'lecture'
          and exists (
            select 1
            from public.lectures
            where lectures.id = quiz_questions.lecture_id
              and public.can_manage_course(lectures.course_id)
          )
        )
      )
  )
);

drop policy if exists "quiz_questions_delete_course_managers_or_admin" on public.quiz_questions;
create policy "quiz_questions_delete_course_managers_or_admin"
on public.quiz_questions
for delete
using (
  exists (
    select 1
    from public.quizzes
    where quizzes.id = quiz_questions.quiz_id
      and (
        (
          quizzes.scope = 'daily_quick'
          and quizzes.generated_by_user_id = auth.uid()
        )
        or (
          quizzes.scope = 'lecture'
          and exists (
            select 1
            from public.lectures
            where lectures.id = quiz_questions.lecture_id
              and public.can_manage_course(lectures.course_id)
          )
        )
      )
  )
);

drop policy if exists "quiz_options_select_course_members_or_admin" on public.quiz_options;
create policy "quiz_options_select_course_members_or_admin"
on public.quiz_options
for select
using (
  exists (
    select 1
    from public.quiz_questions
    join public.quizzes on quizzes.id = quiz_questions.quiz_id
    left join public.lectures on lectures.id = quiz_questions.lecture_id
    where quiz_questions.id = quiz_options.question_id
      and (
        quizzes.scope = 'daily_quick'
        or public.can_view_course(lectures.course_id)
      )
  )
);

drop policy if exists "quiz_options_insert_course_managers_or_admin" on public.quiz_options;
create policy "quiz_options_insert_course_managers_or_admin"
on public.quiz_options
for insert
with check (
  exists (
    select 1
    from public.quiz_questions
    join public.quizzes on quizzes.id = quiz_questions.quiz_id
    left join public.lectures on lectures.id = quiz_questions.lecture_id
    where quiz_questions.id = quiz_options.question_id
      and (
        (
          quizzes.scope = 'daily_quick'
          and quizzes.generated_by_user_id = auth.uid()
        )
        or public.can_manage_course(lectures.course_id)
      )
  )
);

drop policy if exists "quiz_options_update_course_managers_or_admin" on public.quiz_options;
create policy "quiz_options_update_course_managers_or_admin"
on public.quiz_options
for update
using (
  exists (
    select 1
    from public.quiz_questions
    join public.quizzes on quizzes.id = quiz_questions.quiz_id
    left join public.lectures on lectures.id = quiz_questions.lecture_id
    where quiz_questions.id = quiz_options.question_id
      and (
        (
          quizzes.scope = 'daily_quick'
          and quizzes.generated_by_user_id = auth.uid()
        )
        or public.can_manage_course(lectures.course_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.quiz_questions
    join public.quizzes on quizzes.id = quiz_questions.quiz_id
    left join public.lectures on lectures.id = quiz_questions.lecture_id
    where quiz_questions.id = quiz_options.question_id
      and (
        (
          quizzes.scope = 'daily_quick'
          and quizzes.generated_by_user_id = auth.uid()
        )
        or public.can_manage_course(lectures.course_id)
      )
  )
);

drop policy if exists "quiz_options_delete_course_managers_or_admin" on public.quiz_options;
create policy "quiz_options_delete_course_managers_or_admin"
on public.quiz_options
for delete
using (
  exists (
    select 1
    from public.quiz_questions
    join public.quizzes on quizzes.id = quiz_questions.quiz_id
    left join public.lectures on lectures.id = quiz_questions.lecture_id
    where quiz_questions.id = quiz_options.question_id
      and (
        (
          quizzes.scope = 'daily_quick'
          and quizzes.generated_by_user_id = auth.uid()
        )
        or public.can_manage_course(lectures.course_id)
      )
  )
);

drop policy if exists "quiz_attempts_insert_owner_on_visible_quiz" on public.quiz_attempts;
create policy "quiz_attempts_insert_owner_on_visible_quiz"
on public.quiz_attempts
for insert
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.quizzes
    left join public.lectures on lectures.id = quizzes.lecture_id
    where quizzes.id = quiz_attempts.quiz_id
      and (
        quizzes.scope = 'daily_quick'
        or public.can_view_course(lectures.course_id)
      )
  )
);
