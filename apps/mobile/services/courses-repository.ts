import type { AuthUser } from './auth-api';
import type { RemoteCoursePayload, RemoteCourseRecord } from './courses-api';
import {
  getMetaValue,
  initializeLocalDatabase,
  runSerializedLocalWrite,
  setMetaValue,
} from './local-db';

export type SemesterTerm = 'Winter' | 'Spring' | 'Summer' | 'Fall';
export const NO_CLASS_COURSE_ID = 'no-class';
const CURRENT_COURSE_META_KEY = 'current_course_id';

export type CourseDraft = {
  courseCode: string;
  courseName: string;
  instructorName: string;
  semesterTerm: SemesterTerm;
  semesterYear: string;
  section: string;
  description: string;
  colorHex: string;
};

export type LocalCourseRecord = {
  id: string;
  ownerUserId: string | null;
  courseCode: string;
  courseName: string;
  instructorName: string;
  semester: string;
  semesterTerm: SemesterTerm;
  semesterYear: number;
  section: string;
  description: string;
  colorHex: string;
  isArchived: boolean;
  syncStatus: 'synced' | 'pending_pull' | 'pending_push' | 'conflict';
  createdAt: string | null;
  updatedAt: string | null;
};

export const COURSE_COLOR_WHEEL = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#eab308',
  '#84cc16',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
] as const;

export function createEmptyCourseDraft(): CourseDraft {
  const currentSemester = getCurrentSemester();

  return {
    courseCode: '',
    courseName: '',
    instructorName: '',
    semesterTerm: currentSemester.term,
    semesterYear: String(currentSemester.year),
    section: '',
    description: '',
    colorHex: COURSE_COLOR_WHEEL[6],
  };
}

export function createCourseDraftFromRecord(course: LocalCourseRecord): CourseDraft {
  return {
    courseCode: course.courseCode,
    courseName: course.courseName,
    instructorName: course.instructorName,
    semesterTerm: course.semesterTerm,
    semesterYear: String(course.semesterYear),
    section: course.section,
    description: course.description,
    colorHex: course.colorHex,
  };
}

export function getSemesterYearOptions() {
  const currentYear = new Date().getFullYear();

  return Array.from({ length: 7 }, (_, index) => String(currentYear - 1 + index));
}

export async function listCoursesForUser(user: AuthUser) {
  const db = await initializeLocalDatabase();

  await ensureLocalUser(db, user);

  const rows = await db.getAllAsync<{
    id: string;
    owner_user_id: string | null;
    course_code: string | null;
    course_name: string;
    instructor_name: string | null;
    semester: string | null;
    section: string | null;
    description: string | null;
    color_hex: string | null;
    is_archived: number;
    sync_status: LocalCourseRecord['syncStatus'];
    created_at: string | null;
    updated_at: string | null;
  }>(
    `SELECT
       id,
       owner_user_id,
       course_code,
       course_name,
       instructor_name,
       semester,
       section,
       description,
       color_hex,
       is_archived,
       sync_status,
       created_at,
       updated_at
     FROM cached_courses
     WHERE owner_user_id = ? AND is_archived = 0
     ORDER BY COALESCE(updated_at, created_at) DESC, course_name COLLATE NOCASE ASC`,
    [user.id]
  );

  return rows.map((row) => mapRow(row));
}

export async function replaceCoursesForUser(user: AuthUser, courses: RemoteCourseRecord[]) {
  await runSerializedLocalWrite(async (db) => {
    await db.withTransactionAsync(async () => {
      await ensureLocalUser(db, user);
      await db.runAsync('DELETE FROM cached_courses WHERE owner_user_id = ?', [user.id]);

      for (const course of courses) {
        await upsertCourseRecord(db, course);
      }
    });
  });
}

export async function upsertCourseForUser(course: RemoteCourseRecord) {
  const db = await initializeLocalDatabase();
  await upsertCourseRecord(db, course);
}

export async function removeCachedCourseForUser(user: AuthUser, courseId: string) {
  const db = await initializeLocalDatabase();
  await db.runAsync('DELETE FROM cached_courses WHERE id = ? AND owner_user_id = ?', [courseId, user.id]);

  const currentCourseId = await getSelectedCourseId();

  if (currentCourseId === courseId) {
    await setSelectedCourseId(NO_CLASS_COURSE_ID);
  }
}

export async function getSelectedCourseId() {
  return (await getMetaValue(CURRENT_COURSE_META_KEY)) ?? NO_CLASS_COURSE_ID;
}

export async function setSelectedCourseId(courseId: string) {
  const db = await initializeLocalDatabase();
  await setMetaValue(db, CURRENT_COURSE_META_KEY, courseId);
}

export function toRemoteCoursePayload(draft: CourseDraft): RemoteCoursePayload {
  const normalized = normalizeDraft(draft);

  return {
    courseCode: normalized.courseCode,
    courseName: normalized.courseName,
    instructorName: normalized.instructorName,
    semesterTerm: normalized.semesterTerm,
    semesterYear: Number(normalized.semesterYear),
    section: normalized.section,
    description: normalized.description,
    colorHex: normalized.colorHex,
  };
}

async function upsertCourseRecord(
  db: Awaited<ReturnType<typeof initializeLocalDatabase>>,
  course: RemoteCourseRecord
) {
  await db.runAsync(
    `INSERT INTO cached_courses (
       id,
       owner_user_id,
       course_code,
       course_name,
       instructor_name,
       semester,
       section,
       description,
       color_hex,
       is_archived,
       created_at,
       updated_at,
       sync_status,
       dirty_fields_json,
       last_synced_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       owner_user_id = excluded.owner_user_id,
       course_code = excluded.course_code,
       course_name = excluded.course_name,
       instructor_name = excluded.instructor_name,
       semester = excluded.semester,
       section = excluded.section,
       description = excluded.description,
       color_hex = excluded.color_hex,
       is_archived = excluded.is_archived,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at,
       sync_status = excluded.sync_status,
       dirty_fields_json = excluded.dirty_fields_json,
       last_synced_at = excluded.last_synced_at`,
    [
      course.id,
      course.ownerUserId,
      course.courseCode,
      course.courseName,
      course.instructorName,
      course.semester,
      course.section,
      course.description,
      normalizeColor(course.colorHex),
      course.isArchived ? 1 : 0,
      course.createdAt,
      course.updatedAt,
      JSON.stringify([]),
    ]
  );
}

async function ensureLocalUser(
  db: Awaited<ReturnType<typeof initializeLocalDatabase>>,
  user: AuthUser
) {
  await db.runAsync(
    `INSERT INTO cached_users (
       id,
       email,
       full_name,
       role,
       university_name,
       major,
       timezone,
       is_active,
       last_login_at,
       created_at,
       updated_at,
       sync_status,
       dirty_fields_json,
       last_synced_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'synced', ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       email = excluded.email,
       full_name = excluded.full_name,
       role = excluded.role,
       university_name = excluded.university_name,
       major = excluded.major,
       timezone = excluded.timezone,
       is_active = excluded.is_active,
       last_login_at = excluded.last_login_at,
       updated_at = CURRENT_TIMESTAMP`,
    [
      user.id,
      user.email ?? `${user.id}@local.invalid`,
      user.fullName,
      user.role,
      user.universityName,
      user.major,
      user.timezone,
      user.isActive ? 1 : 0,
      user.lastLoginAt,
      JSON.stringify([]),
    ]
  );
}

function mapRow(row: {
  id: string;
  owner_user_id: string | null;
  course_code: string | null;
  course_name: string;
  instructor_name: string | null;
  semester: string | null;
  section: string | null;
  description: string | null;
  color_hex: string | null;
  is_archived: number;
  sync_status: LocalCourseRecord['syncStatus'];
  created_at: string | null;
  updated_at: string | null;
}): LocalCourseRecord {
  const semester = row.semester ?? '';
  const parsedSemester = parseSemester(semester);

  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    courseCode: row.course_code ?? '',
    courseName: row.course_name,
    instructorName: row.instructor_name ?? '',
    semester,
    semesterTerm: parsedSemester.term,
    semesterYear: parsedSemester.year,
    section: row.section ?? '',
    description: row.description ?? '',
    colorHex: normalizeColor(row.color_hex),
    isArchived: row.is_archived === 1,
    syncStatus: row.sync_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeDraft(draft: CourseDraft): CourseDraft {
  const year = draft.semesterYear.trim();

  return {
    courseCode: draft.courseCode.trim(),
    courseName: draft.courseName.trim(),
    instructorName: draft.instructorName.trim(),
    semesterTerm: draft.semesterTerm,
    semesterYear: year,
    section: draft.section.trim(),
    description: draft.description.trim(),
    colorHex: normalizeColor(draft.colorHex),
  };
}

function normalizeColor(value: string | null | undefined) {
  const normalized = value?.trim();

  if (!normalized) {
    return '#14b8a6';
  }

  return normalized.startsWith('#') ? normalized : `#${normalized}`;
}

function getCurrentSemester() {
  const now = new Date();
  const month = now.getMonth();

  if (month <= 1 || month === 11) {
    return { term: 'Winter' as const, year: now.getFullYear() };
  }

  if (month <= 4) {
    return { term: 'Spring' as const, year: now.getFullYear() };
  }

  if (month <= 7) {
    return { term: 'Summer' as const, year: now.getFullYear() };
  }

  return { term: 'Fall' as const, year: now.getFullYear() };
}

function parseSemester(value: string) {
  const match = value.match(/^(Winter|Spring|Summer|Fall)\s+(\d{4})$/);

  if (match) {
    return {
      term: match[1] as SemesterTerm,
      year: Number(match[2]),
    };
  }

  const current = getCurrentSemester();
  return current;
}
