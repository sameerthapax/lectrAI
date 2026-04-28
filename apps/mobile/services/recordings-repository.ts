import type { DocumentPickerAsset } from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { createAudioPlayer } from 'expo-audio';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { AuthUser } from './auth-api';
import { NO_CLASS_COURSE_ID } from './courses-repository';
import { initializeLocalDatabase, runSerializedLocalWrite } from './local-db';
import {
  downloadLectureAudio,
  processLectureTranscription,
  uploadLectureChunk,
  uploadLectureRecording,
  type RemoteLectureChunkUploadResult,
  type RemoteLectureRecordingRecord,
  type RemoteLectureTranscript,
} from './recordings-api';

type RecordingQueueStatus = 'queued' | 'uploading' | 'uploaded' | 'failed';
type RecordingUploadStatus = 'pending' | 'uploaded' | 'failed';
type RecordingSyncStatus = 'synced' | 'pending_pull' | 'pending_push' | 'conflict';

export type LocalLectureRecordingRecord = {
  lectureId: string;
  audioFileId: string | null;
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
  transcript: LocalLectureTranscript | null;
};

export type LocalLectureTranscriptSegment = {
  id: string;
  segmentIndex: number;
  startTimeSeconds: number | null;
  endTimeSeconds: number | null;
  rawText: string | null;
  cleanedText: string | null;
  speakerLabel: string | null;
  confidenceScore: number | null;
  tokenCountEstimate: number | null;
  isKeyMoment: boolean;
  createdAt: string | null;
};

export type LocalLectureTranscript = {
  id: string;
  lectureId: string;
  sourceTranscriptId: string | null;
  sourceAudioFileId: string | null;
  processingJobId: string | null;
  transcriptionProvider: string | null;
  modelName: string | null;
  languageCode: string | null;
  fullText: string | null;
  confidenceAvg: number | null;
  totalSegments: number | null;
  totalTokensEstimate: number | null;
  status: string;
  generatedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  speakerMap: RemoteLectureTranscript['speakerMap'];
  processedPayload: unknown;
  segments: LocalLectureTranscriptSegment[];
};

type SaveRecordedLectureInput = {
  user: AuthUser;
  accessToken: string | null;
  courseId: string;
  courseName: string;
  durationMillis: number;
  recordingUri?: string;
  lectureTitle?: string;
  originalFilename?: string;
  onStatusChange?: (message: string) => void;
  recordingChunks?: Array<{
    localUri: string;
    durationMillis: number;
    chunkUploadMode?: 'transcribe' | 'assemble_only';
  }>;
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
  chunkFiles: PreparedRecordingChunk[];
  bucketName: string;
  objectPath: string;
};

type PreparedRecordingChunk = {
  chunkIndex: number;
  durationSeconds: number;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  localUri: string;
  chunkUploadMode: 'transcribe' | 'assemble_only';
};

const AUDIO_BUCKET_NAME_FALLBACK = 'lecture-audio';
const DIRECT_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;
const IMPORTED_UPLOAD_PART_BYTES = 24 * 1024 * 1024;

export async function saveRecordedLecture(input: SaveRecordedLectureInput) {
  if (input.courseId === NO_CLASS_COURSE_ID) {
    throw new Error('Select a course before saving a recording.');
  }

  const prepared = await prepareRecordingForStorage(input);
  input.onStatusChange?.('Saving lecture locally...');
  await insertLocalRecording(input, prepared);

  try {
    input.onStatusChange?.(
      prepared.chunkFiles.length > 1
        ? `Uploading ${prepared.chunkFiles.length} audio parts...`
        : 'Uploading lecture audio...'
    );
    const uploadResult = await syncRecordingToApi(input, prepared);
    await markRecordingSyncSucceeded(prepared);

    if (uploadResult?.transcript) {
      await runSerializedLocalWrite(async (db) => {
        await db.withTransactionAsync(async () => {
          await upsertRemoteTranscript(db, uploadResult.transcript);
        });
      });
    }
  } catch (error) {
    await markRecordingSyncFailed(
      prepared,
      error instanceof Error ? error.message : 'Failed to sync recording to Supabase.'
    );
  }

  return getLectureRecording(prepared.lectureId);
}

export async function saveImportedLectureAudio(input: {
  user: AuthUser;
  accessToken: string | null;
  courseId: string;
  courseName: string;
  asset: DocumentPickerAsset;
  lectureTitle?: string;
  onStatusChange?: (message: string) => void;
}) {
  const sourceFile = new File(input.asset.uri);
  const sourceInfo = sourceFile.info();
  const originalFilename = sanitizeFilename(input.asset.name ?? 'lecture-audio.m4a');
  const fileSizeBytes = sourceInfo.size ?? input.asset.size ?? 0;

  if (!isSupportedImportedAudio(input.asset, originalFilename)) {
    throw new Error('Choose an audio file to import as a stored lecture.');
  }

  input.onStatusChange?.('Reading audio metadata...');
  const durationMillis = await resolveImportedAudioDurationMillis(input.asset.uri);

  if (fileSizeBytes <= DIRECT_UPLOAD_MAX_BYTES) {
    return saveRecordedLecture({
      user: input.user,
      accessToken: input.accessToken,
      courseId: input.courseId,
      courseName: input.courseName,
      durationMillis,
      recordingUri: input.asset.uri,
      lectureTitle: input.lectureTitle,
      originalFilename,
      onStatusChange: input.onStatusChange,
    });
  }

  input.onStatusChange?.('Large file detected. Splitting audio for upload...');
  const chunkFiles = await createImportedLectureParts({
    recordingUri: input.asset.uri,
    originalFilename,
    durationMillis,
  });

  return saveRecordedLecture({
    user: input.user,
    accessToken: input.accessToken,
    courseId: input.courseId,
    courseName: input.courseName,
    durationMillis,
    lectureTitle: input.lectureTitle,
    originalFilename,
    onStatusChange: input.onStatusChange,
    recordingChunks: chunkFiles,
  });
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

  return row ? withTranscriptSegments(mapRecordingRow(row)) : null;
}

export async function getLatestLectureRecording() {
  const db = await initializeLocalDatabase();
  const row = await db.getFirstAsync<RecordingRow>(
    `${RECORDING_SELECT_SQL}
     ORDER BY COALESCE(lectures.recorded_at, lectures.created_at) DESC
     LIMIT 1`
  );

  return row ? withTranscriptSegments(mapRecordingRow(row)) : null;
}

export async function listLectureRecordingsForCourse(courseId: string) {
  const db = await initializeLocalDatabase();
  const rows = await db.getAllAsync<RecordingRow>(
    `${RECORDING_SELECT_SQL}
     WHERE lectures.course_id = ?
     ORDER BY COALESCE(lectures.recorded_at, lectures.created_at) DESC`,
    [courseId]
  );

  return Promise.all(rows.map((row) => withTranscriptSegments(mapRecordingRow(row))));
}

export async function upsertRemoteLectureRecordings(
  user: AuthUser,
  recordings: RemoteLectureRecordingRecord[],
  accessToken?: string
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
          if (recording.transcript) {
            await upsertRemoteTranscript(db, recording.transcript);
          }

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

        if (recording.transcript) {
          await upsertRemoteTranscript(db, recording.transcript);
        }
      }
    });
  });

  if (!accessToken) {
    return;
  }

  for (const recording of recordings) {
    try {
      await downloadRemoteLectureAudioForCache(user, recording, accessToken);
    } catch (error) {
      console.warn('Failed to download lecture audio for local cache.', {
        lectureId: recording.lecture.id,
        error,
      });
    }
  }
}

export async function processLectureTranscriptionForCache(lectureId: string, accessToken: string) {
  const response = await processLectureTranscription(lectureId, accessToken);

  await runSerializedLocalWrite(async (db) => {
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE cached_lectures
         SET status = ?,
             sync_status = 'synced',
             dirty_fields_json = ?,
             last_synced_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [response.lecture.status, JSON.stringify([]), lectureId]
      );

      await upsertRemoteTranscript(db, response.transcript);
    });
  });

  return getLectureRecording(lectureId);
}

export async function ensureLectureAudioDownloadedForCache(
  user: AuthUser,
  lectureId: string,
  accessToken: string
) {
  const recording = await getLectureRecording(lectureId);

  if (!recording || recording.localUri.length > 0) {
    return recording;
  }

  await downloadRemoteLectureAudioForCache(
    user,
    {
      lecture: {
        id: recording.lectureId,
        courseId: recording.courseId,
        createdByUserId: user.id,
        title: recording.title,
        status: 'ready',
        durationSeconds: recording.durationSeconds,
        recordedAt: recording.recordedAt,
        createdAt: null,
        updatedAt: null,
      },
      audioFile: {
        id: recording.audioFileId ?? recording.transcript?.sourceAudioFileId ?? '',
        uploadedByUserId: user.id,
        bucketName: recording.bucketName,
        objectPath: recording.objectPath,
        originalFilename: recording.originalFilename,
        mimeType: recording.mimeType,
        fileSizeBytes: recording.fileSizeBytes,
        durationSeconds: recording.durationSeconds,
        uploadStatus: recording.uploadStatus,
        uploadedAt: null,
        createdAt: null,
      },
      transcript: recording.transcript,
    },
    accessToken
  );

  return getLectureRecording(lectureId);
}

async function insertLocalRecording(input: SaveRecordedLectureInput, prepared: PreparedRecording) {
  await runSerializedLocalWrite(async (db) => {
    await db.withTransactionAsync(async () => {
      await ensureLocalUser(db, input.user);
      const lectureNumber = await readNextLectureNumber(db, input.courseId);
      const lectureDate = toLectureDate(prepared.recordedAt);

      await db.runAsync(
        `INSERT INTO cached_lectures (
           id,
           course_id,
           created_by_user_id,
           title,
           lecture_number,
           lecture_date,
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
         ) VALUES (?, ?, ?, ?, ?, ?, 'recorded', 'uploading', ?, 'en', ?, ?, ?, 'pending_push', ?, CURRENT_TIMESTAMP)`,
        [
          prepared.lectureId,
          input.courseId,
          input.user.id,
          prepared.title,
          lectureNumber,
          lectureDate,
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

  if (prepared.chunkFiles.length > 0) {
    let lastChunkResult: RemoteLectureChunkUploadResult | null = null;

    for (const chunk of prepared.chunkFiles) {
      input.onStatusChange?.(
        prepared.chunkFiles.length > 1
          ? `Uploading part ${chunk.chunkIndex + 1} of ${prepared.chunkFiles.length}...`
          : 'Uploading lecture audio...'
      );
      const recordingFile = new File(chunk.localUri);
      lastChunkResult = await uploadLectureChunk(
        prepared.lectureId,
        {
          audioFileId: prepared.audioFileId,
          courseId: input.courseId,
          title: prepared.title,
          recordedAt: prepared.recordedAt,
          durationSeconds: prepared.durationSeconds,
          expectedChunkCount: prepared.chunkFiles.length,
          chunkIndex: chunk.chunkIndex,
          chunkDurationSeconds: chunk.durationSeconds,
          originalFilename:
            chunk.chunkUploadMode === 'assemble_only'
              ? prepared.originalFilename
              : chunk.originalFilename,
          mimeType: chunk.mimeType,
          fileSizeBytes: chunk.fileSizeBytes,
          audioBase64: await recordingFile.base64(),
          chunkUploadMode: chunk.chunkUploadMode,
        },
        input.accessToken
      );
    }

    prepared.bucketName = lastChunkResult?.audioFile.bucketName ?? AUDIO_BUCKET_NAME_FALLBACK;
    prepared.objectPath = '';
    input.onStatusChange?.('Finishing lecture processing...');
    return lastChunkResult;
  }

  const recordingFile = new File(prepared.localUri);
  input.onStatusChange?.('Uploading lecture audio...');
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
  input.onStatusChange?.('Starting lecture processing...');
  return uploadResult;
}

async function downloadRemoteLectureAudioForCache(
  user: AuthUser,
  recording: RemoteLectureRecordingRecord,
  accessToken: string
) {
  const audioFile = recording.audioFile;

  if (!audioFile?.id || audioFile.uploadStatus !== 'uploaded') {
    return;
  }

  const db = await initializeLocalDatabase();
  const existingAsset = await db.getFirstAsync<{ local_uri: string | null }>(
    `SELECT local_uri
     FROM downloaded_assets
     WHERE owner_type = 'audio_file' AND owner_id = ?
     LIMIT 1`,
    [audioFile.id]
  );

  if (existingAsset?.local_uri) {
    const existingFile = new File(existingAsset.local_uri);

    if (existingFile.exists) {
      return;
    }
  }

  const filename = sanitizeFilename(audioFile.originalFilename ?? 'lecture-recording.m4a');
  const recordingsDirectory = new Directory(
    Paths.document,
    'recordings',
    user.id,
    recording.lecture.id
  );

  recordingsDirectory.create({
    idempotent: true,
    intermediates: true,
  });

  const audio = await downloadLectureAudio(recording.lecture.id, accessToken);
  const destinationFile = new File(recordingsDirectory, filename);
  destinationFile.write(audio.bytes);

  const fileInfo = destinationFile.info();

  await runSerializedLocalWrite(async (writeDb) => {
    await writeDb.runAsync(
      `INSERT INTO downloaded_assets (
         id,
         owner_type,
         owner_id,
         remote_uri,
         local_uri,
         mime_type,
         byte_size,
         created_at,
         updated_at
       ) VALUES (?, 'audio_file', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         owner_type = excluded.owner_type,
         owner_id = excluded.owner_id,
         remote_uri = excluded.remote_uri,
         local_uri = excluded.local_uri,
         mime_type = excluded.mime_type,
         byte_size = excluded.byte_size,
         updated_at = CURRENT_TIMESTAMP`,
      [
        audioFile.id,
        audioFile.id,
        audioFile.bucketName && audioFile.objectPath
          ? `api-upload://${audioFile.bucketName}/${audioFile.objectPath}`
          : `api-lecture-audio://${recording.lecture.id}`,
        destinationFile.uri,
        audio.contentType ?? audioFile.mimeType ?? 'audio/mp4',
        fileInfo.size ?? audioFile.fileSizeBytes ?? audio.bytes.byteLength,
      ]
    );
  });
}

async function markRecordingSyncSucceeded(prepared: PreparedRecording) {
  const remoteUri = prepared.objectPath
    ? `api-upload://${prepared.bucketName}/${prepared.objectPath}`
    : null;

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
        [remoteUri, prepared.audioFileId]
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

async function prepareRecordingForStorage(input: SaveRecordedLectureInput): Promise<PreparedRecording> {
  const lectureId = createUuid();
  const audioFileId = createUuid();
  const queueId = createUuid();
  const recordedAt = new Date().toISOString();
  const sourceChunks =
    input.recordingChunks && input.recordingChunks.length > 0
      ? input.recordingChunks
      : input.recordingUri
        ? [
            {
              localUri: input.recordingUri,
              durationMillis: input.durationMillis,
            },
          ]
        : [];

  if (sourceChunks.length === 0) {
    throw new Error('The recorder did not return any audio chunks.');
  }

  const durationSeconds = Math.max(
    1,
    Math.round(
      sourceChunks.reduce((totalDuration, chunk) => totalDuration + Math.max(0, chunk.durationMillis), 0) / 1000
    )
  );
  const extension = normalizeExtension(input.originalFilename ?? sourceChunks[0]?.localUri ?? '.m4a');
  const originalFilename = sanitizeFilename(input.originalFilename ?? `lecture-recording${extension}`);
  const title = input.lectureTitle?.trim() || buildLectureTitle(input.courseName, recordedAt);
  const recordingsDirectory = new Directory(Paths.document, 'recordings', input.user.id, lectureId);

  recordingsDirectory.create({
    idempotent: true,
    intermediates: true,
  });

  const primaryRecordingFile =
    input.recordingUri && !input.recordingChunks?.length
      ? copyPrimaryRecordingFile(input.recordingUri, recordingsDirectory)
      : null;
  const chunkFiles =
    input.recordingChunks && input.recordingChunks.length > 0
      ? copyPreparedChunks(sourceChunks, recordingsDirectory)
      : [];

  const primaryRecordingInfo = primaryRecordingFile?.info();
  const mimeType =
    primaryRecordingFile
      ? getMimeTypeForExtension(extension)
      : chunkFiles[0]?.mimeType ?? 'audio/mp4';
  const localUri = primaryRecordingFile?.uri ?? '';
  const fileSizeBytes =
    primaryRecordingInfo?.size ??
    chunkFiles.reduce((totalBytes, chunk) => totalBytes + chunk.fileSizeBytes, 0);

  return {
    lectureId,
    audioFileId,
    queueId,
    title,
    recordedAt,
    durationSeconds,
    originalFilename,
    mimeType,
    fileSizeBytes,
    localUri,
    chunkFiles,
    bucketName: '',
    objectPath: '',
  };
}

function copyPrimaryRecordingFile(recordingUri: string, recordingsDirectory: Directory) {
  const extension = normalizeExtension(recordingUri);
  const sourceFile = new File(recordingUri);
  const destinationFile = new File(recordingsDirectory, `lecture-recording${extension}`);
  sourceFile.copy(destinationFile);
  return destinationFile;
}

function copyPreparedChunks(
  sourceChunks: Array<{
    localUri: string;
    durationMillis: number;
    chunkUploadMode?: 'transcribe' | 'assemble_only';
  }>,
  recordingsDirectory: Directory
) {
  return sourceChunks.map((chunk, chunkIndex) => {
    const chunkExtension = normalizeExtension(chunk.localUri);
    const chunkFilename = `chunk-${String(chunkIndex).padStart(4, '0')}${chunkExtension}`;
    const sourceFile = new File(chunk.localUri);
    const destinationFile = new File(recordingsDirectory, chunkFilename);
    sourceFile.copy(destinationFile);
    const fileInfo = destinationFile.info();

    return {
      chunkIndex,
      durationSeconds: Math.max(1, Math.round(chunk.durationMillis / 1000)),
      originalFilename: chunkFilename,
      mimeType: getMimeTypeForExtension(chunkExtension),
      fileSizeBytes: fileInfo.size ?? 0,
      localUri: destinationFile.uri,
      chunkUploadMode: chunk.chunkUploadMode ?? 'transcribe',
    };
  });
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

function getMimeTypeForExtension(extension: string) {
  if (extension === '.wav') {
    return 'audio/wav';
  }

  if (extension === '.caf') {
    return 'audio/x-caf';
  }

  if (extension === '.mp3') {
    return 'audio/mpeg';
  }

  if (extension === '.aac') {
    return 'audio/aac';
  }

  if (extension === '.webm') {
    return 'audio/webm';
  }

  if (extension === '.ogg') {
    return 'audio/ogg';
  }

  return 'audio/mp4';
}

function isSupportedImportedAudio(asset: DocumentPickerAsset, originalFilename: string) {
  if (asset.mimeType?.toLowerCase().startsWith('audio/')) {
    return true;
  }

  const extension = normalizeExtension(originalFilename);
  return ['.m4a', '.mp4', '.mp3', '.wav', '.aac', '.caf', '.webm', '.ogg'].includes(extension);
}

async function resolveImportedAudioDurationMillis(recordingUri: string) {
  const player = createAudioPlayer({ uri: recordingUri }, { updateInterval: 100 });

  try {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const status = player.currentStatus;

      if (status.isLoaded && Number.isFinite(status.duration) && status.duration > 0) {
        return Math.max(1000, Math.round(status.duration * 1000));
      }

      await wait(100);
    }
  } finally {
    player.release();
  }

  return 1000;
}

async function createImportedLectureParts(input: {
  recordingUri: string;
  originalFilename: string;
  durationMillis: number;
}) {
  const sourceFile = new File(input.recordingUri);
  const fileInfo = sourceFile.info();
  const totalBytes = fileInfo.size ?? 0;

  if (totalBytes <= 0) {
    throw new Error('The selected audio file could not be read.');
  }

  const extension = normalizeExtension(input.originalFilename);
  const chunkCount = Math.max(1, Math.ceil(totalBytes / IMPORTED_UPLOAD_PART_BYTES));
  const baseDurationMillis = Math.floor(input.durationMillis / chunkCount);
  const remainderDurationMillis = Math.max(0, input.durationMillis - baseDurationMillis * chunkCount);
  const cacheDirectory = new Directory(Paths.cache, 'lecture-import-parts');

  cacheDirectory.create({
    idempotent: true,
    intermediates: true,
  });

  const parts: Array<{
    localUri: string;
    durationMillis: number;
    chunkUploadMode: 'assemble_only';
  }> = [];

  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const start = chunkIndex * IMPORTED_UPLOAD_PART_BYTES;
    const end = Math.min(totalBytes, start + IMPORTED_UPLOAD_PART_BYTES);
    const chunkBytes = new Uint8Array(await sourceFile.slice(start, end).arrayBuffer());
    const chunkFile = new File(
      cacheDirectory,
      `${createUuid()}-${String(chunkIndex).padStart(4, '0')}${extension}`
    );

    chunkFile.write(chunkBytes);

    parts.push({
      localUri: chunkFile.uri,
      durationMillis:
        baseDurationMillis + (chunkIndex === chunkCount - 1 ? remainderDurationMillis : 0),
      chunkUploadMode: 'assemble_only',
    });
  }

  return parts;
}

function wait(durationMs: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
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

async function readNextLectureNumber(
  db: Awaited<ReturnType<typeof initializeLocalDatabase>>,
  courseId: string
) {
  const row = await db.getFirstAsync<{ lecture_number: number | null }>(
    `SELECT MAX(lecture_number) AS lecture_number
     FROM cached_lectures
     WHERE course_id = ?`,
    [courseId]
  );

  return Math.max(1, (row?.lecture_number ?? 0) + 1);
}

function toLectureDate(value: string | null) {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

type RecordingRow = {
  lecture_id: string;
  course_id: string;
  title: string;
  recorded_at: string | null;
  duration_seconds: number | null;
  lecture_sync_status: RecordingSyncStatus;
  audio_file_id: string | null;
  local_uri: string | null;
  original_filename: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  upload_status: RecordingUploadStatus | null;
  queue_status: RecordingQueueStatus | null;
  bucket_name: string | null;
  object_path: string | null;
  last_error: string | null;
  transcript_id: string | null;
  transcript_source_transcript_id: string | null;
  transcript_source_audio_file_id: string | null;
  transcript_processing_job_id: string | null;
  transcription_provider: string | null;
  transcript_model_name: string | null;
  transcript_language_code: string | null;
  transcript_full_text: string | null;
  transcript_confidence_avg: number | null;
  transcript_total_segments: number | null;
  transcript_total_tokens_estimate: number | null;
  transcript_status: string | null;
  transcript_generated_at: string | null;
  transcript_created_at: string | null;
  transcript_updated_at: string | null;
  transcript_speaker_map_json: string | null;
  transcript_processed_payload_json: string | null;
};

const RECORDING_SELECT_SQL = `
  SELECT
    lectures.id AS lecture_id,
    lectures.course_id AS course_id,
    lectures.title AS title,
    lectures.recorded_at AS recorded_at,
    lectures.duration_seconds AS duration_seconds,
    lectures.sync_status AS lecture_sync_status,
    cached_audio_files.id AS audio_file_id,
    COALESCE(downloaded_assets.local_uri, local_upload_queue.local_uri) AS local_uri,
    cached_audio_files.original_filename AS original_filename,
    cached_audio_files.mime_type AS mime_type,
    cached_audio_files.file_size_bytes AS file_size_bytes,
    cached_audio_files.upload_status AS upload_status,
    local_upload_queue.status AS queue_status,
    cached_audio_files.bucket_name AS bucket_name,
    cached_audio_files.object_path AS object_path,
    local_upload_queue.last_error AS last_error,
    cached_processed_transcripts.id AS transcript_id,
    cached_processed_transcripts.source_transcript_id AS transcript_source_transcript_id,
    cached_processed_transcripts.source_audio_file_id AS transcript_source_audio_file_id,
    cached_processed_transcripts.processing_job_id AS transcript_processing_job_id,
    cached_processed_transcripts.provider_name AS transcription_provider,
    cached_processed_transcripts.model_name AS transcript_model_name,
    cached_processed_transcripts.language_code AS transcript_language_code,
    cached_processed_transcripts.formatted_text AS transcript_full_text,
    NULL AS transcript_confidence_avg,
    NULL AS transcript_total_segments,
    NULL AS transcript_total_tokens_estimate,
    cached_processed_transcripts.status AS transcript_status,
    cached_processed_transcripts.generated_at AS transcript_generated_at,
    cached_processed_transcripts.created_at AS transcript_created_at,
    cached_processed_transcripts.updated_at AS transcript_updated_at,
    cached_processed_transcripts.speaker_map_json AS transcript_speaker_map_json,
    cached_processed_transcripts.processed_payload_json AS transcript_processed_payload_json
  FROM cached_lectures lectures
  LEFT JOIN cached_audio_files
    ON cached_audio_files.lecture_id = lectures.id
   AND cached_audio_files.is_primary = 1
  LEFT JOIN cached_processed_transcripts
    ON cached_processed_transcripts.lecture_id = lectures.id
  LEFT JOIN downloaded_assets
    ON downloaded_assets.owner_type = 'audio_file'
   AND downloaded_assets.owner_id = cached_audio_files.id
  LEFT JOIN local_upload_queue
    ON local_upload_queue.lecture_id = lectures.id
`;

function mapRecordingRow(row: RecordingRow): LocalLectureRecordingRecord {
  return {
    lectureId: row.lecture_id,
    audioFileId: row.audio_file_id,
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
    transcript: row.transcript_id ? mapTranscriptRow(row) : null,
  };
}

async function upsertRemoteTranscript(db: SQLiteDatabase, transcript: RemoteLectureTranscript) {
  console.log('[ recordings ] Caching processed transcript response.', {
    lectureId: transcript.lectureId,
    transcriptId: transcript.id,
    sourceTranscriptId: transcript.sourceTranscriptId,
    sourceAudioFileId: transcript.sourceAudioFileId,
    processingJobId: transcript.processingJobId,
    status: transcript.status,
  });

  await upsertRemoteTranscriptionProcessingJob(db, transcript);
  const sourceTranscriptId = transcript.sourceTranscriptId
    ? await readExistingId(db, 'cached_transcripts', transcript.sourceTranscriptId)
    : null;
  const sourceAudioFileId = transcript.sourceAudioFileId
    ? await readExistingId(db, 'cached_audio_files', transcript.sourceAudioFileId)
    : null;
  const processingJobId = transcript.processingJobId
    ? await readExistingId(db, 'cached_processing_jobs', transcript.processingJobId)
    : null;

  console.log('[ recordings ] Processed transcript local references resolved.', {
    lectureId: transcript.lectureId,
    transcriptId: transcript.id,
    sourceTranscriptId,
    sourceAudioFileId,
    processingJobId,
  });

  await db.runAsync('DELETE FROM cached_processed_transcripts WHERE lecture_id = ? AND id <> ?', [
    transcript.lectureId,
    transcript.id,
  ]);

  await db.runAsync(
    `INSERT INTO cached_processed_transcripts (
       id,
       lecture_id,
       source_transcript_id,
       source_audio_file_id,
       processing_job_id,
       provider_name,
       model_name,
       language_code,
       speaker_map_json,
       processed_payload_json,
       formatted_text,
       status,
       generated_at,
       created_at,
       updated_at,
       sync_status,
       dirty_fields_json,
       last_synced_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       lecture_id = excluded.lecture_id,
       source_transcript_id = excluded.source_transcript_id,
       source_audio_file_id = excluded.source_audio_file_id,
       processing_job_id = excluded.processing_job_id,
       provider_name = excluded.provider_name,
       model_name = excluded.model_name,
       language_code = excluded.language_code,
       speaker_map_json = excluded.speaker_map_json,
       processed_payload_json = excluded.processed_payload_json,
       formatted_text = excluded.formatted_text,
       status = excluded.status,
       generated_at = excluded.generated_at,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at,
       sync_status = 'synced',
       dirty_fields_json = excluded.dirty_fields_json,
       last_synced_at = CURRENT_TIMESTAMP`,
    [
      transcript.id,
      transcript.lectureId,
      sourceTranscriptId,
      sourceAudioFileId,
      processingJobId,
      transcript.transcriptionProvider,
      transcript.modelName,
      transcript.languageCode,
      JSON.stringify(transcript.speakerMap),
      JSON.stringify(transcript.processedPayload ?? {}),
      transcript.fullText,
      transcript.status,
      transcript.generatedAt,
      transcript.createdAt,
      transcript.updatedAt,
      JSON.stringify([]),
    ]
  );
}

async function upsertRemoteTranscriptionProcessingJob(
  db: SQLiteDatabase,
  transcript: RemoteLectureTranscript
) {
  if (!transcript.processingJobId) {
    return;
  }

  const jobStatus = transcript.status === 'ready' ? 'completed' : transcript.status;

  console.log('[ recordings ] Caching transcription processing job.', {
    lectureId: transcript.lectureId,
    processingJobId: transcript.processingJobId,
    jobStatus,
  });

  await db.runAsync(
    `INSERT INTO cached_processing_jobs (
       id,
       lecture_id,
       job_type,
       provider_name,
       model_name,
       status,
       completed_at,
       created_at,
       updated_at,
       sync_status,
       dirty_fields_json,
       last_synced_at
     ) VALUES (?, ?, 'transcription', ?, ?, ?, ?, ?, ?, 'synced', ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       lecture_id = excluded.lecture_id,
       provider_name = excluded.provider_name,
       model_name = excluded.model_name,
       status = excluded.status,
       completed_at = excluded.completed_at,
       updated_at = excluded.updated_at,
       sync_status = 'synced',
       dirty_fields_json = excluded.dirty_fields_json,
       last_synced_at = CURRENT_TIMESTAMP`,
    [
      transcript.processingJobId,
      transcript.lectureId,
      transcript.transcriptionProvider,
      transcript.modelName,
      jobStatus,
      transcript.status === 'ready' ? transcript.generatedAt : null,
      transcript.createdAt,
      transcript.updatedAt,
      JSON.stringify([]),
    ]
  );
}

async function readExistingId(db: SQLiteDatabase, tableName: string, id: string) {
  const row = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM ${tableName} WHERE id = ? LIMIT 1`,
    [id]
  );

  return row?.id ?? null;
}

function mapTranscriptRow(row: RecordingRow): LocalLectureTranscript {
  return {
    id: row.transcript_id ?? '',
    lectureId: row.lecture_id,
    sourceTranscriptId: row.transcript_source_transcript_id,
    sourceAudioFileId: row.transcript_source_audio_file_id,
    processingJobId: row.transcript_processing_job_id,
    transcriptionProvider: row.transcription_provider,
    modelName: row.transcript_model_name,
    languageCode: row.transcript_language_code,
    fullText: row.transcript_full_text,
    confidenceAvg: row.transcript_confidence_avg,
    totalSegments: readProcessedParagraphCount(row.transcript_processed_payload_json),
    totalTokensEstimate: row.transcript_full_text ? estimateTokenCount(row.transcript_full_text) : null,
    status: row.transcript_status ?? 'processing',
    generatedAt: row.transcript_generated_at,
    createdAt: row.transcript_created_at,
    updatedAt: row.transcript_updated_at,
    speakerMap: readSpeakerMap(row.transcript_speaker_map_json),
    processedPayload: readJson(row.transcript_processed_payload_json),
    segments: [],
  };
}

async function withTranscriptSegments(recording: LocalLectureRecordingRecord) {
  return recording;
}

function readSpeakerMap(value: string | null): RemoteLectureTranscript['speakerMap'] {
  const parsed = readJson(value);
  return Array.isArray(parsed) ? (parsed as RemoteLectureTranscript['speakerMap']) : [];
}

function readProcessedParagraphCount(value: string | null) {
  const parsed = readJson(value);

  if (
    parsed &&
    typeof parsed === 'object' &&
    'paragraphs' in parsed &&
    Array.isArray(parsed.paragraphs)
  ) {
    return parsed.paragraphs.length;
  }

  return null;
}

function readJson(value: string | null): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function estimateTokenCount(text: string) {
  if (!text.trim()) {
    return 0;
  }

  return Math.ceil(text.trim().split(/\s+/).length * 1.33);
}
