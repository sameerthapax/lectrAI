create or replace function public.compute_daily_quiz_streak(p_user_id uuid)
returns table (
  streak_days integer,
  last_completed_on date
)
language sql
stable
as $$
  with user_clock as (
    select coalesce(nullif(trim(timezone), ''), 'UTC') as timezone_name
    from public.users
    where id = p_user_id
  ),
  completed_days as (
    select distinct q.available_on::date as available_on
    from public.quizzes q
    join public.quiz_attempts qa on qa.quiz_id = q.id
    where q.scope = 'daily_quick'
      and q.generated_by_user_id = p_user_id
      and qa.user_id = p_user_id
      and qa.is_completed = true
      and q.available_on is not null
  ),
  latest_day as (
    select max(available_on) as available_on
    from completed_days
  ),
  streak_candidates as (
    select
      cd.available_on,
      (cd.available_on + (row_number() over (order by cd.available_on desc))::integer)::date as streak_key
    from completed_days cd
  ),
  latest_streak as (
    select count(*)::integer as streak_days
    from streak_candidates
    where streak_key = (
      select streak_key
      from streak_candidates
      where available_on = (select available_on from latest_day)
      limit 1
    )
  )
  select
    case
      when (select available_on from latest_day) is null then 0
      when (select available_on from latest_day) < (timezone((select timezone_name from user_clock), now())::date - 1) then 0
      else coalesce((select streak_days from latest_streak), 0)
    end as streak_days,
    (select available_on from latest_day) as last_completed_on;
$$;
