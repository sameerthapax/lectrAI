import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'lectrai-cache.db';

export const LOCAL_CACHE_SCHEMA_VERSION = 2;

const SYNC_STATUS_CHECK = `
CHECK (sync_status IN ('synced', 'pending_pull', 'pending_push', 'conflict'))
`;

const OUTBOX_STATUS_CHECK = `
CHECK (status IN ('queued', 'processing', 'failed', 'completed'))
`;

const OUTBOX_OPERATION_CHECK = `
CHECK (operation IN ('create', 'update', 'delete', 'upsert'))
`;

const CACHE_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA temp_store = MEMORY;

CREATE TABLE IF NOT EXISTS cache_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sync_state (
  scope_key TEXT PRIMARY KEY NOT NULL,
  entity_name TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id TEXT,
  sync_mode TEXT NOT NULL DEFAULT 'delta' CHECK (sync_mode IN ('full', 'delta')),
  last_server_cursor TEXT,
  last_started_at TEXT,
  last_completed_at TEXT,
  last_success_at TEXT,
  last_error_at TEXT,
  last_error_message TEXT,
  records_seen INTEGER NOT NULL DEFAULT 0,
  records_applied INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sync_outbox (
  id TEXT PRIMARY KEY NOT NULL,
  entity_name TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL ${OUTBOX_OPERATION_CHECK},
  payload_json TEXT NOT NULL,
  dependencies_json TEXT,
  status TEXT NOT NULL DEFAULT 'queued' ${OUTBOX_STATUS_CHECK},
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS downloaded_assets (
  id TEXT PRIMARY KEY NOT NULL,
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  remote_uri TEXT,
  local_uri TEXT NOT NULL,
  mime_type TEXT,
  etag TEXT,
  byte_size INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cached_users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT,
  auth_provider TEXT,
  full_name TEXT,
  role TEXT NOT NULL,
  university_name TEXT,
  major TEXT,
  timezone TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  last_login_at TEXT,
  created_at TEXT,
  updated_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced' ${SYNC_STATUS_CHECK},
  dirty_fields_json TEXT,
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cached_user_settings (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL UNIQUE REFERENCES cached_users(id) ON DELETE CASCADE,
  theme TEXT,
  language TEXT,
  notifications_enabled INTEGER NOT NULL DEFAULT 1 CHECK (notifications_enabled IN (0, 1)),
  reminder_enabled INTEGER NOT NULL DEFAULT 0 CHECK (reminder_enabled IN (0, 1)),
  reminder_time TEXT,
  auto_generate_quiz INTEGER NOT NULL DEFAULT 1 CHECK (auto_generate_quiz IN (0, 1)),
  auto_generate_summary INTEGER NOT NULL DEFAULT 1 CHECK (auto_generate_summary IN (0, 1)),
  auto_generate_flashcards INTEGER NOT NULL DEFAULT 1 CHECK (auto_generate_flashcards IN (0, 1)),
  preferred_quiz_question_count INTEGER,
  preferred_quiz_difficulty TEXT,
  chat_response_max_tokens INTEGER,
  created_at TEXT,
  updated_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced' ${SYNC_STATUS_CHECK},
  dirty_fields_json TEXT,
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cached_courses (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT REFERENCES cached_users(id) ON DELETE SET NULL,
  course_code TEXT,
  course_name TEXT NOT NULL,
  instructor_name TEXT,
  semester TEXT,
  section TEXT,
  description TEXT,
  color_hex TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  created_at TEXT,
  updated_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced' ${SYNC_STATUS_CHECK},
  dirty_fields_json TEXT,
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cached_course_members (
  id TEXT PRIMARY KEY NOT NULL,
  course_id TEXT NOT NULL REFERENCES cached_courses(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES cached_users(id) ON DELETE CASCADE,
  membership_role TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  joined_at TEXT,
  created_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced' ${SYNC_STATUS_CHECK},
  dirty_fields_json TEXT,
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (course_id, user_id)
);

CREATE TABLE IF NOT EXISTS cached_lectures (
  id TEXT PRIMARY KEY NOT NULL,
  course_id TEXT NOT NULL REFERENCES cached_courses(id) ON DELETE CASCADE,
  created_by_user_id TEXT REFERENCES cached_users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  lecture_number INTEGER,
  lecture_date TEXT,
  source_type TEXT,
  status TEXT NOT NULL,
  description TEXT,
  topic TEXT,
  duration_seconds INTEGER,
  language_code TEXT,
  notes TEXT,
  recorded_at TEXT,
  created_at TEXT,
  updated_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced' ${SYNC_STATUS_CHECK},
  dirty_fields_json TEXT,
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cached_lecture_tags (
  id TEXT PRIMARY KEY NOT NULL,
  lecture_id TEXT NOT NULL REFERENCES cached_lectures(id) ON DELETE CASCADE,
  tag_name TEXT NOT NULL,
  created_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced' ${SYNC_STATUS_CHECK},
  dirty_fields_json TEXT,
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (lecture_id, tag_name)
);

CREATE TABLE IF NOT EXISTS cached_audio_files (
  id TEXT PRIMARY KEY NOT NULL,
  lecture_id TEXT NOT NULL REFERENCES cached_lectures(id) ON DELETE CASCADE,
  uploaded_by_user_id TEXT REFERENCES cached_users(id) ON DELETE SET NULL,
  storage_provider TEXT,
  bucket_name TEXT,
  object_path TEXT,
  original_filename TEXT,
  mime_type TEXT,
  file_size_bytes INTEGER,
  duration_seconds INTEGER,
  sample_rate_hz INTEGER,
  bitrate_kbps INTEGER,
  checksum_sha256 TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  upload_status TEXT NOT NULL DEFAULT 'pending',
  uploaded_at TEXT,
  created_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced' ${SYNC_STATUS_CHECK},
  dirty_fields_json TEXT,
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cached_processing_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  lecture_id TEXT NOT NULL REFERENCES cached_lectures(id) ON DELETE CASCADE,
  triggered_by_user_id TEXT REFERENCES cached_users(id) ON DELETE SET NULL,
  job_type TEXT NOT NULL,
  provider_name TEXT,
  model_name TEXT,
  status TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  input_payload_json TEXT,
  output_payload_json TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT,
  updated_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced' ${SYNC_STATUS_CHECK},
  dirty_fields_json TEXT,
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cached_transcripts (
  id TEXT PRIMARY KEY NOT NULL,
  lecture_id TEXT NOT NULL UNIQUE REFERENCES cached_lectures(id) ON DELETE CASCADE,
  source_audio_file_id TEXT REFERENCES cached_audio_files(id) ON DELETE SET NULL,
  processing_job_id TEXT REFERENCES cached_processing_jobs(id) ON DELETE SET NULL,
  transcription_provider TEXT,
  model_name TEXT,
  language_code TEXT,
  full_text TEXT,
  confidence_avg REAL,
  total_segments INTEGER,
  total_tokens_estimate INTEGER,
  status TEXT NOT NULL,
  generated_at TEXT,
  created_at TEXT,
  updated_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced' ${SYNC_STATUS_CHECK},
  dirty_fields_json TEXT,
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cached_transcript_segments (
  id TEXT PRIMARY KEY NOT NULL,
  transcript_id TEXT NOT NULL REFERENCES cached_transcripts(id) ON DELETE CASCADE,
  lecture_id TEXT NOT NULL REFERENCES cached_lectures(id) ON DELETE CASCADE,
  segment_index INTEGER NOT NULL,
  start_time_seconds REAL,
  end_time_seconds REAL,
  raw_text TEXT,
  cleaned_text TEXT,
  speaker_label TEXT,
  confidence_score REAL,
  token_count_estimate INTEGER,
  is_key_moment INTEGER NOT NULL DEFAULT 0 CHECK (is_key_moment IN (0, 1)),
  created_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced' ${SYNC_STATUS_CHECK},
  dirty_fields_json TEXT,
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (transcript_id, segment_index)
);

CREATE TABLE IF NOT EXISTS cached_lecture_summaries (
  id TEXT PRIMARY KEY NOT NULL,
  lecture_id TEXT NOT NULL REFERENCES cached_lectures(id) ON DELETE CASCADE,
  transcript_id TEXT REFERENCES cached_transcripts(id) ON DELETE SET NULL,
  processing_job_id TEXT REFERENCES cached_processing_jobs(id) ON DELETE SET NULL,
  summary_type TEXT NOT NULL,
  summary_text TEXT NOT NULL,
  word_count INTEGER,
  provider_name TEXT,
  model_name TEXT,
  version_no INTEGER NOT NULL DEFAULT 1,
  is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
  generated_at TEXT,
  created_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced' ${SYNC_STATUS_CHECK},
  dirty_fields_json TEXT,
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cached_key_concepts (
  id TEXT PRIMARY KEY NOT NULL,
  lecture_id TEXT NOT NULL REFERENCES cached_lectures(id) ON DELETE CASCADE,
  transcript_id TEXT REFERENCES cached_transcripts(id) ON DELETE SET NULL,
  processing_job_id TEXT REFERENCES cached_processing_jobs(id) ON DELETE SET NULL,
  concept_name TEXT NOT NULL,
  concept_definition TEXT,
  lecture_context TEXT,
  importance_score REAL,
  first_seen_segment_index INTEGER,
  last_seen_segment_index INTEGER,
  created_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced' ${SYNC_STATUS_CHECK},
  dirty_fields_json TEXT,
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cached_timeline_events (
  id TEXT PRIMARY KEY NOT NULL,
  lecture_id TEXT NOT NULL REFERENCES cached_lectures(id) ON DELETE CASCADE,
  transcript_id TEXT REFERENCES cached_transcripts(id) ON DELETE SET NULL,
  processing_job_id TEXT REFERENCES cached_processing_jobs(id) ON DELETE SET NULL,
  event_order INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT,
  description TEXT,
  start_time_seconds REAL,
  end_time_seconds REAL,
  related_segment_index INTEGER,
  created_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced' ${SYNC_STATUS_CHECK},
  dirty_fields_json TEXT,
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cached_study_materials (
  id TEXT PRIMARY KEY NOT NULL,
  lecture_id TEXT NOT NULL REFERENCES cached_lectures(id) ON DELETE CASCADE,
  material_type TEXT NOT NULL,
  title TEXT,
  content_markdown TEXT,
  generated_from_summary_id TEXT REFERENCES cached_lecture_summaries(id) ON DELETE SET NULL,
  processing_job_id TEXT REFERENCES cached_processing_jobs(id) ON DELETE SET NULL,
  version_no INTEGER NOT NULL DEFAULT 1,
  is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
  created_at TEXT,
  updated_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced' ${SYNC_STATUS_CHECK},
  dirty_fields_json TEXT,
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cached_quizzes (
  id TEXT PRIMARY KEY NOT NULL,
  lecture_id TEXT NOT NULL REFERENCES cached_lectures(id) ON DELETE CASCADE,
  generated_by_user_id TEXT REFERENCES cached_users(id) ON DELETE SET NULL,
  processing_job_id TEXT REFERENCES cached_processing_jobs(id) ON DELETE SET NULL,
  title TEXT,
  quiz_type TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  question_count INTEGER,
  estimated_minutes INTEGER,
  is_ai_generated INTEGER NOT NULL DEFAULT 1 CHECK (is_ai_generated IN (0, 1)),
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
  version_no INTEGER NOT NULL DEFAULT 1,
  created_at TEXT,
  updated_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced' ${SYNC_STATUS_CHECK},
  dirty_fields_json TEXT,
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cached_quiz_questions (
  id TEXT PRIMARY KEY NOT NULL,
  quiz_id TEXT NOT NULL REFERENCES cached_quizzes(id) ON DELETE CASCADE,
  lecture_id TEXT NOT NULL REFERENCES cached_lectures(id) ON DELETE CASCADE,
  question_order INTEGER NOT NULL,
  question_type TEXT NOT NULL,
  question_text TEXT NOT NULL,
  explanation TEXT,
  source_excerpt TEXT,
  source_segment_index INTEGER,
  difficulty TEXT,
  points REAL,
  created_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced' ${SYNC_STATUS_CHECK},
  dirty_fields_json TEXT,
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (quiz_id, question_order)
);

CREATE TABLE IF NOT EXISTS cached_quiz_options (
  id TEXT PRIMARY KEY NOT NULL,
  question_id TEXT NOT NULL REFERENCES cached_quiz_questions(id) ON DELETE CASCADE,
  option_label TEXT,
  option_text TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0, 1)),
  option_order INTEGER NOT NULL,
  created_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced' ${SYNC_STATUS_CHECK},
  dirty_fields_json TEXT,
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (question_id, option_order)
);

CREATE TABLE IF NOT EXISTS local_quiz_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  server_id TEXT,
  quiz_id TEXT NOT NULL REFERENCES cached_quizzes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES cached_users(id) ON DELETE CASCADE,
  score INTEGER,
  max_score INTEGER,
  percentage_score REAL,
  time_spent_seconds INTEGER,
  is_completed INTEGER NOT NULL DEFAULT 0 CHECK (is_completed IN (0, 1)),
  started_at TEXT,
  submitted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending_push' ${SYNC_STATUS_CHECK},
  dirty_fields_json TEXT,
  last_synced_at TEXT
);

CREATE TABLE IF NOT EXISTS local_quiz_attempt_answers (
  id TEXT PRIMARY KEY NOT NULL,
  server_id TEXT,
  quiz_attempt_id TEXT NOT NULL REFERENCES local_quiz_attempts(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES cached_quiz_questions(id) ON DELETE CASCADE,
  selected_option_id TEXT REFERENCES cached_quiz_options(id) ON DELETE SET NULL,
  short_answer_text TEXT,
  is_correct INTEGER CHECK (is_correct IN (0, 1)),
  awarded_points REAL,
  answered_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sync_status TEXT NOT NULL DEFAULT 'pending_push' ${SYNC_STATUS_CHECK},
  dirty_fields_json TEXT,
  last_synced_at TEXT,
  UNIQUE (quiz_attempt_id, question_id)
);

CREATE TABLE IF NOT EXISTS cached_flashcard_sets (
  id TEXT PRIMARY KEY NOT NULL,
  lecture_id TEXT NOT NULL REFERENCES cached_lectures(id) ON DELETE CASCADE,
  generated_by_user_id TEXT REFERENCES cached_users(id) ON DELETE SET NULL,
  processing_job_id TEXT REFERENCES cached_processing_jobs(id) ON DELETE SET NULL,
  title TEXT,
  is_ai_generated INTEGER NOT NULL DEFAULT 1 CHECK (is_ai_generated IN (0, 1)),
  card_count INTEGER,
  created_at TEXT,
  updated_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced' ${SYNC_STATUS_CHECK},
  dirty_fields_json TEXT,
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cached_flashcards (
  id TEXT PRIMARY KEY NOT NULL,
  flashcard_set_id TEXT NOT NULL REFERENCES cached_flashcard_sets(id) ON DELETE CASCADE,
  front_text TEXT NOT NULL,
  back_text TEXT NOT NULL,
  hint_text TEXT,
  card_order INTEGER NOT NULL,
  source_segment_index INTEGER,
  created_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced' ${SYNC_STATUS_CHECK},
  dirty_fields_json TEXT,
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (flashcard_set_id, card_order)
);

CREATE TABLE IF NOT EXISTS cached_chat_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  server_id TEXT,
  user_id TEXT NOT NULL REFERENCES cached_users(id) ON DELETE CASCADE,
  course_id TEXT REFERENCES cached_courses(id) ON DELETE SET NULL,
  lecture_id TEXT REFERENCES cached_lectures(id) ON DELETE SET NULL,
  title TEXT,
  session_type TEXT NOT NULL,
  is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'synced' ${SYNC_STATUS_CHECK},
  dirty_fields_json TEXT,
  last_synced_at TEXT
);

CREATE TABLE IF NOT EXISTS cached_chat_messages (
  id TEXT PRIMARY KEY NOT NULL,
  server_id TEXT,
  chat_session_id TEXT NOT NULL REFERENCES cached_chat_sessions(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES cached_users(id) ON DELETE SET NULL,
  role TEXT NOT NULL,
  message_text TEXT NOT NULL,
  model_name TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  retrieval_metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sync_status TEXT NOT NULL DEFAULT 'synced' ${SYNC_STATUS_CHECK},
  dirty_fields_json TEXT,
  last_synced_at TEXT
);

CREATE TABLE IF NOT EXISTS cached_chat_citations (
  id TEXT PRIMARY KEY NOT NULL,
  chat_message_id TEXT NOT NULL REFERENCES cached_chat_messages(id) ON DELETE CASCADE,
  lecture_id TEXT NOT NULL REFERENCES cached_lectures(id) ON DELETE CASCADE,
  transcript_segment_id TEXT REFERENCES cached_transcript_segments(id) ON DELETE SET NULL,
  citation_order INTEGER NOT NULL,
  relevance_score REAL,
  cited_text TEXT,
  start_time_seconds REAL,
  end_time_seconds REAL,
  created_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced' ${SYNC_STATUS_CHECK},
  dirty_fields_json TEXT,
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (chat_message_id, citation_order)
);

CREATE TABLE IF NOT EXISTS local_upload_queue (
  id TEXT PRIMARY KEY NOT NULL,
  lecture_id TEXT REFERENCES cached_lectures(id) ON DELETE SET NULL,
  local_uri TEXT NOT NULL,
  original_filename TEXT,
  mime_type TEXT,
  file_size_bytes INTEGER,
  checksum_sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'uploading', 'uploaded', 'failed')),
  remote_audio_file_id TEXT REFERENCES cached_audio_files(id) ON DELETE SET NULL,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sync_state_entity_name ON sync_state(entity_name);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_status_created_at ON sync_outbox(status, created_at);
CREATE INDEX IF NOT EXISTS idx_downloaded_assets_owner ON downloaded_assets(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_cached_course_members_course_id ON cached_course_members(course_id);
CREATE INDEX IF NOT EXISTS idx_cached_course_members_user_id ON cached_course_members(user_id);
CREATE INDEX IF NOT EXISTS idx_cached_lectures_course_id ON cached_lectures(course_id);
CREATE INDEX IF NOT EXISTS idx_cached_lectures_updated_at ON cached_lectures(updated_at);
CREATE INDEX IF NOT EXISTS idx_cached_lecture_tags_lecture_id ON cached_lecture_tags(lecture_id);
CREATE INDEX IF NOT EXISTS idx_cached_audio_files_lecture_id ON cached_audio_files(lecture_id);
CREATE INDEX IF NOT EXISTS idx_cached_processing_jobs_lecture_id ON cached_processing_jobs(lecture_id);
CREATE INDEX IF NOT EXISTS idx_cached_processing_jobs_status ON cached_processing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_cached_transcript_segments_transcript_id ON cached_transcript_segments(transcript_id);
CREATE INDEX IF NOT EXISTS idx_cached_transcript_segments_lecture_id ON cached_transcript_segments(lecture_id);
CREATE INDEX IF NOT EXISTS idx_cached_lecture_summaries_lecture_id ON cached_lecture_summaries(lecture_id);
CREATE INDEX IF NOT EXISTS idx_cached_key_concepts_lecture_id ON cached_key_concepts(lecture_id);
CREATE INDEX IF NOT EXISTS idx_cached_timeline_events_lecture_id ON cached_timeline_events(lecture_id);
CREATE INDEX IF NOT EXISTS idx_cached_study_materials_lecture_id ON cached_study_materials(lecture_id);
CREATE INDEX IF NOT EXISTS idx_cached_quizzes_lecture_id ON cached_quizzes(lecture_id);
CREATE INDEX IF NOT EXISTS idx_cached_quiz_questions_quiz_id ON cached_quiz_questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_cached_quiz_options_question_id ON cached_quiz_options(question_id);
CREATE INDEX IF NOT EXISTS idx_local_quiz_attempts_quiz_id ON local_quiz_attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_local_quiz_attempts_sync_status ON local_quiz_attempts(sync_status);
CREATE INDEX IF NOT EXISTS idx_local_quiz_attempt_answers_attempt_id ON local_quiz_attempt_answers(quiz_attempt_id);
CREATE INDEX IF NOT EXISTS idx_cached_flashcard_sets_lecture_id ON cached_flashcard_sets(lecture_id);
CREATE INDEX IF NOT EXISTS idx_cached_flashcards_set_id ON cached_flashcards(flashcard_set_id);
CREATE INDEX IF NOT EXISTS idx_cached_chat_sessions_user_id ON cached_chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_cached_chat_sessions_course_id ON cached_chat_sessions(course_id);
CREATE INDEX IF NOT EXISTS idx_cached_chat_sessions_lecture_id ON cached_chat_sessions(lecture_id);
CREATE INDEX IF NOT EXISTS idx_cached_chat_messages_session_id ON cached_chat_messages(chat_session_id);
CREATE INDEX IF NOT EXISTS idx_cached_chat_citations_message_id ON cached_chat_citations(chat_message_id);
CREATE INDEX IF NOT EXISTS idx_local_upload_queue_status ON local_upload_queue(status);
`;

const CLEAR_TABLES = [
  'local_upload_queue',
  'cached_chat_citations',
  'cached_chat_messages',
  'cached_chat_sessions',
  'cached_flashcards',
  'cached_flashcard_sets',
  'local_quiz_attempt_answers',
  'local_quiz_attempts',
  'cached_quiz_options',
  'cached_quiz_questions',
  'cached_quizzes',
  'cached_study_materials',
  'cached_timeline_events',
  'cached_key_concepts',
  'cached_lecture_summaries',
  'cached_transcript_segments',
  'cached_transcripts',
  'cached_processing_jobs',
  'cached_audio_files',
  'cached_lecture_tags',
  'cached_lectures',
  'cached_course_members',
  'cached_courses',
  'cached_user_settings',
  'cached_users',
  'downloaded_assets',
  'sync_outbox',
  'sync_state',
  'cache_meta',
] as const;

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

export type SyncStatus = 'synced' | 'pending_pull' | 'pending_push' | 'conflict';
export type OutboxStatus = 'queued' | 'processing' | 'failed' | 'completed';
export type OutboxOperation = 'create' | 'update' | 'delete' | 'upsert';

export type SyncStateRecord = {
  scopeKey: string;
  entityName: string;
  scopeType: string;
  scopeId: string | null;
  syncMode: 'full' | 'delta';
  lastServerCursor: string | null;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  recordsSeen: number;
  recordsApplied: number;
  updatedAt: string;
};

export type SyncOutboxRecord = {
  id: string;
  entityName: string;
  entityId: string;
  operation: OutboxOperation;
  payloadJson: string;
  dependenciesJson: string | null;
  status: OutboxStatus;
  retryCount: number;
  nextRetryAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function initializeLocalDatabase() {
  const db = await getLocalDatabase();
  await db.execAsync(CACHE_SCHEMA_SQL);
  await setMetaValue(db, 'local_cache_schema_version', String(LOCAL_CACHE_SCHEMA_VERSION));
  return db;
}

export async function clearLocalCache() {
  const db = await initializeLocalDatabase();

  await db.withTransactionAsync(async () => {
    for (const table of CLEAR_TABLES) {
      await db.execAsync(`DELETE FROM ${table};`);
    }

    await setMetaValue(db, 'local_cache_schema_version', String(LOCAL_CACHE_SCHEMA_VERSION));
  });
}

export async function getMetaValue(key: string) {
  const db = await initializeLocalDatabase();
  const row = await db.getFirstAsync<{ value: string | null }>(
    'SELECT value FROM cache_meta WHERE key = ?',
    [key]
  );

  return row?.value ?? null;
}

export async function setMetaValue(db: SQLite.SQLiteDatabase, key: string, value: string) {
  await db.runAsync(
    `INSERT INTO cache_meta (key, value, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
    [key, value]
  );
}

async function getLocalDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME);
  }

  return databasePromise;
}
