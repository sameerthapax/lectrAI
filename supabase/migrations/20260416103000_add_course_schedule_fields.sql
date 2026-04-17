alter table public.courses
  add column if not exists course_type varchar(20) not null default 'in_person',
  add column if not exists meeting_schedule_json jsonb not null default '[]'::jsonb;

alter table public.courses
  drop constraint if exists courses_course_type_check;

alter table public.courses
  add constraint courses_course_type_check
    check (course_type in ('in_person', 'online', 'zoom'));

alter table public.courses
  drop constraint if exists courses_meeting_schedule_json_type_check;

alter table public.courses
  add constraint courses_meeting_schedule_json_type_check
    check (jsonb_typeof(meeting_schedule_json) = 'array');
