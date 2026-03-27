import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'lectrai-cache.db';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

const CACHE_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS cache_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cached_courses (
  id TEXT PRIMARY KEY NOT NULL,
  course_code TEXT,
  course_name TEXT NOT NULL,
  instructor_name TEXT,
  semester TEXT,
  section TEXT,
  description TEXT,
  color_hex TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  membership_role TEXT,
  created_at TEXT,
  updated_at TEXT,
  cached_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cached_lectures (
  id TEXT PRIMARY KEY NOT NULL,
  course_id TEXT NOT NULL REFERENCES cached_courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  lecture_number INTEGER,
  lecture_date TEXT,
  source_type TEXT,
  status TEXT,
  description TEXT,
  topic TEXT,
  duration_seconds INTEGER,
  language_code TEXT,
  notes TEXT,
  recorded_at TEXT,
  created_at TEXT,
  updated_at TEXT,
  cached_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cached_lecture_summaries (
  id TEXT PRIMARY KEY NOT NULL,
  lecture_id TEXT NOT NULL REFERENCES cached_lectures(id) ON DELETE CASCADE,
  summary_type TEXT NOT NULL,
  summary_text TEXT NOT NULL,
  word_count INTEGER,
  version_no INTEGER,
  is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
  generated_at TEXT,
  created_at TEXT,
  cached_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cached_quizzes (
  id TEXT PRIMARY KEY NOT NULL,
  lecture_id TEXT NOT NULL REFERENCES cached_lectures(id) ON DELETE CASCADE,
  title TEXT,
  quiz_type TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  question_count INTEGER,
  estimated_minutes INTEGER,
  is_ai_generated INTEGER NOT NULL DEFAULT 1 CHECK (is_ai_generated IN (0, 1)),
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
  version_no INTEGER,
  created_at TEXT,
  updated_at TEXT,
  cached_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  cached_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  cached_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (question_id, option_order)
);

CREATE INDEX IF NOT EXISTS idx_cached_lectures_course_id ON cached_lectures(course_id);
CREATE INDEX IF NOT EXISTS idx_cached_summaries_lecture_id ON cached_lecture_summaries(lecture_id);
CREATE INDEX IF NOT EXISTS idx_cached_quizzes_lecture_id ON cached_quizzes(lecture_id);
CREATE INDEX IF NOT EXISTS idx_cached_questions_quiz_id ON cached_quiz_questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_cached_options_question_id ON cached_quiz_options(question_id);
`;

const CACHE_TABLES = [
  'cached_quiz_options',
  'cached_quiz_questions',
  'cached_quizzes',
  'cached_lecture_summaries',
  'cached_lectures',
  'cached_courses',
  'cache_meta',
] as const;

export type CachedCourse = {
  id: string;
  courseCode: string | null;
  courseName: string;
  instructorName: string | null;
  semester: string | null;
  section: string | null;
  description: string | null;
  colorHex: string | null;
  isArchived: boolean;
  membershipRole: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CachedLecture = {
  id: string;
  courseId: string;
  title: string;
  lectureNumber: number | null;
  lectureDate: string | null;
  sourceType: string | null;
  status: string | null;
  description: string | null;
  topic: string | null;
  durationSeconds: number | null;
  languageCode: string | null;
  notes: string | null;
  recordedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CachedLectureSummary = {
  id: string;
  lectureId: string;
  summaryType: string;
  summaryText: string;
  wordCount: number | null;
  versionNo: number | null;
  isCurrent: boolean;
  generatedAt: string | null;
  createdAt: string | null;
};

export type CachedQuiz = {
  id: string;
  lectureId: string;
  title: string | null;
  quizType: string;
  difficulty: string;
  questionCount: number | null;
  estimatedMinutes: number | null;
  isAiGenerated: boolean;
  isPublished: boolean;
  versionNo: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export async function initializeLocalDatabase() {
  const db = await getLocalDatabase();
  await db.execAsync(CACHE_SCHEMA_SQL);
  return db;
}

export async function clearLocalCache() {
  const db = await initializeLocalDatabase();

  await db.withTransactionAsync(async () => {
    for (const table of CACHE_TABLES) {
      await db.execAsync(`DELETE FROM ${table};`);
    }
  });
}

export async function replaceCachedCourses(courses: CachedCourse[]) {
  const db = await initializeLocalDatabase();
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM cached_courses;');

    for (const course of courses) {
      await db.runAsync(
        `INSERT INTO cached_courses (
          id, course_code, course_name, instructor_name, semester, section, description,
          color_hex, is_archived, membership_role, created_at, updated_at, cached_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          course.id,
          course.courseCode,
          course.courseName,
          course.instructorName,
          course.semester,
          course.section,
          course.description,
          course.colorHex,
          course.isArchived ? 1 : 0,
          course.membershipRole,
          course.createdAt,
          course.updatedAt,
          now,
        ]
      );
    }

    await setMetaValue(db, 'courses_last_synced_at', now);
  });
}

export async function replaceCachedLectures(lectures: CachedLecture[]) {
  const db = await initializeLocalDatabase();
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM cached_lectures;');

    for (const lecture of lectures) {
      await db.runAsync(
        `INSERT INTO cached_lectures (
          id, course_id, title, lecture_number, lecture_date, source_type, status, description,
          topic, duration_seconds, language_code, notes, recorded_at, created_at, updated_at, cached_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          lecture.id,
          lecture.courseId,
          lecture.title,
          lecture.lectureNumber,
          lecture.lectureDate,
          lecture.sourceType,
          lecture.status,
          lecture.description,
          lecture.topic,
          lecture.durationSeconds,
          lecture.languageCode,
          lecture.notes,
          lecture.recordedAt,
          lecture.createdAt,
          lecture.updatedAt,
          now,
        ]
      );
    }

    await setMetaValue(db, 'lectures_last_synced_at', now);
  });
}

export async function replaceCachedLectureSummaries(summaries: CachedLectureSummary[]) {
  const db = await initializeLocalDatabase();
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM cached_lecture_summaries;');

    for (const summary of summaries) {
      await db.runAsync(
        `INSERT INTO cached_lecture_summaries (
          id, lecture_id, summary_type, summary_text, word_count, version_no, is_current,
          generated_at, created_at, cached_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          summary.id,
          summary.lectureId,
          summary.summaryType,
          summary.summaryText,
          summary.wordCount,
          summary.versionNo,
          summary.isCurrent ? 1 : 0,
          summary.generatedAt,
          summary.createdAt,
          now,
        ]
      );
    }

    await setMetaValue(db, 'summaries_last_synced_at', now);
  });
}

export async function replaceCachedQuizzes(quizzes: CachedQuiz[]) {
  const db = await initializeLocalDatabase();
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM cached_quizzes;');

    for (const quiz of quizzes) {
      await db.runAsync(
        `INSERT INTO cached_quizzes (
          id, lecture_id, title, quiz_type, difficulty, question_count, estimated_minutes,
          is_ai_generated, is_published, version_no, created_at, updated_at, cached_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          quiz.id,
          quiz.lectureId,
          quiz.title,
          quiz.quizType,
          quiz.difficulty,
          quiz.questionCount,
          quiz.estimatedMinutes,
          quiz.isAiGenerated ? 1 : 0,
          quiz.isPublished ? 1 : 0,
          quiz.versionNo,
          quiz.createdAt,
          quiz.updatedAt,
          now,
        ]
      );
    }

    await setMetaValue(db, 'quizzes_last_synced_at', now);
  });
}

async function setMetaValue(db: SQLite.SQLiteDatabase, key: string, value: string) {
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
