import { getDb } from '@lectrai/db';
import { HttpError } from '../../lib/http-error.js';

type SemesterTerm = 'Winter' | 'Spring' | 'Summer' | 'Fall';

export type CourseInput = {
  courseCode: string;
  courseName: string;
  instructorName: string;
  semesterTerm: SemesterTerm;
  semesterYear: number;
  section: string;
  description: string;
  colorHex: string;
};

export type CourseRecord = {
  id: string;
  ownerUserId: string;
  courseCode: string | null;
  courseName: string;
  instructorName: string | null;
  semester: string | null;
  section: string | null;
  description: string | null;
  colorHex: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

export function parseCourseInput(payload: unknown): CourseInput {
  const record = readObject(payload);
  const semesterTerm = readSemesterTerm(record.semesterTerm);
  const semesterYear = readSemesterYear(record.semesterYear);
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
    description: readOptionalString(record.description),
    colorHex,
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

export async function createCourseForUser(userId: string, input: CourseInput) {
  const db = getDb();
  const semester = formatSemester(input.semesterTerm, input.semesterYear);
  const rows = await db<DbCourseRow[]>`
    insert into public.courses (
      owner_user_id,
      course_code,
      course_name,
      instructor_name,
      semester,
      section,
      description,
      color_hex
    ) values (
      ${userId},
      ${nullable(input.courseCode)},
      ${input.courseName},
      ${nullable(input.instructorName)},
      ${semester},
      ${nullable(input.section)},
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
  const rows = await db<DbCourseRow[]>`
    update public.courses
    set
      course_code = ${nullable(input.courseCode)},
      course_name = ${input.courseName},
      instructor_name = ${nullable(input.instructorName)},
      semester = ${semester},
      section = ${nullable(input.section)},
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

function formatSemester(term: SemesterTerm, year: number) {
  return `${term} ${year}`;
}

function nullable(value: string) {
  return value.length > 0 ? value : null;
}

type DbCourseRow = {
  id: string;
  owner_user_id: string;
  course_code: string | null;
  course_name: string;
  instructor_name: string | null;
  semester: string | null;
  section: string | null;
  description: string | null;
  color_hex: string | null;
  is_archived: boolean;
  created_at: Date;
  updated_at: Date;
};
