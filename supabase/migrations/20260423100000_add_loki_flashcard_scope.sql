alter table public.flashcard_sets
  alter column lecture_id drop not null;

alter table public.flashcard_sets
  add column if not exists scope varchar(20) not null default 'lecture',
  add column if not exists description text,
  add column if not exists source_count integer,
  add column if not exists generated_from_chat_message_id uuid references public.chat_messages(id) on delete set null,
  add column if not exists version_no integer not null default 1;

alter table public.flashcards
  add column if not exists lecture_id uuid references public.lectures(id) on delete set null,
  add column if not exists source_type varchar(30),
  add column if not exists source_title varchar(255),
  add column if not exists source_excerpt text,
  add column if not exists explanation text;

alter table public.flashcard_sets
  drop constraint if exists flashcard_sets_scope_check;

alter table public.flashcard_sets
  add constraint flashcard_sets_scope_check
  check (scope in ('lecture', 'loki'));

alter table public.flashcard_sets
  drop constraint if exists flashcard_sets_scope_context_check;

alter table public.flashcard_sets
  add constraint flashcard_sets_scope_context_check
  check (
    (
      scope = 'lecture'
      and lecture_id is not null
    )
    or (
      scope = 'loki'
      and lecture_id is null
      and generated_by_user_id is not null
    )
  );

alter table public.flashcards
  drop constraint if exists flashcards_source_type_check;

alter table public.flashcards
  add constraint flashcards_source_type_check
  check (
    source_type is null
    or source_type in ('lecture', 'course_file', 'course_metadata', 'chat')
  );

create index if not exists idx_flashcard_sets_scope
  on public.flashcard_sets(scope);

create index if not exists idx_flashcard_sets_loki_generated_by_user_id
  on public.flashcard_sets(generated_by_user_id, created_at desc)
  where scope = 'loki';

create index if not exists idx_flashcards_lecture_id
  on public.flashcards(lecture_id);

drop policy if exists "flashcard_sets_select_course_members_or_admin" on public.flashcard_sets;
create policy "flashcard_sets_select_course_members_or_admin"
on public.flashcard_sets
for select
using (
  (
    scope = 'loki'
    and generated_by_user_id = auth.uid()
  )
  or exists (
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
    scope = 'loki'
    and generated_by_user_id = auth.uid()
    and lecture_id is null
  )
  or (
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
  )
);

drop policy if exists "flashcard_sets_update_course_managers_or_admin" on public.flashcard_sets;
create policy "flashcard_sets_update_course_managers_or_admin"
on public.flashcard_sets
for update
using (
  (
    scope = 'loki'
    and generated_by_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.lectures
    where lectures.id = flashcard_sets.lecture_id
      and public.can_manage_course(lectures.course_id)
  )
)
with check (
  (
    scope = 'loki'
    and generated_by_user_id = auth.uid()
    and lecture_id is null
  )
  or exists (
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
  (
    scope = 'loki'
    and generated_by_user_id = auth.uid()
  )
  or exists (
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
    where flashcard_sets.id = flashcards.flashcard_set_id
      and (
        (
          flashcard_sets.scope = 'loki'
          and flashcard_sets.generated_by_user_id = auth.uid()
        )
        or exists (
          select 1
          from public.lectures
          where lectures.id = flashcard_sets.lecture_id
            and public.can_view_course(lectures.course_id)
        )
      )
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
    where flashcard_sets.id = flashcards.flashcard_set_id
      and (
        (
          flashcard_sets.scope = 'loki'
          and flashcard_sets.generated_by_user_id = auth.uid()
        )
        or (
          flashcard_sets.scope = 'lecture'
          and exists (
            select 1
            from public.lectures
            where lectures.id = flashcard_sets.lecture_id
              and public.can_manage_course(lectures.course_id)
          )
        )
      )
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
    where flashcard_sets.id = flashcards.flashcard_set_id
      and (
        (
          flashcard_sets.scope = 'loki'
          and flashcard_sets.generated_by_user_id = auth.uid()
        )
        or (
          flashcard_sets.scope = 'lecture'
          and exists (
            select 1
            from public.lectures
            where lectures.id = flashcard_sets.lecture_id
              and public.can_manage_course(lectures.course_id)
          )
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.flashcard_sets
    where flashcard_sets.id = flashcards.flashcard_set_id
      and (
        (
          flashcard_sets.scope = 'loki'
          and flashcard_sets.generated_by_user_id = auth.uid()
        )
        or (
          flashcard_sets.scope = 'lecture'
          and exists (
            select 1
            from public.lectures
            where lectures.id = flashcard_sets.lecture_id
              and public.can_manage_course(lectures.course_id)
          )
        )
      )
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
    where flashcard_sets.id = flashcards.flashcard_set_id
      and (
        (
          flashcard_sets.scope = 'loki'
          and flashcard_sets.generated_by_user_id = auth.uid()
        )
        or (
          flashcard_sets.scope = 'lecture'
          and exists (
            select 1
            from public.lectures
            where lectures.id = flashcard_sets.lecture_id
              and public.can_manage_course(lectures.course_id)
          )
        )
      )
  )
);
