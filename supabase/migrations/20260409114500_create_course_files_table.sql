create table if not exists public.course_files (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  uploaded_by_user_id uuid not null references public.users(id) on delete restrict,
  title varchar(255) not null,
  description text,
  relation_type varchar(30) not null check (
    relation_type in ('lecture_file', 'module_file', 'chapter_file', 'notes', 'other')
  ),
  source_type varchar(10) not null check (source_type in ('file', 'link')),
  storage_provider varchar(20) check (storage_provider in ('gcs')),
  bucket_name varchar(255),
  object_path varchar(1024),
  external_url text,
  original_filename varchar(255),
  mime_type varchar(100),
  file_size_bytes bigint,
  file_extension varchar(32),
  upload_status varchar(20) not null default 'pending' check (
    upload_status in ('pending', 'uploaded', 'failed')
  ),
  uploaded_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_course_files_course_id
  on public.course_files(course_id);

create index if not exists idx_course_files_uploaded_by_user_id
  on public.course_files(uploaded_by_user_id);

drop trigger if exists set_course_files_updated_at on public.course_files;
create trigger set_course_files_updated_at
before update on public.course_files
for each row
execute function public.set_updated_at();
