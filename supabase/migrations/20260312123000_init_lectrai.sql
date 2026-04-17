create extension if not exists pgcrypto;
create extension if not exists vector;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email varchar(320) not null unique,
  password_hash varchar(255),
  auth_provider varchar(50),
  full_name varchar(255),
  role varchar(20) not null default 'student' check (role in ('student', 'instructor', 'admin')),
  university_name varchar(255),
  major varchar(255),
  timezone varchar(100),
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  theme varchar(50),
  language varchar(20),
  notifications_enabled boolean not null default true,
  reminder_enabled boolean not null default false,
  reminder_time time,
  auto_generate_quiz boolean not null default true,
  auto_generate_summary boolean not null default true,
  auto_generate_flashcards boolean not null default true,
  preferred_quiz_question_count integer,
  preferred_quiz_difficulty varchar(20),
  chat_response_max_tokens integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_settings_preferred_quiz_difficulty_check
    check (
      preferred_quiz_difficulty is null
      or preferred_quiz_difficulty in ('easy', 'medium', 'hard', 'mixed')
    )
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete restrict,
  course_code varchar(50),
  course_name varchar(255) not null,
  instructor_name varchar(255),
  semester varchar(100),
  section varchar(50),
  description text,
  color_hex varchar(7),
  is_archived boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint courses_color_hex_check
    check (color_hex is null or color_hex ~ '^#[0-9A-Fa-f]{6}$')
);

create table if not exists public.course_members (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  membership_role varchar(20) not null check (membership_role in ('student', 'instructor', 'ta')),
  is_active boolean not null default true,
  joined_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  unique (course_id, user_id)
);

create table if not exists public.lectures (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  created_by_user_id uuid not null references public.users(id) on delete restrict,
  title varchar(255) not null,
  lecture_number integer,
  lecture_date date,
  source_type varchar(20) not null check (source_type in ('recorded', 'uploaded', 'imported')),
  status varchar(20) not null default 'draft' check (status in ('draft', 'uploading', 'processing', 'ready', 'failed', 'archived')),
  description text,
  topic varchar(255),
  duration_seconds integer,
  language_code varchar(20),
  notes text,
  recorded_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.lecture_tags (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  tag_name varchar(100) not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (lecture_id, tag_name)
);

create table if not exists public.audio_files (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  uploaded_by_user_id uuid not null references public.users(id) on delete restrict,
  storage_provider varchar(20) not null check (storage_provider in ('gcs')),
  bucket_name varchar(255),
  object_path varchar(1024),
  original_filename varchar(255),
  mime_type varchar(100),
  file_size_bytes bigint,
  duration_seconds integer,
  sample_rate_hz integer,
  bitrate_kbps integer,
  checksum_sha256 varchar(64),
  is_primary boolean not null default false,
  upload_status varchar(20) not null default 'pending' check (upload_status in ('pending', 'uploaded', 'failed')),
  uploaded_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  triggered_by_user_id uuid references public.users(id) on delete set null,
  job_type varchar(30) not null check (
    job_type in (
      'upload',
      'transcription',
      'segmentation',
      'summary',
      'concept_extraction',
      'timeline',
      'quiz_generation',
      'embedding',
      'rag_index'
    )
  ),
  provider_name varchar(100),
  model_name varchar(100),
  status varchar(20) not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  priority integer not null default 0,
  retry_count integer not null default 0,
  error_message text,
  input_payload jsonb,
  output_payload jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.transcripts (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null unique references public.lectures(id) on delete cascade,
  source_audio_file_id uuid references public.audio_files(id) on delete set null,
  processing_job_id uuid references public.processing_jobs(id) on delete set null,
  transcription_provider varchar(100),
  model_name varchar(100),
  language_code varchar(20),
  full_text text,
  confidence_avg numeric(5,4),
  total_segments integer,
  total_tokens_estimate integer,
  status varchar(20) not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  generated_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.transcript_segments (
  id uuid primary key default gen_random_uuid(),
  transcript_id uuid not null references public.transcripts(id) on delete cascade,
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  segment_index integer not null,
  start_time_seconds numeric(10,3),
  end_time_seconds numeric(10,3),
  raw_text text,
  cleaned_text text,
  speaker_label varchar(100),
  confidence_score numeric(5,4),
  token_count_estimate integer,
  is_key_moment boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  unique (transcript_id, segment_index)
);

create table if not exists public.lecture_summaries (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  transcript_id uuid references public.transcripts(id) on delete set null,
  processing_job_id uuid references public.processing_jobs(id) on delete set null,
  summary_type varchar(20) not null check (summary_type in ('short', 'medium', 'detailed', 'exam_review')),
  summary_text text not null,
  word_count integer,
  provider_name varchar(100),
  model_name varchar(100),
  version_no integer not null default 1,
  is_current boolean not null default true,
  generated_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.key_concepts (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  transcript_id uuid references public.transcripts(id) on delete set null,
  processing_job_id uuid references public.processing_jobs(id) on delete set null,
  concept_name varchar(255) not null,
  concept_definition text,
  lecture_context text,
  importance_score numeric(8,4),
  first_seen_segment_index integer,
  last_seen_segment_index integer,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  transcript_id uuid references public.transcripts(id) on delete set null,
  processing_job_id uuid references public.processing_jobs(id) on delete set null,
  event_order integer not null,
  event_type varchar(30) not null check (event_type in ('topic_shift', 'definition', 'example', 'announcement', 'important_point')),
  title varchar(255),
  description text,
  start_time_seconds numeric(10,3),
  end_time_seconds numeric(10,3),
  related_segment_index integer,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.study_materials (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  material_type varchar(30) not null check (material_type in ('flashcard_set', 'study_guide', 'cheat_sheet', 'exam_prep')),
  title varchar(255),
  content_markdown text,
  generated_from_summary_id uuid references public.lecture_summaries(id) on delete set null,
  processing_job_id uuid references public.processing_jobs(id) on delete set null,
  version_no integer not null default 1,
  is_current boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.embedding_documents (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  transcript_id uuid references public.transcripts(id) on delete set null,
  source_segment_id uuid references public.transcript_segments(id) on delete set null,
  doc_type varchar(30) not null check (doc_type in ('segment', 'summary', 'concept', 'timeline_event', 'study_material')),
  content_text text not null,
  token_count integer,
  embedding_model varchar(100),
  embedding_dimensions integer not null default 1536,
  embedding vector(1536),
  metadata jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  generated_by_user_id uuid references public.users(id) on delete set null,
  processing_job_id uuid references public.processing_jobs(id) on delete set null,
  title varchar(255),
  quiz_type varchar(20) not null check (quiz_type in ('mcq', 'true_false', 'short_answer', 'mixed')),
  difficulty varchar(20) not null check (difficulty in ('easy', 'medium', 'hard', 'mixed')),
  question_count integer,
  estimated_minutes integer,
  is_ai_generated boolean not null default true,
  is_published boolean not null default false,
  version_no integer not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  question_order integer not null,
  question_type varchar(20) not null check (question_type in ('mcq', 'true_false', 'short_answer')),
  question_text text not null,
  explanation text,
  source_excerpt text,
  source_segment_index integer,
  difficulty varchar(20),
  points numeric(8,2),
  created_at timestamptz not null default timezone('utc', now()),
  unique (quiz_id, question_order)
);

create table if not exists public.quiz_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  option_label varchar(20),
  option_text text not null,
  is_correct boolean not null default false,
  option_order integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (question_id, option_order)
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  score integer,
  max_score integer,
  percentage_score numeric(6,2),
  time_spent_seconds integer,
  is_completed boolean not null default false,
  started_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.quiz_attempt_answers (
  id uuid primary key default gen_random_uuid(),
  quiz_attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  selected_option_id uuid references public.quiz_options(id) on delete set null,
  short_answer_text text,
  is_correct boolean,
  awarded_points numeric(8,2),
  answered_at timestamptz,
  unique (quiz_attempt_id, question_id)
);

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  lecture_id uuid references public.lectures(id) on delete set null,
  title varchar(255),
  session_type varchar(20) not null check (session_type in ('lecture_chat', 'course_chat', 'exam_review')),
  is_pinned boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_session_id uuid not null references public.chat_sessions(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  role varchar(20) not null check (role in ('user', 'assistant', 'system')),
  message_text text not null,
  model_name varchar(100),
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  retrieval_metadata jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.chat_citations (
  id uuid primary key default gen_random_uuid(),
  chat_message_id uuid not null references public.chat_messages(id) on delete cascade,
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  transcript_segment_id uuid references public.transcript_segments(id) on delete set null,
  embedding_document_id uuid references public.embedding_documents(id) on delete set null,
  citation_order integer not null,
  relevance_score numeric(8,4),
  cited_text text,
  start_time_seconds numeric(10,3),
  end_time_seconds numeric(10,3),
  created_at timestamptz not null default timezone('utc', now()),
  unique (chat_message_id, citation_order)
);

create table if not exists public.flashcard_sets (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  generated_by_user_id uuid references public.users(id) on delete set null,
  processing_job_id uuid references public.processing_jobs(id) on delete set null,
  title varchar(255),
  is_ai_generated boolean not null default true,
  card_count integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  flashcard_set_id uuid not null references public.flashcard_sets(id) on delete cascade,
  front_text text not null,
  back_text text not null,
  hint_text text,
  card_order integer not null,
  source_segment_index integer,
  created_at timestamptz not null default timezone('utc', now()),
  unique (flashcard_set_id, card_order)
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  lecture_id uuid references public.lectures(id) on delete set null,
  quiz_id uuid references public.quizzes(id) on delete set null,
  chat_session_id uuid references public.chat_sessions(id) on delete set null,
  activity_type varchar(30) not null check (activity_type in ('login', 'upload_audio', 'view_summary', 'start_quiz', 'submit_quiz', 'chat_message', 'review_lecture')),
  metadata jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_user_settings_user_id on public.user_settings(user_id);
create index if not exists idx_courses_owner_user_id on public.courses(owner_user_id);
create index if not exists idx_course_members_course_id on public.course_members(course_id);
create index if not exists idx_course_members_user_id on public.course_members(user_id);
create index if not exists idx_lectures_course_id on public.lectures(course_id);
create index if not exists idx_lectures_created_by_user_id on public.lectures(created_by_user_id);
create index if not exists idx_lectures_status on public.lectures(status);
create index if not exists idx_lecture_tags_lecture_id on public.lecture_tags(lecture_id);
create index if not exists idx_audio_files_lecture_id on public.audio_files(lecture_id);
create index if not exists idx_audio_files_uploaded_by_user_id on public.audio_files(uploaded_by_user_id);
create index if not exists idx_processing_jobs_lecture_id on public.processing_jobs(lecture_id);
create index if not exists idx_processing_jobs_status on public.processing_jobs(status);
create index if not exists idx_processing_jobs_job_type on public.processing_jobs(job_type);
create index if not exists idx_transcripts_source_audio_file_id on public.transcripts(source_audio_file_id);
create index if not exists idx_transcripts_processing_job_id on public.transcripts(processing_job_id);
create index if not exists idx_transcript_segments_transcript_id on public.transcript_segments(transcript_id);
create index if not exists idx_transcript_segments_lecture_id on public.transcript_segments(lecture_id);
create index if not exists idx_lecture_summaries_lecture_id on public.lecture_summaries(lecture_id);
create index if not exists idx_lecture_summaries_transcript_id on public.lecture_summaries(transcript_id);
create index if not exists idx_key_concepts_lecture_id on public.key_concepts(lecture_id);
create index if not exists idx_timeline_events_lecture_id on public.timeline_events(lecture_id);
create index if not exists idx_study_materials_lecture_id on public.study_materials(lecture_id);
create index if not exists idx_embedding_documents_lecture_id on public.embedding_documents(lecture_id);
create index if not exists idx_embedding_documents_transcript_id on public.embedding_documents(transcript_id);
create index if not exists idx_embedding_documents_source_segment_id on public.embedding_documents(source_segment_id);
create index if not exists idx_quizzes_lecture_id on public.quizzes(lecture_id);
create index if not exists idx_quiz_questions_quiz_id on public.quiz_questions(quiz_id);
create index if not exists idx_quiz_questions_lecture_id on public.quiz_questions(lecture_id);
create index if not exists idx_quiz_options_question_id on public.quiz_options(question_id);
create index if not exists idx_quiz_attempts_quiz_id on public.quiz_attempts(quiz_id);
create index if not exists idx_quiz_attempts_user_id on public.quiz_attempts(user_id);
create index if not exists idx_quiz_attempt_answers_quiz_attempt_id on public.quiz_attempt_answers(quiz_attempt_id);
create index if not exists idx_quiz_attempt_answers_question_id on public.quiz_attempt_answers(question_id);
create index if not exists idx_chat_sessions_user_id on public.chat_sessions(user_id);
create index if not exists idx_chat_sessions_course_id on public.chat_sessions(course_id);
create index if not exists idx_chat_sessions_lecture_id on public.chat_sessions(lecture_id);
create index if not exists idx_chat_messages_chat_session_id on public.chat_messages(chat_session_id);
create index if not exists idx_chat_messages_user_id on public.chat_messages(user_id);
create index if not exists idx_chat_citations_chat_message_id on public.chat_citations(chat_message_id);
create index if not exists idx_chat_citations_lecture_id on public.chat_citations(lecture_id);
create index if not exists idx_chat_citations_segment_id on public.chat_citations(transcript_segment_id);
create index if not exists idx_chat_citations_embedding_document_id on public.chat_citations(embedding_document_id);
create index if not exists idx_flashcard_sets_lecture_id on public.flashcard_sets(lecture_id);
create index if not exists idx_flashcards_flashcard_set_id on public.flashcards(flashcard_set_id);
create index if not exists idx_activity_logs_user_id on public.activity_logs(user_id);
create index if not exists idx_activity_logs_lecture_id on public.activity_logs(lecture_id);
create index if not exists idx_activity_logs_quiz_id on public.activity_logs(quiz_id);
create index if not exists idx_activity_logs_chat_session_id on public.activity_logs(chat_session_id);
create index if not exists idx_activity_logs_activity_type on public.activity_logs(activity_type);

create index if not exists idx_embedding_documents_embedding_hnsw
  on public.embedding_documents
  using hnsw (embedding vector_cosine_ops);

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
before update on public.users
for each row
execute function public.set_updated_at();

drop trigger if exists set_user_settings_updated_at on public.user_settings;
create trigger set_user_settings_updated_at
before update on public.user_settings
for each row
execute function public.set_updated_at();

drop trigger if exists set_courses_updated_at on public.courses;
create trigger set_courses_updated_at
before update on public.courses
for each row
execute function public.set_updated_at();

drop trigger if exists set_lectures_updated_at on public.lectures;
create trigger set_lectures_updated_at
before update on public.lectures
for each row
execute function public.set_updated_at();

drop trigger if exists set_processing_jobs_updated_at on public.processing_jobs;
create trigger set_processing_jobs_updated_at
before update on public.processing_jobs
for each row
execute function public.set_updated_at();

drop trigger if exists set_transcripts_updated_at on public.transcripts;
create trigger set_transcripts_updated_at
before update on public.transcripts
for each row
execute function public.set_updated_at();

drop trigger if exists set_study_materials_updated_at on public.study_materials;
create trigger set_study_materials_updated_at
before update on public.study_materials
for each row
execute function public.set_updated_at();

drop trigger if exists set_quizzes_updated_at on public.quizzes;
create trigger set_quizzes_updated_at
before update on public.quizzes
for each row
execute function public.set_updated_at();

drop trigger if exists set_chat_sessions_updated_at on public.chat_sessions;
create trigger set_chat_sessions_updated_at
before update on public.chat_sessions
for each row
execute function public.set_updated_at();

drop trigger if exists set_flashcard_sets_updated_at on public.flashcard_sets;
create trigger set_flashcard_sets_updated_at
before update on public.flashcard_sets
for each row
execute function public.set_updated_at();
