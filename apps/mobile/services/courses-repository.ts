import type { AuthUser } from './auth-api';
import type { RemoteCoursePayload, RemoteCourseRecord } from './courses-api';
import {
  getMetaValue,
  initializeLocalDatabase,
  runSerializedLocalWrite,
  setMetaValue,
} from './local-db';

export type SemesterTerm = 'Winter' | 'Spring' | 'Summer' | 'Fall';
export type CourseType = 'in_person' | 'online' | 'zoom';
export type CourseMeetingDay =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';
export type CourseMeeting = {
  dayOfWeek: CourseMeetingDay;
  startTime: string;
  endTime: string;
};
export const NO_CLASS_COURSE_ID = 'no-class';
const CURRENT_COURSE_META_KEY = 'current_course_id';

export const COURSE_TYPE_OPTIONS: Array<{ value: CourseType; label: string }> = [
  { value: 'in_person', label: 'In-person' },
  { value: 'online', label: 'Online' },
  { value: 'zoom', label: 'Zoom' },
];

export const COURSE_MEETING_DAY_OPTIONS: Array<{ value: CourseMeetingDay; label: string; shortLabel: string }> = [
  { value: 'monday', label: 'Monday', shortLabel: 'Mon' },
  { value: 'tuesday', label: 'Tuesday', shortLabel: 'Tue' },
  { value: 'wednesday', label: 'Wednesday', shortLabel: 'Wed' },
  { value: 'thursday', label: 'Thursday', shortLabel: 'Thu' },
  { value: 'friday', label: 'Friday', shortLabel: 'Fri' },
  { value: 'saturday', label: 'Saturday', shortLabel: 'Sat' },
  { value: 'sunday', label: 'Sunday', shortLabel: 'Sun' },
];

export type CourseDraft = {
  courseCode: string;
  courseName: string;
  instructorName: string;
  semesterTerm: SemesterTerm;
  semesterYear: string;
  section: string;
  courseType: CourseType;
  meetingSchedule: CourseMeeting[];
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
  courseType: CourseType;
  meetingSchedule: CourseMeeting[];
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
    courseType: 'in_person',
    meetingSchedule: [],
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
    courseType: course.courseType,
    meetingSchedule: course.meetingSchedule,
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
    course_type: CourseType | null;
    meeting_schedule_json: string | null;
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
       course_type,
       meeting_schedule_json,
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
    courseType: normalized.courseType,
    meetingSchedule: normalized.meetingSchedule,
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
       course_type,
       meeting_schedule_json,
       description,
       color_hex,
       is_archived,
       created_at,
       updated_at,
       sync_status,
       dirty_fields_json,
       last_synced_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       owner_user_id = excluded.owner_user_id,
       course_code = excluded.course_code,
       course_name = excluded.course_name,
       instructor_name = excluded.instructor_name,
       semester = excluded.semester,
       section = excluded.section,
       course_type = excluded.course_type,
       meeting_schedule_json = excluded.meeting_schedule_json,
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
      course.courseType,
      JSON.stringify(normalizeMeetingSchedule(course.meetingSchedule)),
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
  course_type: CourseType | null;
  meeting_schedule_json: string | null;
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
    courseType: normalizeCourseType(row.course_type),
    meetingSchedule: parseMeetingSchedule(row.meeting_schedule_json),
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
    courseType: draft.courseType,
    meetingSchedule:
      draft.courseType === 'in_person' ? normalizeMeetingSchedule(draft.meetingSchedule) : [],
    description: draft.description.trim(),
    colorHex: normalizeColor(draft.colorHex),
  };
}

export function toggleMeetingDayInDraft(draft: CourseDraft, dayOfWeek: CourseMeetingDay): CourseDraft {
  const currentSchedule = normalizeMeetingSchedule(draft.meetingSchedule);
  const existingMeeting = currentSchedule.find((meeting) => meeting.dayOfWeek === dayOfWeek);

  return {
    ...draft,
    meetingSchedule: existingMeeting
      ? currentSchedule.filter((meeting) => meeting.dayOfWeek !== dayOfWeek)
      : normalizeMeetingSchedule([...currentSchedule, { dayOfWeek, startTime: '09:00', endTime: '10:00' }]),
  };
}

export function setMeetingStartTimeInDraft(
  draft: CourseDraft,
  dayOfWeek: CourseMeetingDay,
  startTime: string
): CourseDraft {
  return {
    ...draft,
    meetingSchedule: normalizeMeetingSchedule(
      draft.meetingSchedule.map((meeting) =>
        meeting.dayOfWeek === dayOfWeek ? { ...meeting, startTime } : meeting
      )
    ),
  };
}

export function setMeetingEndTimeInDraft(
  draft: CourseDraft,
  dayOfWeek: CourseMeetingDay,
  endTime: string
): CourseDraft {
  return {
    ...draft,
    meetingSchedule: normalizeMeetingSchedule(
      draft.meetingSchedule.map((meeting) =>
        meeting.dayOfWeek === dayOfWeek ? { ...meeting, endTime } : meeting
      )
    ),
  };
}

export function formatCourseTypeLabel(courseType: CourseType) {
  return COURSE_TYPE_OPTIONS.find((option) => option.value === courseType)?.label ?? 'In-person';
}

export function formatMeetingTimeLabel(time: string) {
  const match = time.match(/^(\d{2}):(\d{2})$/);

  if (!match) {
    return time;
  }

  const hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHours}:${minutes} ${suffix}`;
}

export function formatMeetingScheduleSummary(courseType: CourseType, schedule: CourseMeeting[]) {
  const typeLabel = formatCourseTypeLabel(courseType);

  if (courseType !== 'in_person') {
    return typeLabel;
  }

  const normalized = normalizeMeetingSchedule(schedule);

  if (normalized.length === 0) {
    return `${typeLabel} • Schedule pending`;
  }

  const items = normalized.map((meeting) => {
    const dayLabel =
      COURSE_MEETING_DAY_OPTIONS.find((option) => option.value === meeting.dayOfWeek)?.shortLabel ??
      meeting.dayOfWeek;
    return `${dayLabel} ${formatMeetingTimeLabel(meeting.startTime)}-${formatMeetingTimeLabel(meeting.endTime)}`;
  });

  return `${typeLabel} • ${items.join(' • ')}`;
}

export function findSemesterScheduleConflict(
  draft: CourseDraft,
  courses: LocalCourseRecord[],
  excludedCourseId?: string | null
) {
  const normalizedDraft = normalizeDraft(draft);

  if (normalizedDraft.courseType !== 'in_person' || normalizedDraft.meetingSchedule.length === 0) {
    return null;
  }

  const semester = `${normalizedDraft.semesterTerm} ${normalizedDraft.semesterYear}`;

  for (const course of courses) {
    if (
      course.id === excludedCourseId ||
      course.isArchived ||
      course.courseType !== 'in_person' ||
      course.semester !== semester
    ) {
      continue;
    }

    const conflictingDay = findOverlappingMeetingDay(normalizedDraft.meetingSchedule, course.meetingSchedule);

    if (!conflictingDay) {
      continue;
    }

    return {
      courseId: course.id,
      courseName: course.courseName,
      dayOfWeek: conflictingDay,
      semester,
    };
  }

  return null;
}

export function createMeetingDate(time: string) {
  const match = time.match(/^(\d{2}):(\d{2})$/);
  const date = new Date();

  if (!match) {
    date.setHours(9, 0, 0, 0);
    return date;
  }

  date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return date;
}

export function formatMeetingTimeValue(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function normalizeCourseType(value: string | null | undefined): CourseType {
  if (value === 'online' || value === 'zoom' || value === 'in_person') {
    return value;
  }

  return 'in_person';
}

function parseMeetingSchedule(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  try {
    return normalizeMeetingSchedule(JSON.parse(value));
  } catch {
    return [];
  }
}

function normalizeMeetingSchedule(value: unknown): CourseMeeting[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenDays = new Set<CourseMeetingDay>();
  const normalized: CourseMeeting[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const record = entry as Partial<CourseMeeting>;
    const dayOfWeek = normalizeMeetingDay(record.dayOfWeek);
    const startTime = normalizeMeetingTime(record.startTime);
    const endTime = normalizeMeetingTime(record.endTime);
    const legacyTime =
      typeof (entry as { time?: unknown }).time === 'string'
        ? normalizeMeetingTime((entry as { time?: string }).time)
        : null;

    const resolvedStartTime = startTime ?? legacyTime;
    const resolvedEndTime = endTime ?? (legacyTime ? addMinutesToTime(legacyTime, 60) : null);

    if (
      !dayOfWeek ||
      !resolvedStartTime ||
      !resolvedEndTime ||
      compareMeetingTimes(resolvedStartTime, resolvedEndTime) >= 0 ||
      seenDays.has(dayOfWeek)
    ) {
      continue;
    }

    seenDays.add(dayOfWeek);
    normalized.push({ dayOfWeek, startTime: resolvedStartTime, endTime: resolvedEndTime });
  }

  return normalized.sort(
    (left, right) =>
      COURSE_MEETING_DAY_OPTIONS.findIndex((option) => option.value === left.dayOfWeek) -
      COURSE_MEETING_DAY_OPTIONS.findIndex((option) => option.value === right.dayOfWeek)
  );
}

function findOverlappingMeetingDay(left: CourseMeeting[], right: CourseMeeting[]) {
  const normalizedRight = normalizeMeetingSchedule(right);

  for (const leftMeeting of left) {
    const rightMeeting = normalizedRight.find((entry) => entry.dayOfWeek === leftMeeting.dayOfWeek);

    if (!rightMeeting) {
      continue;
    }

    if (meetingTimesOverlap(leftMeeting, rightMeeting)) {
      return leftMeeting.dayOfWeek;
    }
  }

  return null;
}

function meetingTimesOverlap(left: CourseMeeting, right: CourseMeeting) {
  return compareMeetingTimes(left.startTime, right.endTime) < 0 && compareMeetingTimes(right.startTime, left.endTime) < 0;
}

function normalizeMeetingDay(value: unknown): CourseMeetingDay | null {
  if (
    value === 'monday' ||
    value === 'tuesday' ||
    value === 'wednesday' ||
    value === 'thursday' ||
    value === 'friday' ||
    value === 'saturday' ||
    value === 'sunday'
  ) {
    return value;
  }

  return null;
}

function normalizeMeetingTime(value: unknown) {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
}

function compareMeetingTimes(left: string, right: string) {
  return left.localeCompare(right);
}

function addMinutesToTime(value: string, minutesToAdd: number) {
  const match = value.match(/^(\d{2}):(\d{2})$/);

  if (!match) {
    return '10:00';
  }

  const startMinutes = Number(match[1]) * 60 + Number(match[2]);
  const totalMinutes = Math.min(startMinutes + minutesToAdd, 23 * 60 + 59);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
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
