import { Directory, File, Paths } from 'expo-file-system';
import type { DocumentPickerAsset } from 'expo-document-picker';
import type { AuthUser } from './auth-api';
import type { UploadedCourseFileResponse } from './course-files-api';
import { initializeLocalDatabase, runSerializedLocalWrite } from './local-db';
import { uploadCourseFile } from './course-files-api';

type CourseFileUploadStatus = 'pending' | 'uploaded' | 'failed';
type CourseFileQueueStatus = 'queued' | 'uploading' | 'uploaded' | 'failed';
type CourseFileSyncStatus = 'synced' | 'pending_pull' | 'pending_push' | 'conflict';
export type CourseFileRelationType =
  | 'lecture_file'
  | 'module_file'
  | 'chapter_file'
  | 'notes'
  | 'other';

export type LocalCourseFileRecord = {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  relationType: CourseFileRelationType;
  sourceType: 'file';
  localUri: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  fileExtension: string | null;
  uploadStatus: CourseFileUploadStatus;
  queueStatus: CourseFileQueueStatus | null;
  syncStatus: CourseFileSyncStatus;
  bucketName: string | null;
  objectPath: string | null;
  createdAt: string | null;
  lastError: string | null;
};

type SaveCourseFileInput = {
  user: AuthUser;
  accessToken: string | null;
  courseId: string;
  asset: DocumentPickerAsset;
  relationType: CourseFileRelationType;
  description: string;
};

type PreparedCourseFile = {
  id: string;
  title: string;
  description: string;
  relationType: CourseFileRelationType;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  fileExtension: string | null;
  localUri: string;
  createdAt: string;
  bucketName: string;
  objectPath: string;
};

export async function saveCourseFile(input: SaveCourseFileInput) {
  const prepared = prepareCourseFileForStorage(input);
  await insertLocalCourseFile(input, prepared);

  try {
    await syncCourseFileToApi(input, prepared);
    await markCourseFileSyncSucceeded(prepared);
  } catch (error) {
    await markCourseFileSyncFailed(
      prepared,
      error instanceof Error ? error.message : 'Failed to sync course file to API.'
    );
  }

  return getCourseFile(prepared.id);
}

export async function listCourseFilesForCourse(courseId: string) {
  const db = await initializeLocalDatabase();
  const rows = await db.getAllAsync<CourseFileRow>(
    `${COURSE_FILE_SELECT_SQL}
     WHERE cached_course_files.course_id = ?
     ORDER BY COALESCE(cached_course_files.created_at, local_upload_queue.created_at) DESC`,
    [courseId]
  );

  return rows.map(mapCourseFileRow);
}

export async function getCourseFile(courseFileId: string) {
  const db = await initializeLocalDatabase();
  const row = await db.getFirstAsync<CourseFileRow>(
    `${COURSE_FILE_SELECT_SQL}
     WHERE cached_course_files.id = ?
     LIMIT 1`,
    [courseFileId]
  );

  return row ? mapCourseFileRow(row) : null;
}

export async function upsertRemoteCourseFiles(
  user: AuthUser,
  files: UploadedCourseFileResponse['file'][]
) {
  await runSerializedLocalWrite(async (db) => {
    await db.withTransactionAsync(async () => {
      await ensureLocalUser(db, user);

      for (const file of files) {
        await db.runAsync(
          `INSERT INTO cached_course_files (
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
             updated_at,
             sync_status,
             dirty_fields_json,
             last_synced_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, CURRENT_TIMESTAMP)
           ON CONFLICT(id) DO UPDATE SET
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
             uploaded_at = excluded.uploaded_at,
             created_at = excluded.created_at,
             updated_at = excluded.updated_at,
             sync_status = 'synced',
             dirty_fields_json = excluded.dirty_fields_json,
             last_synced_at = CURRENT_TIMESTAMP`,
          [
            file.id,
            file.courseId,
            file.uploadedByUserId,
            file.title,
            file.description,
            file.relationType,
            file.sourceType,
            file.storageProvider,
            file.bucketName,
            file.objectPath,
            file.originalFilename,
            file.mimeType,
            file.fileSizeBytes,
            file.fileExtension,
            file.uploadStatus,
            file.uploadedAt,
            file.createdAt,
            file.updatedAt,
            JSON.stringify([]),
          ]
        );
      }
    });
  });
}

function prepareCourseFileForStorage(input: SaveCourseFileInput): PreparedCourseFile {
  const id = createUuid();
  const createdAt = new Date().toISOString();
  const originalFilename = input.asset.name ?? `course-file-${id}`;
  const normalizedFilename = sanitizeFilename(originalFilename);
  const extension = normalizeExtension(normalizedFilename);
  const mimeType = input.asset.mimeType ?? inferMimeType(extension);
  const title = buildTitleFromFilename(normalizedFilename);
  const courseFilesDirectory = new Directory(Paths.document, 'course-files', input.user.id, input.courseId, id);

  courseFilesDirectory.create({
    idempotent: true,
    intermediates: true,
  });

  const sourceFile = new File(input.asset.uri);
  const destinationFile = new File(courseFilesDirectory, normalizedFilename);
  sourceFile.copy(destinationFile);

  const fileInfo = destinationFile.info();

  return {
    id,
    title,
    description: input.description.trim(),
    relationType: input.relationType,
    originalFilename: normalizedFilename,
    mimeType,
    fileSizeBytes: fileInfo.size ?? input.asset.size ?? 0,
    fileExtension: extension ? extension.slice(1) : null,
    localUri: destinationFile.uri,
    createdAt,
    bucketName: '',
    objectPath: '',
  };
}

async function insertLocalCourseFile(input: SaveCourseFileInput, prepared: PreparedCourseFile) {
  await runSerializedLocalWrite(async (db) => {
    await db.withTransactionAsync(async () => {
      await ensureLocalUser(db, input.user);

      await db.runAsync(
        `INSERT INTO cached_course_files (
           id,
           course_id,
           uploaded_by_user_id,
           title,
           description,
           relation_type,
           source_type,
           original_filename,
           mime_type,
           file_size_bytes,
           file_extension,
           upload_status,
           created_at,
           updated_at,
           sync_status,
           dirty_fields_json,
           last_synced_at
         ) VALUES (?, ?, ?, ?, ?, ?, 'file', ?, ?, ?, ?, 'pending', ?, ?, 'pending_push', ?, CURRENT_TIMESTAMP)`,
        [
          prepared.id,
          input.courseId,
          input.user.id,
          prepared.title,
          prepared.description.length > 0 ? prepared.description : null,
          prepared.relationType,
          prepared.originalFilename,
          prepared.mimeType,
          prepared.fileSizeBytes,
          prepared.fileExtension,
          prepared.createdAt,
          prepared.createdAt,
          JSON.stringify(['title', 'description', 'upload_status']),
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
         ) VALUES (?, 'course_file', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [prepared.id, prepared.id, prepared.localUri, prepared.mimeType, prepared.fileSizeBytes]
      );

      await db.runAsync(
        `INSERT INTO local_upload_queue (
           id,
           upload_type,
           course_id,
           local_uri,
           original_filename,
           mime_type,
           file_size_bytes,
           status,
           created_at,
           updated_at
         ) VALUES (?, 'course_file', ?, ?, ?, ?, ?, 'uploading', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          prepared.id,
          input.courseId,
          prepared.localUri,
          prepared.originalFilename,
          prepared.mimeType,
          prepared.fileSizeBytes,
        ]
      );
    });
  });
}

async function syncCourseFileToApi(input: SaveCourseFileInput, prepared: PreparedCourseFile) {
  if (!input.accessToken) {
    throw new Error('Your session expired before the file could upload.');
  }

  const localFile = new File(prepared.localUri);
  const result = await uploadCourseFile(
    input.courseId,
    {
      courseFileId: prepared.id,
      title: prepared.title,
      description: prepared.description,
      relationType: prepared.relationType,
      originalFilename: prepared.originalFilename,
      mimeType: prepared.mimeType,
      fileSizeBytes: prepared.fileSizeBytes,
      fileBase64: await localFile.base64(),
    },
    input.accessToken
  );

  prepared.bucketName = result.file.bucketName ?? '';
  prepared.objectPath = result.file.objectPath ?? '';
}

async function markCourseFileSyncSucceeded(prepared: PreparedCourseFile) {
  await runSerializedLocalWrite(async (db) => {
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE cached_course_files
         SET storage_provider = 'gcs',
             bucket_name = ?,
             object_path = ?,
             upload_status = 'uploaded',
             uploaded_at = ?,
             sync_status = 'synced',
             dirty_fields_json = ?,
             last_synced_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [prepared.bucketName, prepared.objectPath, prepared.createdAt, JSON.stringify([]), prepared.id]
      );

      await db.runAsync(
        `UPDATE downloaded_assets
         SET remote_uri = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE owner_type = 'course_file' AND owner_id = ?`,
        [`api-upload://${prepared.bucketName}/${prepared.objectPath}`, prepared.id]
      );

      await db.runAsync(
        `UPDATE local_upload_queue
         SET status = 'uploaded',
             remote_course_file_id = ?,
             last_error = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [prepared.id, prepared.id]
      );
    });
  });
}

async function markCourseFileSyncFailed(prepared: PreparedCourseFile, errorMessage: string) {
  await runSerializedLocalWrite(async (db) => {
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE cached_course_files
         SET upload_status = 'failed',
             sync_status = 'pending_push',
             dirty_fields_json = ?,
             last_synced_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [JSON.stringify(['upload_status']), prepared.id]
      );

      await db.runAsync(
        `UPDATE local_upload_queue
         SET status = 'failed',
             last_error = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [errorMessage, prepared.id]
      );
    });
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

type CourseFileRow = {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  relation_type: CourseFileRelationType;
  source_type: 'file';
  local_uri: string | null;
  original_filename: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  file_extension: string | null;
  upload_status: CourseFileUploadStatus | null;
  queue_status: CourseFileQueueStatus | null;
  sync_status: CourseFileSyncStatus;
  bucket_name: string | null;
  object_path: string | null;
  created_at: string | null;
  last_error: string | null;
};

const COURSE_FILE_SELECT_SQL = `
  SELECT
    cached_course_files.id AS id,
    cached_course_files.course_id AS course_id,
    cached_course_files.title AS title,
    cached_course_files.description AS description,
    cached_course_files.relation_type AS relation_type,
    cached_course_files.source_type AS source_type,
    downloaded_assets.local_uri AS local_uri,
    cached_course_files.original_filename AS original_filename,
    cached_course_files.mime_type AS mime_type,
    cached_course_files.file_size_bytes AS file_size_bytes,
    cached_course_files.file_extension AS file_extension,
    cached_course_files.upload_status AS upload_status,
    local_upload_queue.status AS queue_status,
    cached_course_files.sync_status AS sync_status,
    cached_course_files.bucket_name AS bucket_name,
    cached_course_files.object_path AS object_path,
    cached_course_files.created_at AS created_at,
    local_upload_queue.last_error AS last_error
  FROM cached_course_files
  LEFT JOIN downloaded_assets
    ON downloaded_assets.owner_type = 'course_file'
   AND downloaded_assets.owner_id = cached_course_files.id
  LEFT JOIN local_upload_queue
    ON local_upload_queue.id = cached_course_files.id
   AND local_upload_queue.upload_type = 'course_file'
`;

function mapCourseFileRow(row: CourseFileRow): LocalCourseFileRecord {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    description: row.description,
    relationType: row.relation_type,
    sourceType: row.source_type,
    localUri: row.local_uri ?? '',
    originalFilename: row.original_filename ?? row.title,
    mimeType: row.mime_type ?? 'application/octet-stream',
    fileSizeBytes: row.file_size_bytes ?? 0,
    fileExtension: row.file_extension,
    uploadStatus: row.upload_status ?? 'pending',
    queueStatus: row.queue_status,
    syncStatus: row.sync_status,
    bucketName: row.bucket_name,
    objectPath: row.object_path,
    createdAt: row.created_at,
    lastError: row.last_error,
  };
}

function buildTitleFromFilename(filename: string) {
  return filename.replace(/\.[^.]+$/, '').trim() || filename;
}

function normalizeExtension(filename: string) {
  const match = filename.match(/\.[a-z0-9]+$/i);
  return match ? match[0].toLowerCase() : null;
}

function inferMimeType(extension: string | null) {
  switch (extension) {
    case '.pdf':
      return 'application/pdf';
    case '.doc':
      return 'application/msword';
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    default:
      return 'application/octet-stream';
  }
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]+/g, '-');
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
