import { Directory, File, Paths } from 'expo-file-system';
import type { AuthUser } from './auth-api';
import { NO_CLASS_COURSE_ID } from './courses-repository';
import { initializeLocalDatabase, runSerializedLocalWrite } from './local-db';
import { uploadLectureRecording, type RemoteLectureRecordingRecord } from './recordings-api';

type RecordingQueueStatus = 'queued' | 'uploading' | 'uploaded' | 'failed';
type RecordingUploadStatus = 'pending' | 'uploaded' | 'failed';
type RecordingSyncStatus = 'synced' | 'pending_pull' | 'pending_push' | 'conflict';

export type LocalLectureRecordingRecord = {
  lectureId: string;
  courseId: string;
  title: string;
  recordedAt: string | null;
  durationSeconds: number;
  localUri: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  uploadStatus: RecordingUploadStatus;
  queueStatus: RecordingQueueStatus | null;
  syncStatus: RecordingSyncStatus;
  bucketName: string | null;
  objectPath: string | null;
  lastError: string | null;
};

type SaveRecordedLectureInput = {
  user: AuthUser;
  accessToken: string | null;
  courseId: string;
  courseName: string;
  recordingUri: string;
  durationMillis: number;
};

type PreparedRecording = {
  lectureId: string;
  audioFileId: string;
  queueId: string;
  title: string;
  recordedAt: string;
  durationSeconds: number;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  localUri: string;
  bucketName: string;
  objectPath: string;
};

export async function saveRecordedLecture(input: SaveRecordedLectureInput) {
  if (input.courseId === NO_CLASS_COURSE_ID) {
    throw new Error('Select a course before saving a recording.');
  }

  const prepared = prepareRecordingForStorage(input);
  await insertLocalRecording(input, prepared);

  try {
    await syncRecordingToApi(input, prepared);
    await markRecordingSyncSucceeded(prepared);
  } catch (error) {
    await markRecordingSyncFailed(
      prepared,
      error instanceof Error ? error.message : 'Failed to sync recording to Supabase.'
    );
  }

  return getLectureRecording(prepared.lectureId);
}

export async function getLectureRecording(lectureId: string) {
  const db = await initializeLocalDatabase();
  const row = await db.getFirstAsync<RecordingRow>(
    `${RECORDING_SELECT_SQL}
     WHERE lectures.id = ?
     ORDER BY local_upload_queue.created_at DESC
     LIMIT 1`,
    [lectureId]
  );

  return row ? mapRecordingRow(row) : null;
}

export async function getLatestLectureRecording() {
  const db = await initializeLocalDatabase();
  const row = await db.getFirstAsync<RecordingRow>(
    `${RECORDING_SELECT_SQL}
     ORDER BY COALESCE(lectures.recorded_at, lectures.created_at) DESC
     LIMIT 1`
  );

  return row ? mapRecordingRow(row) : null;
}

export async function listLectureRecordingsForCourse(courseId: string) {
  const db = await initializeLocalDatabase();
  const rows = await db.getAllAsync<RecordingRow>(
    `${RECORDING_SELECT_SQL}
     WHERE lectures.course_id = ?
     ORDER BY COALESCE(lectures.recorded_at, lectures.created_at) DESC`,
    [courseId]
  );

  return rows.map(mapRecordingRow);
}

export async function upsertRemoteLectureRecordings(
  user: AuthUser,
  recordings: RemoteLectureRecordingRecord[]
) {
  await runSerializedLocalWrite(async (db) => {
    await db.withTransactionAsync(async () => {
      await ensureLocalUser(db, user);

      for (const recording of recordings) {
        await db.runAsync(
          `INSERT INTO cached_lectures (
             id,
             course_id,
             created_by_user_id,
             title,
             source_type,
             status,
             duration_seconds,
             language_code,
             recorded_at,
             created_at,
             updated_at,
             sync_status,
             dirty_fields_json,
             last_synced_at
           ) VALUES (?, ?, ?, ?, 'recorded', ?, ?, 'en', ?, ?, ?, 'synced', ?, CURRENT_TIMESTAMP)
           ON CONFLICT(id) DO UPDATE SET
             course_id = excluded.course_id,
             created_by_user_id = excluded.created_by_user_id,
             title = excluded.title,
             source_type = excluded.source_type,
             status = excluded.status,
             duration_seconds = excluded.duration_seconds,
             language_code = excluded.language_code,
             recorded_at = excluded.recorded_at,
             created_at = excluded.created_at,
             updated_at = excluded.updated_at,
             sync_status = 'synced',
             dirty_fields_json = excluded.dirty_fields_json,
             last_synced_at = CURRENT_TIMESTAMP`,
          [
            recording.lecture.id,
            recording.lecture.courseId,
            recording.lecture.createdByUserId,
            recording.lecture.title,
            recording.lecture.status,
            recording.lecture.durationSeconds,
            recording.lecture.recordedAt,
            recording.lecture.createdAt,
            recording.lecture.updatedAt,
            JSON.stringify([]),
          ]
        );

        if (!recording.audioFile) {
          continue;
        }

        await db.runAsync(
          `INSERT INTO cached_audio_files (
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
             uploaded_at,
             created_at,
             sync_status,
             dirty_fields_json,
             last_synced_at
           ) VALUES (?, ?, ?, 'gcs', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 'synced', ?, CURRENT_TIMESTAMP)
           ON CONFLICT(id) DO UPDATE SET
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
             uploaded_at = excluded.uploaded_at,
             created_at = excluded.created_at,
             sync_status = 'synced',
             dirty_fields_json = excluded.dirty_fields_json,
             last_synced_at = CURRENT_TIMESTAMP`,
          [
            recording.audioFile.id,
            recording.lecture.id,
            recording.audioFile.uploadedByUserId,
            recording.audioFile.bucketName,
            recording.audioFile.objectPath,
            recording.audioFile.originalFilename,
            recording.audioFile.mimeType,
            recording.audioFile.fileSizeBytes,
            recording.audioFile.durationSeconds,
            44100,
            128,
            recording.audioFile.uploadStatus,
            recording.audioFile.uploadedAt,
            recording.audioFile.createdAt,
            JSON.stringify([]),
          ]
        );
      }
    });
  });
}

async function insertLocalRecording(input: SaveRecordedLectureInput, prepared: PreparedRecording) {
  await runSerializedLocalWrite(async (db) => {
    await db.withTransactionAsync(async () => {
      await ensureLocalUser(db, input.user);

      await db.runAsync(
        `INSERT INTO cached_lectures (
           id,
           course_id,
           created_by_user_id,
           title,
           source_type,
           status,
           duration_seconds,
           language_code,
           recorded_at,
           created_at,
           updated_at,
           sync_status,
           dirty_fields_json,
           last_synced_at
         ) VALUES (?, ?, ?, ?, 'recorded', 'uploading', ?, 'en', ?, ?, ?, 'pending_push', ?, CURRENT_TIMESTAMP)`,
        [
          prepared.lectureId,
          input.courseId,
          input.user.id,
          prepared.title,
          prepared.durationSeconds,
          prepared.recordedAt,
          prepared.recordedAt,
          prepared.recordedAt,
          JSON.stringify(['title', 'status', 'duration_seconds', 'recorded_at']),
        ]
      );

      await db.runAsync(
        `INSERT INTO cached_audio_files (
           id,
           lecture_id,
           uploaded_by_user_id,
           original_filename,
           mime_type,
           file_size_bytes,
           duration_seconds,
           sample_rate_hz,
           bitrate_kbps,
           is_primary,
           upload_status,
           created_at,
           sync_status,
           dirty_fields_json,
           last_synced_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'pending', ?, 'pending_push', ?, CURRENT_TIMESTAMP)`,
        [
          prepared.audioFileId,
          prepared.lectureId,
          input.user.id,
          prepared.originalFilename,
          prepared.mimeType,
          prepared.fileSizeBytes,
          prepared.durationSeconds,
          44100,
          128,
          prepared.recordedAt,
          JSON.stringify(['upload_status', 'file_size_bytes']),
        ]
      );

      await db.runAsync(
        `INSERT INTO downloaded_assets (
           id,
           owner_type,
           owner_id,
           local_uri,
           mime_type,
           byte_size,
           created_at,
           updated_at
         ) VALUES (?, 'audio_file', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [prepared.audioFileId, prepared.audioFileId, prepared.localUri, prepared.mimeType, prepared.fileSizeBytes]
      );

      await db.runAsync(
        `INSERT INTO local_upload_queue (
           id,
           lecture_id,
           local_uri,
           original_filename,
           mime_type,
           file_size_bytes,
           status,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, 'uploading', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          prepared.queueId,
          prepared.lectureId,
          prepared.localUri,
          prepared.originalFilename,
          prepared.mimeType,
          prepared.fileSizeBytes,
        ]
      );
    });
  });
}

async function syncRecordingToApi(input: SaveRecordedLectureInput, prepared: PreparedRecording) {
  if (!input.accessToken) {
    throw new Error('Your session expired before the recording could upload.');
  }

  const recordingFile = new File(prepared.localUri);
  const uploadResult = await uploadLectureRecording(
    {
      lectureId: prepared.lectureId,
      audioFileId: prepared.audioFileId,
      courseId: input.courseId,
      title: prepared.title,
      recordedAt: prepared.recordedAt,
      durationSeconds: prepared.durationSeconds,
      originalFilename: prepared.originalFilename,
      mimeType: prepared.mimeType,
      fileSizeBytes: prepared.fileSizeBytes,
      audioBase64: await recordingFile.base64(),
    },
    input.accessToken
  );

  prepared.bucketName = uploadResult.audioFile.bucketName;
  prepared.objectPath = uploadResult.audioFile.objectPath;
}

async function markRecordingSyncSucceeded(prepared: PreparedRecording) {
  await runSerializedLocalWrite(async (db) => {
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE cached_lectures
         SET status = 'processing',
             sync_status = 'synced',
             dirty_fields_json = ?,
             last_synced_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [JSON.stringify([]), prepared.lectureId]
      );

      await db.runAsync(
        `UPDATE cached_audio_files
         SET storage_provider = 'gcs',
             bucket_name = ?,
             object_path = ?,
             upload_status = 'uploaded',
             uploaded_at = ?,
             sync_status = 'synced',
             dirty_fields_json = ?,
             last_synced_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          prepared.bucketName,
          prepared.objectPath,
          prepared.recordedAt,
          JSON.stringify([]),
          prepared.audioFileId,
        ]
      );

      await db.runAsync(
        `UPDATE downloaded_assets
         SET remote_uri = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE owner_type = 'audio_file' AND owner_id = ?`,
        [`api-upload://${prepared.bucketName}/${prepared.objectPath}`, prepared.audioFileId]
      );

      await db.runAsync(
        `UPDATE local_upload_queue
         SET status = 'uploaded',
             remote_audio_file_id = ?,
             last_error = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [prepared.audioFileId, prepared.queueId]
      );
    });
  });
}

async function markRecordingSyncFailed(prepared: PreparedRecording, errorMessage: string) {
  await runSerializedLocalWrite(async (db) => {
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE cached_lectures
         SET sync_status = 'pending_push',
             dirty_fields_json = ?,
             last_synced_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [JSON.stringify(['status']), prepared.lectureId]
      );

      await db.runAsync(
        `UPDATE cached_audio_files
         SET upload_status = 'failed',
             sync_status = 'pending_push',
             dirty_fields_json = ?,
             last_synced_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [JSON.stringify(['upload_status']), prepared.audioFileId]
      );

      await db.runAsync(
        `UPDATE local_upload_queue
         SET status = 'failed',
             last_error = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [errorMessage, prepared.queueId]
      );
    });
  });
}

function prepareRecordingForStorage(input: SaveRecordedLectureInput): PreparedRecording {
  const lectureId = createUuid();
  const audioFileId = createUuid();
  const queueId = createUuid();
  const recordedAt = new Date().toISOString();
  const durationSeconds = Math.max(1, Math.round(input.durationMillis / 1000));
  const extension = normalizeExtension(input.recordingUri);
  const originalFilename = `lecture-recording${extension}`;
  const title = buildLectureTitle(input.courseName, recordedAt);
  const recordingsDirectory = new Directory(Paths.document, 'recordings', input.user.id, lectureId);

  recordingsDirectory.create({
    idempotent: true,
    intermediates: true,
  });

  const sourceFile = new File(input.recordingUri);
  const destinationFile = new File(recordingsDirectory, originalFilename);
  sourceFile.copy(destinationFile);

  const fileInfo = destinationFile.info();
  const mimeType = extension === '.wav' ? 'audio/wav' : extension === '.caf' ? 'audio/x-caf' : 'audio/mp4';

  return {
    lectureId,
    audioFileId,
    queueId,
    title,
    recordedAt,
    durationSeconds,
    originalFilename,
    mimeType,
    fileSizeBytes: fileInfo.size ?? 0,
    localUri: destinationFile.uri,
    bucketName: '',
    objectPath: '',
  };
}

function buildLectureTitle(courseName: string, recordedAt: string) {
  const stamp = new Date(recordedAt);
  const date = `${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, '0')}-${String(
    stamp.getDate()
  ).padStart(2, '0')}`;
  const time = `${String(stamp.getHours()).padStart(2, '0')}:${String(stamp.getMinutes()).padStart(2, '0')}`;
  return `${courseName} ${date} ${time}`;
}

function normalizeExtension(recordingUri: string) {
  const match = recordingUri.match(/\.[a-z0-9]+(?:$|\?)/i)?.[0]?.replace(/\?$/, '');
  return match ? match.toLowerCase() : '.m4a';
}

function createUuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
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

type RecordingRow = {
  lecture_id: string;
  course_id: string;
  title: string;
  recorded_at: string | null;
  duration_seconds: number | null;
  lecture_sync_status: RecordingSyncStatus;
  local_uri: string | null;
  original_filename: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  upload_status: RecordingUploadStatus | null;
  queue_status: RecordingQueueStatus | null;
  bucket_name: string | null;
  object_path: string | null;
  last_error: string | null;
};

const RECORDING_SELECT_SQL = `
  SELECT
    lectures.id AS lecture_id,
    lectures.course_id AS course_id,
    lectures.title AS title,
    lectures.recorded_at AS recorded_at,
    lectures.duration_seconds AS duration_seconds,
    lectures.sync_status AS lecture_sync_status,
    COALESCE(downloaded_assets.local_uri, local_upload_queue.local_uri) AS local_uri,
    cached_audio_files.original_filename AS original_filename,
    cached_audio_files.mime_type AS mime_type,
    cached_audio_files.file_size_bytes AS file_size_bytes,
    cached_audio_files.upload_status AS upload_status,
    local_upload_queue.status AS queue_status,
    cached_audio_files.bucket_name AS bucket_name,
    cached_audio_files.object_path AS object_path,
    local_upload_queue.last_error AS last_error
  FROM cached_lectures lectures
  LEFT JOIN cached_audio_files
    ON cached_audio_files.lecture_id = lectures.id
   AND cached_audio_files.is_primary = 1
  LEFT JOIN downloaded_assets
    ON downloaded_assets.owner_type = 'audio_file'
   AND downloaded_assets.owner_id = cached_audio_files.id
  LEFT JOIN local_upload_queue
    ON local_upload_queue.lecture_id = lectures.id
`;

function mapRecordingRow(row: RecordingRow): LocalLectureRecordingRecord {
  return {
    lectureId: row.lecture_id,
    courseId: row.course_id,
    title: row.title,
    recordedAt: row.recorded_at,
    durationSeconds: row.duration_seconds ?? 0,
    localUri: row.local_uri ?? '',
    originalFilename: row.original_filename ?? 'lecture-recording.m4a',
    mimeType: row.mime_type ?? 'audio/mp4',
    fileSizeBytes: row.file_size_bytes ?? 0,
    uploadStatus: row.upload_status ?? 'pending',
    queueStatus: row.queue_status,
    syncStatus: row.lecture_sync_status,
    bucketName: row.bucket_name,
    objectPath: row.object_path,
    lastError: row.last_error,
  };
}
