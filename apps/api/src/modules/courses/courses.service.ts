import { getDb, getSupabaseAdminClient } from '@lectrai/db';
import { HttpError } from '../../lib/http-error.js';

type SemesterTerm = 'Winter' | 'Spring' | 'Summer' | 'Fall';
type CourseType = 'in_person' | 'online' | 'zoom';
type CourseMeetingDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
type CourseFileRelationType = 'lecture_file' | 'module_file' | 'chapter_file' | 'notes' | 'other';

const COURSE_FILES_BUCKET_NAME = 'course-files';

export type CourseInput = {
  courseCode: string;
  courseName: string;
  instructorName: string;
  semesterTerm: SemesterTerm;
  semesterYear: number;
  section: string;
  courseType: CourseType;
  meetingSchedule: CourseMeeting[];
  description: string;
  colorHex: string;
};

export type CourseMeeting = {
  dayOfWeek: CourseMeetingDay;
  startTime: string;
  endTime: string;
};

export type CourseRecord = {
  id: string;
  ownerUserId: string;
  courseCode: string | null;
  courseName: string;
  instructorName: string | null;
  semester: string | null;
  section: string | null;
  courseType: CourseType;
  meetingSchedule: CourseMeeting[];
  description: string | null;
  colorHex: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CourseFileInput = {
  courseFileId: string;
  title: string;
  description: string;
  relationType: CourseFileRelationType;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  fileBase64: string;
};

export type CourseFileRecord = {
  id: string;
  courseId: string;
  uploadedByUserId: string;
  title: string;
  description: string | null;
  relationType: CourseFileRelationType;
  sourceType: 'file';
  storageProvider: 'gcs' | null;
  bucketName: string | null;
  objectPath: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  fileExtension: string | null;
  uploadStatus: 'pending' | 'uploaded' | 'failed';
  uploadedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function parseCourseInput(payload: unknown): CourseInput {
  const record = readObject(payload);
  const semesterTerm = readSemesterTerm(record.semesterTerm);
  const semesterYear = readSemesterYear(record.semesterYear);
  const courseType = readCourseType(record.courseType);
  const meetingSchedule = readCourseMeetingSchedule(record.meetingSchedule, courseType);
  const colorHex = readRequiredString(record.colorHex, 'colorHex');

  if (!/^#[0-9A-Fa-f]{6}$/.test(colorHex)) {
    throw new HttpError(400, 'colorHex must be a valid hex color like #0f766e.');
  }

  return {
    courseCode: readOptionalString(record.courseCode),
    courseName: readRequiredString(record.courseName, 'courseName'),
    instructorName: readOptionalString(record.instructorName),
    semesterTerm,
    semesterYear,
    section: readOptionalString(record.section),
    courseType,
    meetingSchedule,
    description: readOptionalString(record.description),
    colorHex,
  };
}

export function parseCourseFileInput(payload: unknown): CourseFileInput {
  const record = readObject(payload);

  return {
    courseFileId: readUuid(record.courseFileId, 'courseFileId'),
    title: readRequiredString(record.title, 'title'),
    description: readOptionalString(record.description),
    relationType: readCourseFileRelationType(record.relationType),
    originalFilename: readRequiredString(record.originalFilename, 'originalFilename'),
    mimeType: readRequiredString(record.mimeType, 'mimeType'),
    fileSizeBytes: readPositiveInteger(record.fileSizeBytes, 'fileSizeBytes'),
    fileBase64: readRequiredString(record.fileBase64, 'fileBase64'),
  };
}

export async function listCoursesForUser(userId: string) {
  const db = getDb();
  const rows = await db<DbCourseRow[]>`
    select
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
      updated_at
    from public.courses
    where owner_user_id = ${userId}
      and is_archived = false
    order by updated_at desc, course_name asc
  `;

  return rows.map(mapCourseRow);
}

export async function listCourseFilesForUser(userId: string, courseId: string) {
  await assertUserCanViewCourse(userId, courseId);

  const db = getDb();
  const rows = await db<DbCourseFileRow[]>`
    select
      id,
      course_id,
      uploaded_by_user_id,
      title,
      description,
      relation_type,
      source_type,
      storage_provider,
      bucket_name,
      object_path,
      original_filename,
      mime_type,
      file_size_bytes,
      file_extension,
      upload_status,
      uploaded_at,
      created_at,
      updated_at
    from public.course_files
    where course_id = ${courseId}::uuid
    order by created_at desc
  `;

  return rows.map(mapCourseFileRow);
}

export async function createCourseForUser(userId: string, input: CourseInput) {
  const db = getDb();
  const semester = formatSemester(input.semesterTerm, input.semesterYear);
  await assertNoOverlappingCourseSchedule(userId, semester, input);
  const rows = await db<DbCourseRow[]>`
    insert into public.courses (
      owner_user_id,
      course_code,
      course_name,
      instructor_name,
      semester,
      section,
      course_type,
      meeting_schedule_json,
      description,
      color_hex
    ) values (
      ${userId},
      ${nullable(input.courseCode)},
      ${input.courseName},
      ${nullable(input.instructorName)},
      ${semester},
      ${nullable(input.section)},
      ${input.courseType},
      ${db.json(input.meetingSchedule)},
      ${nullable(input.description)},
      ${input.colorHex}
    )
    returning
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
      updated_at
  `;

  return mapSingleCourse(rows, 'Failed to create course.');
}

export async function updateCourseForUser(userId: string, courseId: string, input: CourseInput) {
  const db = getDb();
  const semester = formatSemester(input.semesterTerm, input.semesterYear);
  await assertNoOverlappingCourseSchedule(userId, semester, input, courseId);
  const rows = await db<DbCourseRow[]>`
    update public.courses
    set
      course_code = ${nullable(input.courseCode)},
      course_name = ${input.courseName},
      instructor_name = ${nullable(input.instructorName)},
      semester = ${semester},
      section = ${nullable(input.section)},
      course_type = ${input.courseType},
      meeting_schedule_json = ${db.json(input.meetingSchedule)},
      description = ${nullable(input.description)},
      color_hex = ${input.colorHex}
    where id = ${courseId}
      and owner_user_id = ${userId}
    returning
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
      updated_at
  `;

  return mapSingleCourse(rows, 'Course not found.', 404);
}

export async function deleteCourseForUser(userId: string, courseId: string) {
  const db = getDb();
  const rows = await db<{ id: string }[]>`
    delete from public.courses
    where id = ${courseId}
      and owner_user_id = ${userId}
    returning id
  `;

  if (rows.length === 0) {
    throw new HttpError(404, 'Course not found.');
  }
}

export async function createCourseFileForUser(
  userId: string,
  courseId: string,
  input: CourseFileInput
) {
  await assertUserCanManageCourse(userId, courseId);

  const objectPath = buildCourseFileObjectPath(userId, courseId, input.courseFileId, input.originalFilename);
  const fileBytes = Buffer.from(input.fileBase64, 'base64');
  const supabase = getSupabaseAdminClient();
  const uploadResult = await supabase.storage.from(COURSE_FILES_BUCKET_NAME).upload(objectPath, fileBytes, {
    contentType: input.mimeType,
    upsert: true,
  });

  if (uploadResult.error) {
    throw new HttpError(502, 'Failed to store course file.', uploadResult.error.message);
  }

  const db = getDb();
  const rows = await db<DbCourseFileRow[]>`
    insert into public.course_files (
      id,
      course_id,
      uploaded_by_user_id,
      title,
      description,
      relation_type,
      source_type,
      storage_provider,
      bucket_name,
      object_path,
      original_filename,
      mime_type,
      file_size_bytes,
      file_extension,
      upload_status,
      uploaded_at
    ) values (
      ${input.courseFileId}::uuid,
      ${courseId}::uuid,
      ${userId}::uuid,
      ${input.title},
      ${nullable(input.description)},
      ${input.relationType},
      'file',
      'gcs',
      ${COURSE_FILES_BUCKET_NAME},
      ${objectPath},
      ${input.originalFilename},
      ${input.mimeType},
      ${input.fileSizeBytes},
      ${readFileExtension(input.originalFilename)},
      'uploaded',
      timezone('utc', now())
    )
    on conflict (id) do update
    set
      course_id = excluded.course_id,
      uploaded_by_user_id = excluded.uploaded_by_user_id,
      title = excluded.title,
      description = excluded.description,
      relation_type = excluded.relation_type,
      source_type = excluded.source_type,
      storage_provider = excluded.storage_provider,
      bucket_name = excluded.bucket_name,
      object_path = excluded.object_path,
      original_filename = excluded.original_filename,
      mime_type = excluded.mime_type,
      file_size_bytes = excluded.file_size_bytes,
      file_extension = excluded.file_extension,
      upload_status = excluded.upload_status,
      uploaded_at = excluded.uploaded_at
    returning
      id,
      course_id,
      uploaded_by_user_id,
      title,
      description,
      relation_type,
      source_type,
      storage_provider,
      bucket_name,
      object_path,
      original_filename,
      mime_type,
      file_size_bytes,
      file_extension,
      upload_status,
      uploaded_at,
      created_at,
      updated_at
  `;

  return mapSingleCourseFile(rows, 'Failed to create course file.');
}

function mapSingleCourse(rows: DbCourseRow[], message: string, statusCode = 500) {
  const row = rows[0];

  if (!row) {
    throw new HttpError(statusCode, message);
  }

  return mapCourseRow(row);
}

function mapCourseRow(row: DbCourseRow): CourseRecord {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    courseCode: row.course_code,
    courseName: row.course_name,
    instructorName: row.instructor_name,
    semester: row.semester,
    section: row.section,
    courseType: row.course_type,
    meetingSchedule: normalizeDbMeetingSchedule(row.meeting_schedule_json),
    description: row.description,
    colorHex: row.color_hex,
    isArchived: row.is_archived,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function readObject(payload: unknown): Record<string, unknown> {
  if (payload == null || typeof payload !== 'object') {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }

  return payload as Record<string, unknown>;
}

function readRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, `${fieldName} is required.`);
  }

  return value.trim();
}

function readOptionalString(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function readUuid(value: unknown, fieldName: string) {
  const normalized = readRequiredString(value, fieldName);

  if (!/^[0-9a-fA-F-]{36}$/.test(normalized)) {
    throw new HttpError(400, `${fieldName} must be a valid UUID.`);
  }

  return normalized;
}

function readPositiveInteger(value: unknown, fieldName: string) {
  const normalized = typeof value === 'number' ? value : Number(value);

  if (!Number.isInteger(normalized) || normalized < 0) {
    throw new HttpError(400, `${fieldName} must be a positive integer.`);
  }

  return normalized;
}

function readCourseFileRelationType(value: unknown): CourseFileRelationType {
  if (
    value === 'lecture_file' ||
    value === 'module_file' ||
    value === 'chapter_file' ||
    value === 'notes' ||
    value === 'other'
  ) {
    return value;
  }

  throw new HttpError(
    400,
    'relationType must be one of: lecture_file, module_file, chapter_file, notes, other.'
  );
}

function readSemesterTerm(value: unknown): SemesterTerm {
  if (value === 'Winter' || value === 'Spring' || value === 'Summer' || value === 'Fall') {
    return value;
  }

  throw new HttpError(400, 'semesterTerm must be one of: Winter, Spring, Summer, Fall.');
}

function readSemesterYear(value: unknown) {
  const year = typeof value === 'number' ? value : Number(value);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new HttpError(400, 'semesterYear must be a valid year.');
  }

  return year;
}

function readCourseType(value: unknown): CourseType {
  if (value === 'in_person' || value === 'online' || value === 'zoom') {
    return value;
  }

  throw new HttpError(400, 'courseType must be one of: in_person, online, zoom.');
}

function readCourseMeetingSchedule(value: unknown, courseType: CourseType) {
  const parsed = normalizeMeetingSchedule(value);

  if (courseType === 'in_person' && parsed.length === 0) {
    throw new HttpError(400, 'meetingSchedule is required for in-person courses.');
  }

  if (courseType !== 'in_person' && parsed.length > 0) {
    throw new HttpError(400, 'meetingSchedule must be empty for online or zoom courses.');
  }

  return parsed;
}

function normalizeMeetingSchedule(value: unknown): CourseMeeting[] {
  if (value == null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new HttpError(400, 'meetingSchedule must be an array.');
  }

  const seenDays = new Set<CourseMeetingDay>();
  const normalized = value.map((entry, index) => {
    const record = readObject(entry);
    const dayOfWeek = readCourseMeetingDay(record.dayOfWeek, `meetingSchedule[${index}].dayOfWeek`);
    const startTime = readCourseMeetingTime(record.startTime, `meetingSchedule[${index}].startTime`);
    const endTime = readCourseMeetingTime(record.endTime, `meetingSchedule[${index}].endTime`);

    if (seenDays.has(dayOfWeek)) {
      throw new HttpError(400, `meetingSchedule contains a duplicate day: ${dayOfWeek}.`);
    }

    if (compareMeetingTimes(startTime, endTime) >= 0) {
      throw new HttpError(400, `meetingSchedule[${index}] must have an endTime after startTime.`);
    }

    seenDays.add(dayOfWeek);
    return { dayOfWeek, startTime, endTime };
  });

  return normalized.sort((left, right) => COURSE_MEETING_DAY_ORDER.indexOf(left.dayOfWeek) - COURSE_MEETING_DAY_ORDER.indexOf(right.dayOfWeek));
}

function readCourseMeetingDay(value: unknown, fieldName: string): CourseMeetingDay {
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

  throw new HttpError(
    400,
    `${fieldName} must be one of: monday, tuesday, wednesday, thursday, friday, saturday, sunday.`
  );
}

function readCourseMeetingTime(value: unknown, fieldName: string) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new HttpError(400, `${fieldName} must use HH:mm 24-hour time.`);
  }

  return value;
}

function compareMeetingTimes(left: string, right: string) {
  return left.localeCompare(right);
}

function formatSemester(term: SemesterTerm, year: number) {
  return `${term} ${year}`;
}

function nullable(value: string) {
  return value.length > 0 ? value : null;
}

function normalizeDbMeetingSchedule(value: unknown): CourseMeeting[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: CourseMeeting[] = [];
  const seenDays = new Set<CourseMeetingDay>();

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const record = entry as Partial<CourseMeeting> & { time?: unknown };
    const dayOfWeek = normalizeOptionalCourseMeetingDay(record.dayOfWeek);
    const startTime = normalizeOptionalCourseMeetingTime(record.startTime) ?? normalizeOptionalCourseMeetingTime(record.time);
    const endTime =
      normalizeOptionalCourseMeetingTime(record.endTime) ??
      (startTime ? addHourToMeetingTime(startTime) : null);

    if (
      !dayOfWeek ||
      !startTime ||
      !endTime ||
      compareMeetingTimes(startTime, endTime) >= 0 ||
      seenDays.has(dayOfWeek)
    ) {
      continue;
    }

    seenDays.add(dayOfWeek);
    normalized.push({ dayOfWeek, startTime, endTime });
  }

  return normalized.sort(
    (left, right) =>
      COURSE_MEETING_DAY_ORDER.indexOf(left.dayOfWeek) - COURSE_MEETING_DAY_ORDER.indexOf(right.dayOfWeek)
  );
}

async function assertNoOverlappingCourseSchedule(
  userId: string,
  semester: string,
  input: CourseInput,
  excludedCourseId?: string
) {
  if (input.courseType !== 'in_person' || input.meetingSchedule.length === 0) {
    return;
  }

  const db = getDb();
  const rows = await db<Pick<DbCourseRow, 'id' | 'course_name' | 'meeting_schedule_json'>[]>`
    select
      id,
      course_name,
      meeting_schedule_json
    from public.courses
    where owner_user_id = ${userId}::uuid
      and semester = ${semester}
      and course_type = 'in_person'
      and is_archived = false
      and (${excludedCourseId ?? null}::uuid is null or id <> ${excludedCourseId ?? null}::uuid)
  `;

  for (const row of rows) {
    const existingSchedule = normalizeDbMeetingSchedule(row.meeting_schedule_json);
    const conflictingDay = findOverlappingMeetingDay(input.meetingSchedule, existingSchedule);

    if (!conflictingDay) {
      continue;
    }

    throw new HttpError(
      409,
      `This in-person schedule overlaps with ${row.course_name} on ${formatCourseMeetingDayLabel(conflictingDay)} in ${semester}.`
    );
  }
}

function findOverlappingMeetingDay(left: CourseMeeting[], right: CourseMeeting[]) {
  for (const leftMeeting of left) {
    const rightMeeting = right.find((entry) => entry.dayOfWeek === leftMeeting.dayOfWeek);

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

function formatCourseMeetingDayLabel(dayOfWeek: CourseMeetingDay) {
  return `${dayOfWeek.slice(0, 1).toUpperCase()}${dayOfWeek.slice(1)}`;
}

function normalizeOptionalCourseMeetingDay(value: unknown): CourseMeetingDay | null {
  return (
    value === 'monday' ||
    value === 'tuesday' ||
    value === 'wednesday' ||
    value === 'thursday' ||
    value === 'friday' ||
    value === 'saturday' ||
    value === 'sunday'
  )
    ? value
    : null;
}

function normalizeOptionalCourseMeetingTime(value: unknown) {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
}

function addHourToMeetingTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  const totalMinutes = Math.min(hours * 60 + minutes + 60, 23 * 60 + 59);
  const nextHours = Math.floor(totalMinutes / 60);
  const nextMinutes = totalMinutes % 60;

  return `${String(nextHours).padStart(2, '0')}:${String(nextMinutes).padStart(2, '0')}`;
}

function readFileExtension(filename: string) {
  const match = filename.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : null;
}

function buildCourseFileObjectPath(
  userId: string,
  courseId: string,
  courseFileId: string,
  filename: string
) {
  return `${userId}/${courseId}/${courseFileId}/${Date.now()}-${sanitizeFilename(filename)}`;
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

async function assertUserCanViewCourse(userId: string, courseId: string) {
  const db = getDb();
  const rows = await db<{ id: string }[]>`
    select c.id
    from public.courses c
    where c.id = ${courseId}::uuid
      and (
        c.owner_user_id = ${userId}::uuid
        or exists (
          select 1
          from public.course_members cm
          where cm.course_id = c.id
            and cm.user_id = ${userId}::uuid
            and cm.is_active = true
        )
      )
    limit 1
  `;

  if (rows.length === 0) {
    throw new HttpError(403, 'You do not have permission to view files for this course.');
  }
}

async function assertUserCanManageCourse(userId: string, courseId: string) {
  const db = getDb();
  const rows = await db<{ id: string }[]>`
    select c.id
    from public.courses c
    where c.id = ${courseId}::uuid
      and (
        c.owner_user_id = ${userId}::uuid
        or exists (
          select 1
          from public.course_members cm
          where cm.course_id = c.id
            and cm.user_id = ${userId}::uuid
            and cm.is_active = true
            and cm.membership_role in ('instructor', 'ta')
        )
      )
    limit 1
  `;

  if (rows.length === 0) {
    throw new HttpError(403, 'You do not have permission to upload files for this course.');
  }
}

function mapSingleCourseFile(rows: DbCourseFileRow[], message: string, statusCode = 500) {
  const row = rows[0];

  if (!row) {
    throw new HttpError(statusCode, message);
  }

  return mapCourseFileRow(row);
}

function mapCourseFileRow(row: DbCourseFileRow): CourseFileRecord {
  return {
    id: row.id,
    courseId: row.course_id,
    uploadedByUserId: row.uploaded_by_user_id,
    title: row.title,
    description: row.description,
    relationType: row.relation_type,
    sourceType: row.source_type,
    storageProvider: row.storage_provider,
    bucketName: row.bucket_name,
    objectPath: row.object_path,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    fileExtension: row.file_extension,
    uploadStatus: row.upload_status,
    uploadedAt: row.uploaded_at ? row.uploaded_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

type DbCourseRow = {
  id: string;
  owner_user_id: string;
  course_code: string | null;
  course_name: string;
  instructor_name: string | null;
  semester: string | null;
  section: string | null;
  course_type: CourseType;
  meeting_schedule_json: unknown;
  description: string | null;
  color_hex: string | null;
  is_archived: boolean;
  created_at: Date;
  updated_at: Date;
};

const COURSE_MEETING_DAY_ORDER: CourseMeetingDay[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

type DbCourseFileRow = {
  id: string;
  course_id: string;
  uploaded_by_user_id: string;
  title: string;
  description: string | null;
  relation_type: CourseFileRelationType;
  source_type: 'file';
  storage_provider: 'gcs' | null;
  bucket_name: string | null;
  object_path: string | null;
  original_filename: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  file_extension: string | null;
  upload_status: 'pending' | 'uploaded' | 'failed';
  uploaded_at: Date | null;
  created_at: Date;
  updated_at: Date;
};
