drop policy if exists "study_materials_select_course_members_or_admin" on public.study_materials;
create policy "study_materials_select_course_members_or_admin"
on public.study_materials
for select
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = study_materials.lecture_id
      and public.can_view_course(lectures.course_id)
  )
);

drop policy if exists "study_materials_insert_course_managers_or_admin" on public.study_materials;
create policy "study_materials_insert_course_managers_or_admin"
on public.study_materials
for insert
with check (
  exists (
    select 1
    from public.lectures
    where lectures.id = study_materials.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "study_materials_update_course_managers_or_admin" on public.study_materials;
create policy "study_materials_update_course_managers_or_admin"
on public.study_materials
for update
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = study_materials.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
)
with check (
  exists (
    select 1
    from public.lectures
    where lectures.id = study_materials.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "study_materials_delete_course_managers_or_admin" on public.study_materials;
create policy "study_materials_delete_course_managers_or_admin"
on public.study_materials
for delete
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = study_materials.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "quizzes_select_course_members_or_admin" on public.quizzes;
create policy "quizzes_select_course_members_or_admin"
on public.quizzes
for select
using (
  exists (
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
    generated_by_user_id = auth.uid()
    or generated_by_user_id is null
  )
  and exists (
    select 1
    from public.lectures
    where lectures.id = quizzes.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "quizzes_update_course_managers_or_admin" on public.quizzes;
create policy "quizzes_update_course_managers_or_admin"
on public.quizzes
for update
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = quizzes.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
)
with check (
  exists (
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
  exists (
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
    from public.lectures
    where lectures.id = quiz_questions.lecture_id
      and public.can_view_course(lectures.course_id)
  )
);

drop policy if exists "quiz_questions_insert_course_managers_or_admin" on public.quiz_questions;
create policy "quiz_questions_insert_course_managers_or_admin"
on public.quiz_questions
for insert
with check (
  exists (
    select 1
    from public.lectures
    where lectures.id = quiz_questions.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
  and exists (
    select 1
    from public.quizzes
    where quizzes.id = quiz_questions.quiz_id
      and quizzes.lecture_id = quiz_questions.lecture_id
  )
);

drop policy if exists "quiz_questions_update_course_managers_or_admin" on public.quiz_questions;
create policy "quiz_questions_update_course_managers_or_admin"
on public.quiz_questions
for update
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = quiz_questions.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
)
with check (
  exists (
    select 1
    from public.lectures
    where lectures.id = quiz_questions.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "quiz_questions_delete_course_managers_or_admin" on public.quiz_questions;
create policy "quiz_questions_delete_course_managers_or_admin"
on public.quiz_questions
for delete
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = quiz_questions.lecture_id
      and public.can_manage_course(lectures.course_id)
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
    join public.lectures on lectures.id = quiz_questions.lecture_id
    where quiz_questions.id = quiz_options.question_id
      and public.can_view_course(lectures.course_id)
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
    join public.lectures on lectures.id = quiz_questions.lecture_id
    where quiz_questions.id = quiz_options.question_id
      and public.can_manage_course(lectures.course_id)
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
    join public.lectures on lectures.id = quiz_questions.lecture_id
    where quiz_questions.id = quiz_options.question_id
      and public.can_manage_course(lectures.course_id)
  )
)
with check (
  exists (
    select 1
    from public.quiz_questions
    join public.lectures on lectures.id = quiz_questions.lecture_id
    where quiz_questions.id = quiz_options.question_id
      and public.can_manage_course(lectures.course_id)
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
    join public.lectures on lectures.id = quiz_questions.lecture_id
    where quiz_questions.id = quiz_options.question_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "quiz_attempts_select_owner_course_members_or_admin" on public.quiz_attempts;
create policy "quiz_attempts_select_owner_course_members_or_admin"
on public.quiz_attempts
for select
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.quizzes
    join public.lectures on lectures.id = quizzes.lecture_id
    where quizzes.id = quiz_attempts.quiz_id
      and public.can_manage_course(lectures.course_id)
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
    join public.lectures on lectures.id = quizzes.lecture_id
    where quizzes.id = quiz_attempts.quiz_id
      and public.can_view_course(lectures.course_id)
  )
);

drop policy if exists "quiz_attempts_update_owner_or_course_managers" on public.quiz_attempts;
create policy "quiz_attempts_update_owner_or_course_managers"
on public.quiz_attempts
for update
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.quizzes
    join public.lectures on lectures.id = quizzes.lecture_id
    where quizzes.id = quiz_attempts.quiz_id
      and public.can_manage_course(lectures.course_id)
  )
)
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.quizzes
    join public.lectures on lectures.id = quizzes.lecture_id
    where quizzes.id = quiz_attempts.quiz_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "quiz_attempts_delete_owner_or_course_managers" on public.quiz_attempts;
create policy "quiz_attempts_delete_owner_or_course_managers"
on public.quiz_attempts
for delete
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.quizzes
    join public.lectures on lectures.id = quizzes.lecture_id
    where quizzes.id = quiz_attempts.quiz_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "quiz_attempt_answers_select_owner_or_course_managers" on public.quiz_attempt_answers;
create policy "quiz_attempt_answers_select_owner_or_course_managers"
on public.quiz_attempt_answers
for select
using (
  exists (
    select 1
    from public.quiz_attempts
    where quiz_attempts.id = quiz_attempt_answers.quiz_attempt_id
      and quiz_attempts.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.quiz_attempts
    join public.quizzes on quizzes.id = quiz_attempts.quiz_id
    join public.lectures on lectures.id = quizzes.lecture_id
    where quiz_attempts.id = quiz_attempt_answers.quiz_attempt_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "quiz_attempt_answers_insert_owner_on_own_attempt" on public.quiz_attempt_answers;
create policy "quiz_attempt_answers_insert_owner_on_own_attempt"
on public.quiz_attempt_answers
for insert
with check (
  exists (
    select 1
    from public.quiz_attempts
    where quiz_attempts.id = quiz_attempt_answers.quiz_attempt_id
      and quiz_attempts.user_id = auth.uid()
  )
);

drop policy if exists "quiz_attempt_answers_update_owner_or_course_managers" on public.quiz_attempt_answers;
create policy "quiz_attempt_answers_update_owner_or_course_managers"
on public.quiz_attempt_answers
for update
using (
  exists (
    select 1
    from public.quiz_attempts
    where quiz_attempts.id = quiz_attempt_answers.quiz_attempt_id
      and quiz_attempts.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.quiz_attempts
    join public.quizzes on quizzes.id = quiz_attempts.quiz_id
    join public.lectures on lectures.id = quizzes.lecture_id
    where quiz_attempts.id = quiz_attempt_answers.quiz_attempt_id
      and public.can_manage_course(lectures.course_id)
  )
)
with check (
  exists (
    select 1
    from public.quiz_attempts
    where quiz_attempts.id = quiz_attempt_answers.quiz_attempt_id
      and quiz_attempts.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.quiz_attempts
    join public.quizzes on quizzes.id = quiz_attempts.quiz_id
    join public.lectures on lectures.id = quizzes.lecture_id
    where quiz_attempts.id = quiz_attempt_answers.quiz_attempt_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "quiz_attempt_answers_delete_owner_or_course_managers" on public.quiz_attempt_answers;
create policy "quiz_attempt_answers_delete_owner_or_course_managers"
on public.quiz_attempt_answers
for delete
using (
  exists (
    select 1
    from public.quiz_attempts
    where quiz_attempts.id = quiz_attempt_answers.quiz_attempt_id
      and quiz_attempts.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.quiz_attempts
    join public.quizzes on quizzes.id = quiz_attempts.quiz_id
    join public.lectures on lectures.id = quizzes.lecture_id
    where quiz_attempts.id = quiz_attempt_answers.quiz_attempt_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "chat_sessions_select_owner_or_course_members" on public.chat_sessions;
create policy "chat_sessions_select_owner_or_course_members"
on public.chat_sessions
for select
using (
  user_id = auth.uid()
  or (
    course_id is not null
    and public.can_view_course(course_id)
  )
  or (
    lecture_id is not null
    and exists (
      select 1
      from public.lectures
      where lectures.id = chat_sessions.lecture_id
        and public.can_view_course(lectures.course_id)
    )
  )
);

drop policy if exists "chat_sessions_insert_owner_on_visible_scope" on public.chat_sessions;
create policy "chat_sessions_insert_owner_on_visible_scope"
on public.chat_sessions
for insert
with check (
  user_id = auth.uid()
  and (
    (
      course_id is null
      and lecture_id is null
    )
    or (
      course_id is not null
      and public.can_view_course(course_id)
    )
    or (
      lecture_id is not null
      and exists (
        select 1
        from public.lectures
        where lectures.id = chat_sessions.lecture_id
          and public.can_view_course(lectures.course_id)
      )
    )
  )
);

drop policy if exists "chat_sessions_update_owner_or_course_managers" on public.chat_sessions;
create policy "chat_sessions_update_owner_or_course_managers"
on public.chat_sessions
for update
using (
  user_id = auth.uid()
  or (
    course_id is not null
    and public.can_manage_course(course_id)
  )
  or (
    lecture_id is not null
    and exists (
      select 1
      from public.lectures
      where lectures.id = chat_sessions.lecture_id
        and public.can_manage_course(lectures.course_id)
    )
  )
)
with check (
  user_id = auth.uid()
  or (
    course_id is not null
    and public.can_manage_course(course_id)
  )
  or (
    lecture_id is not null
    and exists (
      select 1
      from public.lectures
      where lectures.id = chat_sessions.lecture_id
        and public.can_manage_course(lectures.course_id)
    )
  )
);

drop policy if exists "chat_sessions_delete_owner_or_course_managers" on public.chat_sessions;
create policy "chat_sessions_delete_owner_or_course_managers"
on public.chat_sessions
for delete
using (
  user_id = auth.uid()
  or (
    course_id is not null
    and public.can_manage_course(course_id)
  )
  or (
    lecture_id is not null
    and exists (
      select 1
      from public.lectures
      where lectures.id = chat_sessions.lecture_id
        and public.can_manage_course(lectures.course_id)
    )
  )
);

drop policy if exists "chat_messages_select_session_members_or_admin" on public.chat_messages;
create policy "chat_messages_select_session_members_or_admin"
on public.chat_messages
for select
using (
  exists (
    select 1
    from public.chat_sessions
    where chat_sessions.id = chat_messages.chat_session_id
      and (
        chat_sessions.user_id = auth.uid()
        or (
          chat_sessions.course_id is not null
          and public.can_view_course(chat_sessions.course_id)
        )
        or (
          chat_sessions.lecture_id is not null
          and exists (
            select 1
            from public.lectures
            where lectures.id = chat_sessions.lecture_id
              and public.can_view_course(lectures.course_id)
          )
        )
      )
  )
);

drop policy if exists "chat_messages_insert_session_owner_or_system" on public.chat_messages;
create policy "chat_messages_insert_session_owner_or_system"
on public.chat_messages
for insert
with check (
  exists (
    select 1
    from public.chat_sessions
    where chat_sessions.id = chat_messages.chat_session_id
      and (
        (
          chat_messages.user_id = auth.uid()
          and chat_sessions.user_id = auth.uid()
        )
        or (
          chat_messages.user_id is null
          and chat_messages.role in ('assistant', 'system')
          and (
            chat_sessions.user_id = auth.uid()
            or (
              chat_sessions.course_id is not null
              and public.can_manage_course(chat_sessions.course_id)
            )
            or (
              chat_sessions.lecture_id is not null
              and exists (
                select 1
                from public.lectures
                where lectures.id = chat_sessions.lecture_id
                  and public.can_manage_course(lectures.course_id)
              )
            )
          )
        )
      )
  )
);

drop policy if exists "chat_messages_update_session_owner_or_course_managers" on public.chat_messages;
create policy "chat_messages_update_session_owner_or_course_managers"
on public.chat_messages
for update
using (
  exists (
    select 1
    from public.chat_sessions
    where chat_sessions.id = chat_messages.chat_session_id
      and (
        chat_sessions.user_id = auth.uid()
        or (
          chat_sessions.course_id is not null
          and public.can_manage_course(chat_sessions.course_id)
        )
        or (
          chat_sessions.lecture_id is not null
          and exists (
            select 1
            from public.lectures
            where lectures.id = chat_sessions.lecture_id
              and public.can_manage_course(lectures.course_id)
          )
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.chat_sessions
    where chat_sessions.id = chat_messages.chat_session_id
      and (
        chat_sessions.user_id = auth.uid()
        or (
          chat_sessions.course_id is not null
          and public.can_manage_course(chat_sessions.course_id)
        )
        or (
          chat_sessions.lecture_id is not null
          and exists (
            select 1
            from public.lectures
            where lectures.id = chat_sessions.lecture_id
              and public.can_manage_course(lectures.course_id)
          )
        )
      )
  )
);

drop policy if exists "chat_messages_delete_session_owner_or_course_managers" on public.chat_messages;
create policy "chat_messages_delete_session_owner_or_course_managers"
on public.chat_messages
for delete
using (
  exists (
    select 1
    from public.chat_sessions
    where chat_sessions.id = chat_messages.chat_session_id
      and (
        chat_sessions.user_id = auth.uid()
        or (
          chat_sessions.course_id is not null
          and public.can_manage_course(chat_sessions.course_id)
        )
        or (
          chat_sessions.lecture_id is not null
          and exists (
            select 1
            from public.lectures
            where lectures.id = chat_sessions.lecture_id
              and public.can_manage_course(lectures.course_id)
          )
        )
      )
  )
);

drop policy if exists "chat_citations_select_session_members_or_admin" on public.chat_citations;
create policy "chat_citations_select_session_members_or_admin"
on public.chat_citations
for select
using (
  exists (
    select 1
    from public.chat_messages
    join public.chat_sessions on chat_sessions.id = chat_messages.chat_session_id
    where chat_messages.id = chat_citations.chat_message_id
      and (
        chat_sessions.user_id = auth.uid()
        or (
          chat_sessions.course_id is not null
          and public.can_view_course(chat_sessions.course_id)
        )
        or (
          chat_sessions.lecture_id is not null
          and exists (
            select 1
            from public.lectures
            where lectures.id = chat_sessions.lecture_id
              and public.can_view_course(lectures.course_id)
          )
        )
      )
  )
);

drop policy if exists "chat_citations_insert_session_owner_or_course_managers" on public.chat_citations;
create policy "chat_citations_insert_session_owner_or_course_managers"
on public.chat_citations
for insert
with check (
  exists (
    select 1
    from public.chat_messages
    join public.chat_sessions on chat_sessions.id = chat_messages.chat_session_id
    where chat_messages.id = chat_citations.chat_message_id
      and (
        chat_sessions.user_id = auth.uid()
        or (
          chat_sessions.course_id is not null
          and public.can_manage_course(chat_sessions.course_id)
        )
        or (
          chat_sessions.lecture_id is not null
          and exists (
            select 1
            from public.lectures
            where lectures.id = chat_sessions.lecture_id
              and public.can_manage_course(lectures.course_id)
          )
        )
      )
  )
);

drop policy if exists "chat_citations_update_session_owner_or_course_managers" on public.chat_citations;
create policy "chat_citations_update_session_owner_or_course_managers"
on public.chat_citations
for update
using (
  exists (
    select 1
    from public.chat_messages
    join public.chat_sessions on chat_sessions.id = chat_messages.chat_session_id
    where chat_messages.id = chat_citations.chat_message_id
      and (
        chat_sessions.user_id = auth.uid()
        or (
          chat_sessions.course_id is not null
          and public.can_manage_course(chat_sessions.course_id)
        )
        or (
          chat_sessions.lecture_id is not null
          and exists (
            select 1
            from public.lectures
            where lectures.id = chat_sessions.lecture_id
              and public.can_manage_course(lectures.course_id)
          )
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.chat_messages
    join public.chat_sessions on chat_sessions.id = chat_messages.chat_session_id
    where chat_messages.id = chat_citations.chat_message_id
      and (
        chat_sessions.user_id = auth.uid()
        or (
          chat_sessions.course_id is not null
          and public.can_manage_course(chat_sessions.course_id)
        )
        or (
          chat_sessions.lecture_id is not null
          and exists (
            select 1
            from public.lectures
            where lectures.id = chat_sessions.lecture_id
              and public.can_manage_course(lectures.course_id)
          )
        )
      )
  )
);

drop policy if exists "chat_citations_delete_session_owner_or_course_managers" on public.chat_citations;
create policy "chat_citations_delete_session_owner_or_course_managers"
on public.chat_citations
for delete
using (
  exists (
    select 1
    from public.chat_messages
    join public.chat_sessions on chat_sessions.id = chat_messages.chat_session_id
    where chat_messages.id = chat_citations.chat_message_id
      and (
        chat_sessions.user_id = auth.uid()
        or (
          chat_sessions.course_id is not null
          and public.can_manage_course(chat_sessions.course_id)
        )
        or (
          chat_sessions.lecture_id is not null
          and exists (
            select 1
            from public.lectures
            where lectures.id = chat_sessions.lecture_id
              and public.can_manage_course(lectures.course_id)
          )
        )
      )
  )
);

drop policy if exists "flashcard_sets_select_course_members_or_admin" on public.flashcard_sets;
create policy "flashcard_sets_select_course_members_or_admin"
on public.flashcard_sets
for select
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = flashcard_sets.lecture_id
      and public.can_view_course(lectures.course_id)
  )
);

drop policy if exists "flashcard_sets_insert_course_managers_or_admin" on public.flashcard_sets;
create policy "flashcard_sets_insert_course_managers_or_admin"
on public.flashcard_sets
for insert
with check (
  (
    generated_by_user_id = auth.uid()
    or generated_by_user_id is null
  )
  and exists (
    select 1
    from public.lectures
    where lectures.id = flashcard_sets.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "flashcard_sets_update_course_managers_or_admin" on public.flashcard_sets;
create policy "flashcard_sets_update_course_managers_or_admin"
on public.flashcard_sets
for update
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = flashcard_sets.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
)
with check (
  exists (
    select 1
    from public.lectures
    where lectures.id = flashcard_sets.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "flashcard_sets_delete_course_managers_or_admin" on public.flashcard_sets;
create policy "flashcard_sets_delete_course_managers_or_admin"
on public.flashcard_sets
for delete
using (
  exists (
    select 1
    from public.lectures
    where lectures.id = flashcard_sets.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "flashcards_select_course_members_or_admin" on public.flashcards;
create policy "flashcards_select_course_members_or_admin"
on public.flashcards
for select
using (
  exists (
    select 1
    from public.flashcard_sets
    join public.lectures on lectures.id = flashcard_sets.lecture_id
    where flashcard_sets.id = flashcards.flashcard_set_id
      and public.can_view_course(lectures.course_id)
  )
);

drop policy if exists "flashcards_insert_course_managers_or_admin" on public.flashcards;
create policy "flashcards_insert_course_managers_or_admin"
on public.flashcards
for insert
with check (
  exists (
    select 1
    from public.flashcard_sets
    join public.lectures on lectures.id = flashcard_sets.lecture_id
    where flashcard_sets.id = flashcards.flashcard_set_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "flashcards_update_course_managers_or_admin" on public.flashcards;
create policy "flashcards_update_course_managers_or_admin"
on public.flashcards
for update
using (
  exists (
    select 1
    from public.flashcard_sets
    join public.lectures on lectures.id = flashcard_sets.lecture_id
    where flashcard_sets.id = flashcards.flashcard_set_id
      and public.can_manage_course(lectures.course_id)
  )
)
with check (
  exists (
    select 1
    from public.flashcard_sets
    join public.lectures on lectures.id = flashcard_sets.lecture_id
    where flashcard_sets.id = flashcards.flashcard_set_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "flashcards_delete_course_managers_or_admin" on public.flashcards;
create policy "flashcards_delete_course_managers_or_admin"
on public.flashcards
for delete
using (
  exists (
    select 1
    from public.flashcard_sets
    join public.lectures on lectures.id = flashcard_sets.lecture_id
    where flashcard_sets.id = flashcards.flashcard_set_id
      and public.can_manage_course(lectures.course_id)
  )
);

drop policy if exists "activity_logs_select_owner_or_course_managers" on public.activity_logs;
create policy "activity_logs_select_owner_or_course_managers"
on public.activity_logs
for select
using (
  user_id = auth.uid()
  or (
    lecture_id is not null
    and exists (
      select 1
      from public.lectures
      where lectures.id = activity_logs.lecture_id
        and public.can_manage_course(lectures.course_id)
    )
  )
  or (
    quiz_id is not null
    and exists (
      select 1
      from public.quizzes
      join public.lectures on lectures.id = quizzes.lecture_id
      where quizzes.id = activity_logs.quiz_id
        and public.can_manage_course(lectures.course_id)
    )
  )
  or (
    chat_session_id is not null
    and exists (
      select 1
      from public.chat_sessions
      where chat_sessions.id = activity_logs.chat_session_id
        and (
          chat_sessions.user_id = auth.uid()
          or (
            chat_sessions.course_id is not null
            and public.can_manage_course(chat_sessions.course_id)
          )
          or (
            chat_sessions.lecture_id is not null
            and exists (
              select 1
              from public.lectures
              where lectures.id = chat_sessions.lecture_id
                and public.can_manage_course(lectures.course_id)
            )
          )
        )
    )
  )
);

drop policy if exists "activity_logs_insert_owner_only" on public.activity_logs;
create policy "activity_logs_insert_owner_only"
on public.activity_logs
for insert
with check (
  user_id = auth.uid()
  and (
    lecture_id is null
    or exists (
      select 1
      from public.lectures
      where lectures.id = activity_logs.lecture_id
        and public.can_view_course(lectures.course_id)
    )
  )
  and (
    quiz_id is null
    or exists (
      select 1
      from public.quizzes
      join public.lectures on lectures.id = quizzes.lecture_id
      where quizzes.id = activity_logs.quiz_id
        and public.can_view_course(lectures.course_id)
    )
  )
  and (
    chat_session_id is null
    or exists (
      select 1
      from public.chat_sessions
      where chat_sessions.id = activity_logs.chat_session_id
        and chat_sessions.user_id = auth.uid()
    )
  )
);

drop policy if exists "activity_logs_update_owner_or_course_managers" on public.activity_logs;
create policy "activity_logs_update_owner_or_course_managers"
on public.activity_logs
for update
using (
  user_id = auth.uid()
  or (
    lecture_id is not null
    and exists (
      select 1
      from public.lectures
      where lectures.id = activity_logs.lecture_id
        and public.can_manage_course(lectures.course_id)
    )
  )
)
with check (
  user_id = auth.uid()
  or (
    lecture_id is not null
    and exists (
      select 1
      from public.lectures
      where lectures.id = activity_logs.lecture_id
        and public.can_manage_course(lectures.course_id)
    )
  )
);

drop policy if exists "activity_logs_delete_owner_or_course_managers" on public.activity_logs;
create policy "activity_logs_delete_owner_or_course_managers"
on public.activity_logs
for delete
using (
  user_id = auth.uid()
  or (
    lecture_id is not null
    and exists (
      select 1
      from public.lectures
      where lectures.id = activity_logs.lecture_id
        and public.can_manage_course(lectures.course_id)
    )
  )
);
