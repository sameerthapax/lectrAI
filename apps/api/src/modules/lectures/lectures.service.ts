import { getDb, getSupabaseAdminClient } from '@lectrai/db';
import { HttpError } from '../../lib/http-error.js';

const AUDIO_BUCKET_NAME = 'lecture-audio';
const PLACEHOLDER_PROCESSOR_NAME = 'placeholder-processing';

export type LectureRecordingInput = {
  lectureId: string;
  audioFileId: string;
  courseId: string;
  title: string;
  recordedAt: string;
  durationSeconds: number;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  audioBase64: string;
};

export type LectureRecordingListItem = {
  lecture: {
    id: string;
    courseId: string;
    createdByUserId: string | null;
    title: string;
    status: string;
    durationSeconds: number | null;
    recordedAt: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  };
  audioFile: {
    id: string;
    uploadedByUserId: string | null;
    bucketName: string | null;
    objectPath: string | null;
    originalFilename: string | null;
    mimeType: string | null;
    fileSizeBytes: number | null;
    durationSeconds: number | null;
    uploadStatus: string;
    uploadedAt: string | null;
    createdAt: string | null;
  } | null;
};

export function parseLectureRecordingInput(payload: unknown): LectureRecordingInput {
  const record = readObject(payload);

  return {
    lectureId: readUuid(record.lectureId, 'lectureId'),
    audioFileId: readUuid(record.audioFileId, 'audioFileId'),
    courseId: readUuid(record.courseId, 'courseId'),
    title: readRequiredString(record.title, 'title'),
    recordedAt: readIsoDate(record.recordedAt, 'recordedAt'),
    durationSeconds: readPositiveInteger(record.durationSeconds, 'durationSeconds'),
    originalFilename: readRequiredString(record.originalFilename, 'originalFilename'),
    mimeType: readRequiredString(record.mimeType, 'mimeType'),
    fileSizeBytes: readPositiveInteger(record.fileSizeBytes, 'fileSizeBytes'),
    audioBase64: readRequiredString(record.audioBase64, 'audioBase64'),
  };
}

export async function createLectureRecordingForUser(userId: string, input: LectureRecordingInput) {
  await assertUserCanManageCourse(userId, input.courseId);

  const objectPath = buildObjectPath(userId, input.courseId, input.lectureId, input.originalFilename);
  const audioBytes = Buffer.from(input.audioBase64, 'base64');
  const supabase = getSupabaseAdminClient();
  const uploadResult = await supabase.storage.from(AUDIO_BUCKET_NAME).upload(objectPath, audioBytes, {
    contentType: input.mimeType,
    upsert: true,
  });

  if (uploadResult.error) {
    throw new HttpError(502, 'Failed to store lecture audio.', uploadResult.error.message);
  }

  const db = getDb();

  await db`
    insert into public.lectures (
      id,
      course_id,
      created_by_user_id,
      title,
      source_type,
      status,
      duration_seconds,
      language_code,
      recorded_at
    ) values (
      ${input.lectureId}::uuid,
      ${input.courseId}::uuid,
      ${userId}::uuid,
      ${input.title},
      'recorded',
      'processing',
      ${input.durationSeconds},
      'en',
      ${input.recordedAt}::timestamptz
    )
    on conflict (id) do update
    set
      course_id = excluded.course_id,
      created_by_user_id = excluded.created_by_user_id,
      title = excluded.title,
      source_type = excluded.source_type,
      status = excluded.status,
      duration_seconds = excluded.duration_seconds,
      language_code = excluded.language_code,
      recorded_at = excluded.recorded_at
  `;

  await db`
    insert into public.audio_files (
      id,
      lecture_id,
      uploaded_by_user_id,
      storage_provider,
      bucket_name,
      object_path,
      original_filename,
      mime_type,
      file_size_bytes,
      duration_seconds,
      sample_rate_hz,
      bitrate_kbps,
      is_primary,
      upload_status,
      uploaded_at
    ) values (
      ${input.audioFileId}::uuid,
      ${input.lectureId}::uuid,
      ${userId}::uuid,
      'gcs',
      ${AUDIO_BUCKET_NAME},
      ${objectPath},
      ${input.originalFilename},
      ${input.mimeType},
      ${input.fileSizeBytes},
      ${input.durationSeconds},
      44100,
      128,
      true,
      'uploaded',
      timezone('utc', now())
    )
    on conflict (id) do update
    set
      lecture_id = excluded.lecture_id,
      uploaded_by_user_id = excluded.uploaded_by_user_id,
      storage_provider = excluded.storage_provider,
      bucket_name = excluded.bucket_name,
      object_path = excluded.object_path,
      original_filename = excluded.original_filename,
      mime_type = excluded.mime_type,
      file_size_bytes = excluded.file_size_bytes,
      duration_seconds = excluded.duration_seconds,
      sample_rate_hz = excluded.sample_rate_hz,
      bitrate_kbps = excluded.bitrate_kbps,
      is_primary = excluded.is_primary,
      upload_status = excluded.upload_status,
      uploaded_at = excluded.uploaded_at
  `;

  const existingProcessingJobRows = await db<{ id: string; job_type: string; status: string }[]>`
    select id, job_type, status
    from public.processing_jobs
    where lecture_id = ${input.lectureId}::uuid
      and job_type = 'transcription'
      and status = 'queued'
    limit 1
  `;

  const processingJob =
    existingProcessingJobRows[0] ??
    (
      await db<{ id: string; job_type: string; status: string }[]>`
        insert into public.processing_jobs (
          lecture_id,
          triggered_by_user_id,
          job_type,
          provider_name,
          status,
          input_payload,
          output_payload
        ) values (
          ${input.lectureId}::uuid,
          ${userId}::uuid,
          'transcription',
          ${PLACEHOLDER_PROCESSOR_NAME},
          'queued',
          ${JSON.stringify({
            bucketName: AUDIO_BUCKET_NAME,
            objectPath,
            audioFileId: input.audioFileId,
          })}::jsonb,
          ${JSON.stringify({
            placeholder: true,
            message: 'Processing service not implemented yet.',
          })}::jsonb
        )
        returning id, job_type, status
      `
    )[0];

  if (!processingJob) {
    throw new HttpError(500, 'Failed to create placeholder processing job.');
  }

  return {
    lecture: {
      id: input.lectureId,
      status: 'processing',
    },
    audioFile: {
      id: input.audioFileId,
      bucketName: AUDIO_BUCKET_NAME,
      objectPath,
      uploadStatus: 'uploaded',
    },
    processingJob: {
      id: processingJob.id,
      jobType: processingJob.job_type,
      status: processingJob.status,
    },
  };
}

export async function listLectureRecordingsForUser(userId: string, courseId?: string) {
  const db = getDb();

  if (courseId) {
    await assertUserCanViewCourse(userId, courseId);
  }

  const rows = await db<DbLectureRecordingRow[]>`
    select
      l.id as lecture_id,
      l.course_id,
      l.created_by_user_id,
      l.title,
      l.status,
      l.duration_seconds as lecture_duration_seconds,
      l.recorded_at,
      l.created_at as lecture_created_at,
      l.updated_at as lecture_updated_at,
      af.id as audio_file_id,
      af.uploaded_by_user_id,
      af.bucket_name,
      af.object_path,
      af.original_filename,
      af.mime_type,
      af.file_size_bytes,
      af.duration_seconds as audio_duration_seconds,
      af.upload_status,
      af.uploaded_at,
      af.created_at as audio_created_at
    from public.lectures l
    left join lateral (
      select
        id,
        uploaded_by_user_id,
        bucket_name,
        object_path,
        original_filename,
        mime_type,
        file_size_bytes,
        duration_seconds,
        upload_status,
        uploaded_at,
        created_at
      from public.audio_files
      where lecture_id = l.id
      order by is_primary desc, uploaded_at desc nulls last, created_at desc nulls last
      limit 1
    ) af on true
    where (${courseId ?? null}::uuid is null or l.course_id = ${courseId ?? null}::uuid)
      and exists (
        select 1
        from public.courses c
        where c.id = l.course_id
          and c.owner_user_id = ${userId}::uuid
      )
    order by coalesce(l.recorded_at, l.created_at) desc nulls last
  `;

  return rows.map(mapLectureRecordingRow);
}

async function assertUserCanManageCourse(userId: string, courseId: string) {
  const db = getDb();
  const rows = await db<{ id: string }[]>`
    select c.id
    from public.courses c
    where c.id = ${courseId}::uuid
      and c.owner_user_id = ${userId}::uuid
    limit 1
  `;

  if (rows.length === 0) {
    throw new HttpError(403, 'You do not have permission to upload recordings for this course.');
  }
}

async function assertUserCanViewCourse(userId: string, courseId: string) {
  const db = getDb();
  const rows = await db<{ id: string }[]>`
    select c.id
    from public.courses c
    where c.id = ${courseId}::uuid
      and c.owner_user_id = ${userId}::uuid
    limit 1
  `;

  if (rows.length === 0) {
    throw new HttpError(403, 'You do not have permission to view lectures for this course.');
  }
}

type DbLectureRecordingRow = {
  lecture_id: string;
  course_id: string;
  created_by_user_id: string | null;
  title: string;
  status: string;
  lecture_duration_seconds: number | null;
  recorded_at: string | null;
  lecture_created_at: string | null;
  lecture_updated_at: string | null;
  audio_file_id: string | null;
  uploaded_by_user_id: string | null;
  bucket_name: string | null;
  object_path: string | null;
  original_filename: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  audio_duration_seconds: number | null;
  upload_status: string | null;
  uploaded_at: string | null;
  audio_created_at: string | null;
};

function mapLectureRecordingRow(row: DbLectureRecordingRow): LectureRecordingListItem {
  return {
    lecture: {
      id: row.lecture_id,
      courseId: row.course_id,
      createdByUserId: row.created_by_user_id,
      title: row.title,
      status: row.status,
      durationSeconds: row.lecture_duration_seconds,
      recordedAt: row.recorded_at,
      createdAt: row.lecture_created_at,
      updatedAt: row.lecture_updated_at,
    },
    audioFile: row.audio_file_id
      ? {
          id: row.audio_file_id,
          uploadedByUserId: row.uploaded_by_user_id,
          bucketName: row.bucket_name,
          objectPath: row.object_path,
          originalFilename: row.original_filename,
          mimeType: row.mime_type,
          fileSizeBytes: row.file_size_bytes,
          durationSeconds: row.audio_duration_seconds,
          uploadStatus: row.upload_status ?? 'pending',
          uploadedAt: row.uploaded_at,
          createdAt: row.audio_created_at,
        }
      : null,
  };
}

function buildObjectPath(userId: string, courseId: string, lectureId: string, filename: string) {
  return `${userId}/${courseId}/${lectureId}/${Date.now()}-${sanitizeFilename(filename)}`;
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]+/g, '-');
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

function readUuid(value: unknown, fieldName: string) {
  const normalized = readRequiredString(value, fieldName);

  if (!/^[0-9a-fA-F-]{36}$/.test(normalized)) {
    throw new HttpError(400, `${fieldName} must be a valid UUID.`);
  }

  return normalized;
}

function readIsoDate(value: unknown, fieldName: string) {
  const normalized = readRequiredString(value, fieldName);

  if (Number.isNaN(Date.parse(normalized))) {
    throw new HttpError(400, `${fieldName} must be a valid ISO date.`);
  }

  return normalized;
}

function readPositiveInteger(value: unknown, fieldName: string) {
  const normalized = typeof value === 'number' ? value : Number(value);

  if (!Number.isInteger(normalized) || normalized < 0) {
    throw new HttpError(400, `${fieldName} must be a non-negative integer.`);
  }

  return normalized;
}
