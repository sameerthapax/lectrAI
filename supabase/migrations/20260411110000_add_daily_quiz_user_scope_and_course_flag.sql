drop index if exists idx_quizzes_daily_quick_available_on;

create unique index if not exists idx_quizzes_daily_quick_user_available_on
  on public.quizzes(generated_by_user_id, available_on)
  where scope = 'daily_quick' and generated_by_user_id is not null;

alter table public.quiz_questions
  add column if not exists is_related_to_any_course boolean not null default true;
