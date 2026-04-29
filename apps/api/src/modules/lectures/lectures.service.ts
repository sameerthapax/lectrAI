import { getDb, getSupabaseAdminClient } from '@lectrai/db';
import ffmpegPath from 'ffmpeg-static';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { HttpError } from '../../lib/http-error.js';
import {
  OPENAI_AUDIO_FILE_LIMIT_BYTES,
  transcribeLectureAudio,
  type RawDiarizedTranscription,
  type TranscriptionSegment,
} from './audio-transcription.service.js';
import { mergeChunkTranscriptions } from './transcript-merge.service.js';
import {
  persistProcessedTranscriptWithChunks,
  persistTranscriptChunksForProcessedTranscript,
  upsertProcessedTranscript,
} from './transcript-embeddings.service.js';
import {
  processTranscriptSpeakers,
  type ProcessedTranscriptPayload,
  type ProcessedTranscriptSpeaker,
} from './transcript-processing.service.js';

const AUDIO_BUCKET_NAME = 'lecture-audio';
const SAFE_OPENAI_TRANSCRIPTION_CHUNK_BYTES = 10 * 1024 * 1024;
const TRANSCRIPTION_PROVIDER_NAME = 'openai';
const TRANSCRIPTION_MODEL_NAME = process.env.OPENAI_TRANSCRIPTION_MODEL ?? 'gpt-4o-transcribe-diarize';
const TRANSCRIPTION_LOG_PREFIX = '[ transcription ]';
const execFileAsync = promisify(execFile);

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

export type LectureChunkUploadInput = {
  lectureId: string;
  audioFileId: string;
  courseId: string;
  title: string;
  recordedAt: string;
  durationSeconds: number;
  expectedChunkCount: number;
  chunkIndex: number;
  chunkDurationSeconds: number | null;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  audioBase64: string;
  chunkUploadMode: 'transcribe' | 'assemble_only';
};

export type LectureChunkUploadResult = {
  lecture: {
    id: string;
    status: string;
    expectedChunkCount: number | null;
  };
  audioFile: {
    id: string;
    bucketName: string;
    uploadStatus: string;
  };
  chunk: {
    id: string;
    chunkIndex: number;
    storagePath: string;
    status: string;
  };
  processingJob: {
    id: string;
    jobType: string;
    status: string;
  };
  transcript: LectureTranscript | null;
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
  transcript: LectureTranscript | null;
};

export type LectureTranscriptSegment = {
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

export type LectureTranscript = {
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
  speakerMap: ProcessedTranscriptSpeaker[];
  processedPayload: ProcessedTranscriptPayload | null;
  segments: LectureTranscriptSegment[];
};

export type LectureAudioDownload = {
  audioBytes: Buffer;
  mimeType: string;
  filename: string;
  fileSizeBytes: number | null;
};

export type LectureAudioDownloadUrl = {
  signedUrl: string;
  mimeType: string;
  filename: string;
  fileSizeBytes: number | null;
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

export function parseLectureChunkUploadInput(lectureId: string, payload: unknown): LectureChunkUploadInput {
  const record = readObject(payload);

  return {
    lectureId,
    audioFileId: readUuid(record.audioFileId, 'audioFileId'),
    courseId: readUuid(record.courseId, 'courseId'),
    title: readRequiredString(record.title, 'title'),
    recordedAt: readIsoDate(record.recordedAt, 'recordedAt'),
    durationSeconds: readPositiveInteger(record.durationSeconds, 'durationSeconds'),
    expectedChunkCount: readStrictPositiveInteger(record.expectedChunkCount, 'expectedChunkCount'),
    chunkIndex: readNonNegativeInteger(record.chunkIndex, 'chunkIndex'),
    chunkDurationSeconds: readOptionalNonNegativeNumber(record.chunkDurationSeconds, 'chunkDurationSeconds'),
    originalFilename: readRequiredString(record.originalFilename, 'originalFilename'),
    mimeType: readRequiredString(record.mimeType, 'mimeType'),
    fileSizeBytes: readPositiveInteger(record.fileSizeBytes, 'fileSizeBytes'),
    audioBase64: readRequiredString(record.audioBase64, 'audioBase64'),
    chunkUploadMode: readChunkUploadMode(record.chunkUploadMode),
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
          model_name,
          status,
          input_payload,
          output_payload
        ) values (
          ${input.lectureId}::uuid,
          ${userId}::uuid,
          'transcription',
          ${TRANSCRIPTION_PROVIDER_NAME},
          ${TRANSCRIPTION_MODEL_NAME},
          'queued',
          ${JSON.stringify({
            bucketName: AUDIO_BUCKET_NAME,
            objectPath,
            audioFileId: input.audioFileId,
          })}::jsonb,
          ${JSON.stringify({
            message: 'Transcription job queued.',
          })}::jsonb
        )
        returning id, job_type, status
      `
    )[0];

  if (!processingJob) {
    throw new HttpError(500, 'Failed to create transcription processing job.');
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
    transcript: null,
  };
}

export async function createLectureChunkForUser(
  userId: string,
  lectureId: string,
  input: LectureChunkUploadInput
): Promise<LectureChunkUploadResult> {
  await assertUserCanManageCourse(userId, input.courseId);
  await upsertChunkBackedLectureMetadata(userId, lectureId, input);

  const storagePath = buildChunkObjectPath(
    userId,
    input.courseId,
    lectureId,
    input.chunkIndex,
    input.originalFilename
  );
  const audioBytes = Buffer.from(input.audioBase64, 'base64');
  const supabase = getSupabaseAdminClient();
  const uploadResult = await supabase.storage.from(AUDIO_BUCKET_NAME).upload(storagePath, audioBytes, {
    contentType: input.mimeType,
    upsert: true,
  });

  if (uploadResult.error) {
    throw new HttpError(502, 'Failed to store lecture audio chunk.', uploadResult.error.message);
  }

  const chunk = await upsertLectureAudioChunk({
    lectureId,
    chunkIndex: input.chunkIndex,
    storagePath,
    durationSeconds: input.chunkDurationSeconds,
  });

  await deleteChunkTranscriptionByChunkId(chunk.id);

  if (input.chunkUploadMode === 'assemble_only') {
    await markLectureChunkDone(chunk.id);
    const lectureStatus = await getLectureStatus(lectureId);

    return {
      lecture: {
        id: lectureId,
        status: lectureStatus,
        expectedChunkCount: input.expectedChunkCount,
      },
      audioFile: {
        id: input.audioFileId,
        bucketName: AUDIO_BUCKET_NAME,
        uploadStatus: 'uploaded',
      },
      chunk: {
        id: chunk.id,
        chunkIndex: input.chunkIndex,
        storagePath,
        status: 'done',
      },
      processingJob: {
        id: '',
        jobType: 'chunk_transcription',
        status: 'completed',
      },
      transcript: null,
    };
  }

  const processingJob = await createLectureProcessingJob({
    lectureId,
    userId,
    jobType: 'chunk_transcription',
    inputPayload: {
      chunkId: chunk.id,
      chunkIndex: input.chunkIndex,
      storagePath,
      bucketName: AUDIO_BUCKET_NAME,
    },
  });

  const transcript = await processLectureChunkTranscriptionJob({
    lectureId,
    userId,
    audioFileId: input.audioFileId,
    chunkId: chunk.id,
    processingJobId: processingJob.id,
  });
  const lectureStatus = await getLectureStatus(lectureId);

  return {
    lecture: {
      id: lectureId,
      status: lectureStatus,
      expectedChunkCount: input.expectedChunkCount,
    },
    audioFile: {
      id: input.audioFileId,
      bucketName: AUDIO_BUCKET_NAME,
      uploadStatus: 'uploaded',
    },
    chunk: {
      id: chunk.id,
      chunkIndex: input.chunkIndex,
      storagePath,
      status: 'done',
    },
    processingJob: {
      id: processingJob.id,
      jobType: 'chunk_transcription',
      status: 'completed',
    },
    transcript,
  };
}

export async function processLectureTranscriptionForUser(userId: string, lectureId: string) {
  const chunkStats = await getLectureChunkStatus(lectureId);

  if (chunkStats.totalChunks > 0) {
    const db = getDb();
    const lectureRows = await db<{ course_id: string }[]>`
      select course_id
      from public.lectures
      where id = ${lectureId}::uuid
      limit 1
    `;
    const lecture = lectureRows[0];

    if (!lecture) {
      throw new HttpError(404, 'Lecture not found.');
    }

    await assertUserCanViewCourse(userId, lecture.course_id);

    if (!chunkStats.expectedChunkCount || chunkStats.doneChunks < chunkStats.expectedChunkCount) {
      throw new HttpError(409, 'Lecture chunks are still uploading or transcribing.');
    }

    const existingProcessedTranscript = await getProcessedTranscriptForLecture(lectureId);

    if (existingProcessedTranscript && isProcessedTranscriptReadyForDisplay(existingProcessedTranscript)) {
      return {
        lecture: {
          id: lectureId,
          status: 'ready',
        },
        transcript: existingProcessedTranscript,
      };
    }

    const repairedTranscript = await rebuildProcessedTranscriptFromSavedTranscript({
      lectureId,
      userId,
    });

    if (repairedTranscript && isProcessedTranscriptReadyForDisplay(repairedTranscript)) {
      return {
        lecture: {
          id: lectureId,
          status: 'ready',
        },
        transcript: repairedTranscript,
      };
    }

    const repairedChunkTranscript = await repairInvalidChunkTranscriptionsFromStoredAudio({
      lectureId,
      userId,
    });

    if (repairedChunkTranscript) {
      return {
        lecture: {
          id: lectureId,
          status: 'ready',
        },
        transcript: repairedChunkTranscript,
      };
    }

    const chunkTranscriptions = (await loadChunkTranscriptionsForMerge(lectureId)).filter((chunk) =>
      hasStoredDiarizedTranscript(chunk.rawDiarizedJson)
    );
    const transcript =
      chunkTranscriptions.length > 0
        ? await runLectureMergeProcessingAndEmbeddingPipeline({
            lectureId,
            userId,
          })
        : (await processAssembledLectureImportForUser(userId, lectureId)).transcript;

    return {
      lecture: {
        id: lectureId,
        status: transcript ? 'ready' : await getLectureStatus(lectureId),
      },
      transcript: transcript ?? (await getProcessedTranscriptForLecture(lectureId)),
    };
  }

  return processSingleFileLectureTranscriptionForUser(userId, lectureId);
}

async function processSingleFileLectureTranscriptionForUser(userId: string, lectureId: string) {
  logTranscriptionStep('Starting transcription processing.', { lectureId, userId });

  const db = getDb();
  logTranscriptionStep('Loading lecture and primary audio file.', { lectureId, userId });

  const lectureRows = await db<
    {
      lecture_id: string;
      course_id: string;
      title: string;
      status: string;
      duration_seconds: number | null;
      course_name: string;
      course_description: string | null;
      audio_file_id: string | null;
      bucket_name: string | null;
      object_path: string | null;
      original_filename: string | null;
      mime_type: string | null;
    }[]
  >`
    select
      l.id as lecture_id,
      l.course_id,
      l.title,
      l.status,
      l.duration_seconds,
      c.course_name,
      c.description as course_description,
      af.id as audio_file_id,
      af.bucket_name,
      af.object_path,
      af.original_filename,
      af.mime_type
    from public.lectures l
    inner join public.courses c
      on c.id = l.course_id
    left join lateral (
      select id, bucket_name, object_path, original_filename, mime_type
      from public.audio_files
      where lecture_id = l.id
      order by is_primary desc, uploaded_at desc nulls last, created_at desc nulls last
      limit 1
    ) af on true
    where l.id = ${lectureId}::uuid
    limit 1
  `;

  const lecture = lectureRows[0];

  if (!lecture) {
    logTranscriptionStep('Lecture not found.', { lectureId, userId });
    throw new HttpError(404, 'Lecture not found.');
  }

  logTranscriptionStep('Lecture loaded.', {
    lectureId,
    userId,
    courseId: lecture.course_id,
    courseName: lecture.course_name,
    lectureStatus: lecture.status,
    durationSeconds: lecture.duration_seconds,
    hasAudioFile: Boolean(lecture.audio_file_id),
    bucketName: lecture.bucket_name,
    objectPath: lecture.object_path,
    mimeType: lecture.mime_type,
  });

  await assertUserCanViewCourse(userId, lecture.course_id);
  logTranscriptionStep('User course access confirmed.', { lectureId, userId, courseId: lecture.course_id });

  const existingProcessedTranscript = await getProcessedTranscriptForLecture(lectureId);

  if (existingProcessedTranscript && isProcessedTranscriptReadyForDisplay(existingProcessedTranscript)) {
    logTranscriptionStep('Ready processed transcript already exists, returning cached transcript.', {
      lectureId,
      userId,
      transcriptId: existingProcessedTranscript.id,
      totalSegments: existingProcessedTranscript.totalSegments,
    });

    return {
      lecture: {
        id: lectureId,
        status: lecture.status,
      },
      transcript: existingProcessedTranscript,
    };
  }

  if (existingProcessedTranscript?.status === 'ready') {
    logTranscriptionStep('Ready processed transcript is missing canonical speaker labels, regenerating.', {
      lectureId,
      userId,
      transcriptId: existingProcessedTranscript.id,
    });
  }

  const repairedTranscript = await rebuildProcessedTranscriptFromSavedTranscript({
    lectureId,
    userId,
  });

  if (repairedTranscript && isProcessedTranscriptReadyForDisplay(repairedTranscript)) {
    logTranscriptionStep('Recovered processed transcript from saved raw transcript.', {
      lectureId,
      userId,
      transcriptId: repairedTranscript.id,
      totalSegments: repairedTranscript.totalSegments,
    });

    return {
      lecture: {
        id: lectureId,
        status: 'ready',
      },
      transcript: repairedTranscript,
    };
  }

  if (!lecture.audio_file_id || !lecture.bucket_name || !lecture.object_path) {
    logTranscriptionStep('Lecture audio is missing.', {
      lectureId,
      userId,
      audioFileId: lecture.audio_file_id,
      bucketName: lecture.bucket_name,
      objectPath: lecture.object_path,
    });

    throw new HttpError(409, 'Lecture audio is not available for transcription yet.');
  }

  logTranscriptionStep('Creating or updating transcription job.', {
    lectureId,
    userId,
    audioFileId: lecture.audio_file_id,
  });

  const processingJob = await upsertRunningTranscriptionJob({
    lectureId,
    userId,
    audioFileId: lecture.audio_file_id,
    bucketName: lecture.bucket_name,
    objectPath: lecture.object_path,
  });

  logTranscriptionStep('Transcription job is running.', {
    lectureId,
    userId,
    processingJobId: processingJob.id,
  });

  try {
    logTranscriptionStep('Downloading lecture audio from storage.', {
      lectureId,
      userId,
      bucketName: lecture.bucket_name,
      objectPath: lecture.object_path,
    });

    const audio = await downloadLectureAudio(lecture.bucket_name, lecture.object_path);

    logTranscriptionStep('Lecture audio downloaded.', {
      lectureId,
      userId,
      bytes: audio.byteLength,
      mimeType: lecture.mime_type ?? 'audio/mp4',
      filename: lecture.original_filename ?? 'lecture-recording.m4a',
    });

    const transcription =
      audio.byteLength > OPENAI_AUDIO_FILE_LIMIT_BYTES
        ? await transcribeLargeLectureAudioInParts({
            lectureId,
            userId,
            audioFileId: lecture.audio_file_id,
            processingJobId: processingJob.id,
            audioBytes: audio,
            mimeType: lecture.mime_type ?? 'audio/mp4',
            filename: lecture.original_filename ?? 'lecture-recording.m4a',
            durationSeconds: lecture.duration_seconds,
          })
        : await transcribeLectureAudioWithRetry({
            lectureId,
            userId,
            partIndex: 0,
            partCount: 1,
            audioBytes: audio,
            mimeType: lecture.mime_type ?? 'audio/mp4',
            filename: lecture.original_filename ?? 'lecture-recording.m4a',
          });

    logTranscriptionStep('Received transcription provider response.', {
      lectureId,
      userId,
      providerName: transcription.providerName,
      modelName: transcription.modelName,
      languageCode: transcription.languageCode,
      totalSegments: transcription.totalSegments,
      totalTokensEstimate: transcription.totalTokensEstimate,
      confidenceAvg: transcription.confidenceAvg,
      responsePreview: buildLogPreview(transcription.rawResponse),
    });

    logTranscriptionStep('Saving transcription response.', {
      lectureId,
      userId,
      processingJobId: processingJob.id,
      audioFileId: lecture.audio_file_id,
      fullTextPreview: buildLogPreview(transcription.fullText),
    });

    const rawTranscript = await saveLectureTranscription({
      lectureId,
      audioFileId: lecture.audio_file_id,
      processingJobId: processingJob.id,
      status: 'ready',
      transcription,
    });

    logTranscriptionStep('Processing transcript speaker roles.', {
      lectureId,
      userId,
      rawTranscriptId: rawTranscript.id,
      courseTitle: lecture.course_name,
    });

    const processedTranscriptResult = await processTranscriptSpeakers({
      courseTitle: lecture.course_name,
      courseDescription: lecture.course_description,
      lectureTitle: lecture.title,
      transcriptText: transcription.fullText,
      segments: transcription.segments,
    });

    logTranscriptionStep('Saving processed transcript response.', {
      lectureId,
      userId,
      rawTranscriptId: rawTranscript.id,
      speakerCount: processedTranscriptResult.speakerMap.length,
      formattedTextPreview: buildLogPreview(processedTranscriptResult.formattedText),
    });

    const persistedTranscript = await persistProcessedTranscriptWithChunks({
      lectureId,
      rawTranscriptId: rawTranscript.id,
      audioFileId: lecture.audio_file_id,
      processingJobId: processingJob.id,
      processing: processedTranscriptResult,
    });

    const transcript = await getProcessedTranscriptForLecture(lectureId);

    if (!transcript) {
      throw new HttpError(500, 'Failed to load saved processed lecture transcription.');
    }

    logTranscriptionStep('Updating transcription job as completed.', {
      lectureId,
      userId,
      processingJobId: processingJob.id,
      transcriptId: transcript.id,
      chunkCount: persistedTranscript.chunkCount,
      embeddingModel: persistedTranscript.embeddingModel,
    });

    await db`
      update public.processing_jobs
      set
        status = 'completed',
        output_payload = ${JSON.stringify({
          fullText: transcription.fullText,
          totalSegments: transcription.totalSegments,
          totalTokensEstimate: transcription.totalTokensEstimate,
          rawResponse: transcription.rawResponse,
          processedTranscript: processedTranscriptResult.payload,
          transcriptChunks: {
            chunkCount: persistedTranscript.chunkCount,
            embeddingModel: persistedTranscript.embeddingModel,
            embeddingDimensions: persistedTranscript.embeddingDimensions,
          },
        })}::jsonb,
        completed_at = timezone('utc', now()),
        error_message = null
      where id = ${processingJob.id}::uuid
    `;

    logTranscriptionStep('Updating lecture as ready.', { lectureId, userId });

    await db`
      update public.lectures
      set status = 'ready'
      where id = ${lectureId}::uuid
    `;

    logTranscriptionStep('Transcription processing completed.', {
      lectureId,
      userId,
      transcriptId: transcript.id,
      totalSegments: transcript.totalSegments,
    });

    return {
      lecture: {
        id: lectureId,
        status: 'ready',
      },
      transcript,
    };
  } catch (error) {
    console.error(`${TRANSCRIPTION_LOG_PREFIX} Transcription processing failed.`, {
      lectureId,
      userId,
      processingJobId: processingJob.id,
      error,
    });

    await markTranscriptionFailed({
      lectureId,
      processingJobId: processingJob.id,
      errorMessage: error instanceof Error ? error.message : 'Audio transcription failed.',
    });

    throw error;
  }
}

async function processAssembledLectureImportForUser(userId: string, lectureId: string) {
  await ensureImportedLectureAudioFile({
    lectureId,
    userId,
  });

  return processSingleFileLectureTranscriptionForUser(userId, lectureId);
}

async function transcribeLargeLectureAudioInParts(input: {
  lectureId: string;
  userId: string;
  audioFileId: string | null;
  processingJobId: string;
  audioBytes: Buffer;
  mimeType: string;
  filename: string;
  durationSeconds: number | null;
}) {
  logTranscriptionStep('Large lecture detected. Splitting audio into transcription-sized parts.', {
    lectureId: input.lectureId,
    userId: input.userId,
    bytes: input.audioBytes.byteLength,
    filename: input.filename,
    mimeType: input.mimeType,
    durationSeconds: input.durationSeconds,
    providerLimitBytes: OPENAI_AUDIO_FILE_LIMIT_BYTES,
  });

  const audioParts = await splitAudioForTranscription(input);
  const checkpoint = await loadLectureTranscriptionCheckpoint(input.lectureId);
  const chunkResults = checkpoint?.chunkResults ? [...checkpoint.chunkResults] : [];
  let startIndex = Math.min(Math.max(checkpoint?.completedPartCount ?? 0, 0), audioParts.length);

  if (chunkResults.length < startIndex) {
    startIndex = chunkResults.length;
  }

  if (startIndex > 0) {
    logTranscriptionStep('Resuming lecture transcription from checkpoint.', {
      lectureId: input.lectureId,
      userId: input.userId,
      completedPartCount: startIndex,
      partCount: audioParts.length,
    });
  }

  for (const [index, part] of Array.from(audioParts.entries()).slice(startIndex)) {
    logTranscriptionStep('Transcribing lecture part.', {
      lectureId: input.lectureId,
      userId: input.userId,
      partIndex: index,
      partCount: audioParts.length,
      bytes: part.audioBytes.byteLength,
      filename: part.filename,
    });

    const result = await transcribeLectureAudioWithRetry({
      audioBytes: part.audioBytes,
      mimeType: input.mimeType,
      filename: part.filename,
      lectureId: input.lectureId,
      userId: input.userId,
      partIndex: index,
      partCount: audioParts.length,
    });

    chunkResults[index] = {
      chunkIndex: index,
      durationSeconds: null,
      rawDiarizedJson: result.rawResponse as RawDiarizedTranscription,
    };

    const mergedSoFar = mergeChunkTranscriptions(chunkResults.filter(Boolean) as Array<{
      chunkIndex: number;
      durationSeconds: number | null;
      rawDiarizedJson: RawDiarizedTranscription;
    }>);
    const checkpointPayload = {
      completedPartCount: index + 1,
      partCount: audioParts.length,
      chunkResults: chunkResults.filter(Boolean).map((chunk) => ({
        chunkIndex: chunk.chunkIndex,
        durationSeconds: chunk.durationSeconds,
        rawDiarizedJson: chunk.rawDiarizedJson,
      })),
      fullText: mergedSoFar.fullText,
      languageCode:
        chunkResults
          .filter(Boolean)
          .map((chunk) => chunk.rawDiarizedJson.language)
          .find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? null,
      totalSegments: mergedSoFar.totalSegments,
      totalTokensEstimate: mergedSoFar.totalTokensEstimate,
      confidenceAvg: mergedSoFar.confidenceAvg,
    };

    await persistLectureTranscriptionSnapshot({
      lectureId: input.lectureId,
      audioFileId: input.audioFileId,
      processingJobId: input.processingJobId,
      transcription: {
        providerName: 'openai',
        modelName: TRANSCRIPTION_MODEL_NAME,
        languageCode: checkpointPayload.languageCode,
        fullText: checkpointPayload.fullText,
        confidenceAvg: checkpointPayload.confidenceAvg,
        totalSegments: mergedSoFar.totalSegments,
        totalTokensEstimate: mergedSoFar.totalTokensEstimate,
        rawResponse: {
          ...checkpointPayload,
          checkpoint: true,
        },
        segments: mergedSoFar.segments,
      },
      status: 'processing',
    });

    await updateTranscriptionJobCheckpoint(input.processingJobId, checkpointPayload);
  }

  const merged = mergeChunkTranscriptions(
    chunkResults.filter(Boolean) as Array<{
      chunkIndex: number;
      durationSeconds: number | null;
      rawDiarizedJson: RawDiarizedTranscription;
    }>
  );
  const languageCode =
    chunkResults
      .filter(Boolean)
      .map((chunk) => chunk.rawDiarizedJson.language)
      .find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? null;

  logTranscriptionStep('Merged transcribed lecture parts.', {
    lectureId: input.lectureId,
    userId: input.userId,
    partCount: chunkResults.length,
    totalSegments: merged.totalSegments,
    totalTokensEstimate: merged.totalTokensEstimate,
  });

  return {
    providerName: 'openai' as const,
    modelName: TRANSCRIPTION_MODEL_NAME,
    languageCode,
    fullText: merged.fullText,
    confidenceAvg: merged.confidenceAvg,
    totalSegments: merged.totalSegments,
    totalTokensEstimate: merged.totalTokensEstimate,
    rawResponse: {
      text: merged.fullText,
      language: languageCode,
      segments: merged.segments.map((segment) => ({
        text: segment.cleanedText,
        speaker: segment.speakerLabel,
        start: segment.startTimeSeconds,
        end: segment.endTimeSeconds,
        confidence: segment.confidenceScore,
      })),
      splitForTranscription: true,
      partCount: chunkResults.length,
      mergedFromChunkCount: chunkResults.length,
    },
    segments: merged.segments,
  };
}

async function transcribeLectureAudioWithRetry(input: {
  lectureId: string;
  userId: string;
  partIndex: number;
  partCount: number;
  audioBytes: Buffer;
  mimeType: string;
  filename: string;
}) {
  const maxAttempts = 4;
  const baseDelayMs = 1000;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      if (attempt > 1) {
        logTranscriptionStep('Retrying lecture part transcription.', {
          lectureId: input.lectureId,
          userId: input.userId,
          partIndex: input.partIndex,
          partCount: input.partCount,
          attempt,
        });
      }

      return await transcribeLectureAudio({
        audioBytes: input.audioBytes,
        mimeType: input.mimeType,
        filename: input.filename,
      });
    } catch (error) {
      lastError = error;

      if (attempt >= maxAttempts || !isRetryableLectureTranscriptionError(error)) {
        throw error;
      }

      const delayMs = baseDelayMs * 2 ** (attempt - 1);

      logTranscriptionStep('Lecture part transcription failed, retrying after backoff.', {
        lectureId: input.lectureId,
        userId: input.userId,
        partIndex: input.partIndex,
        partCount: input.partCount,
        attempt,
        delayMs,
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      await delay(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new HttpError(502, 'Lecture transcription failed.');
}

async function upsertChunkBackedLectureMetadata(
  userId: string,
  lectureId: string,
  input: LectureChunkUploadInput
) {
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
      recorded_at,
      expected_chunk_count
    ) values (
      ${lectureId}::uuid,
      ${input.courseId}::uuid,
      ${userId}::uuid,
      ${input.title},
      'recorded',
      'processing',
      ${input.durationSeconds},
      'en',
      ${input.recordedAt}::timestamptz,
      ${input.expectedChunkCount}
    )
    on conflict (id) do update
    set
      course_id = excluded.course_id,
      created_by_user_id = excluded.created_by_user_id,
      title = excluded.title,
      source_type = excluded.source_type,
      status = 'processing',
      duration_seconds = excluded.duration_seconds,
      language_code = excluded.language_code,
      recorded_at = excluded.recorded_at,
      expected_chunk_count = excluded.expected_chunk_count
  `;

  await db`
    insert into public.audio_files (
      id,
      lecture_id,
      uploaded_by_user_id,
      storage_provider,
      bucket_name,
      original_filename,
      mime_type,
      duration_seconds,
      is_primary,
      upload_status,
      uploaded_at
    ) values (
      ${input.audioFileId}::uuid,
      ${lectureId}::uuid,
      ${userId}::uuid,
      'gcs',
      ${AUDIO_BUCKET_NAME},
      ${input.originalFilename},
      ${input.mimeType},
      ${input.durationSeconds},
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
      original_filename = excluded.original_filename,
      mime_type = excluded.mime_type,
      duration_seconds = excluded.duration_seconds,
      is_primary = excluded.is_primary,
      upload_status = excluded.upload_status,
      uploaded_at = excluded.uploaded_at
  `;
}

async function upsertLectureAudioChunk(input: {
  lectureId: string;
  chunkIndex: number;
  storagePath: string;
  durationSeconds: number | null;
}) {
  const db = getDb();
  const rows = await db<{ id: string; status: string }[]>`
    insert into public.audio_chunks (
      lecture_id,
      chunk_index,
      storage_path,
      duration_seconds,
      status
    ) values (
      ${input.lectureId}::uuid,
      ${input.chunkIndex},
      ${input.storagePath},
      ${input.durationSeconds},
      'uploaded'
    )
    on conflict (lecture_id, chunk_index) do update
    set
      storage_path = excluded.storage_path,
      duration_seconds = excluded.duration_seconds,
      status = 'uploaded'
    returning id::text as id, status::text as status
  `;

  const chunk = rows[0];

  if (!chunk) {
    throw new HttpError(500, 'Failed to save lecture audio chunk metadata.');
  }

  return chunk;
}

async function markLectureChunkDone(chunkId: string) {
  const db = getDb();

  await db`
    update public.audio_chunks
    set status = 'done'
    where id = ${chunkId}::uuid
  `;
}

async function deleteChunkTranscriptionByChunkId(chunkId: string) {
  const db = getDb();

  await db`
    delete from public.chunk_transcriptions
    where chunk_id = ${chunkId}::uuid
  `;
}

async function createLectureProcessingJob(input: {
  lectureId: string;
  userId: string;
  jobType: 'chunk_transcription' | 'merge' | 'processing' | 'embeddings';
  inputPayload: Record<string, unknown>;
}) {
  const db = getDb();
  const rows = await db<{ id: string; status: string }[]>`
    insert into public.processing_jobs (
      lecture_id,
      triggered_by_user_id,
      job_type,
      provider_name,
      model_name,
      status,
      input_payload
    ) values (
      ${input.lectureId}::uuid,
      ${input.userId}::uuid,
      ${input.jobType},
      ${TRANSCRIPTION_PROVIDER_NAME},
      ${TRANSCRIPTION_MODEL_NAME},
      'queued',
      ${JSON.stringify(input.inputPayload)}::jsonb
    )
    returning id::text as id, status::text as status
  `;

  const job = rows[0];

  if (!job) {
    throw new HttpError(500, `Failed to create ${input.jobType} job.`);
  }

  return job;
}

async function markLectureProcessingJobRunning(jobId: string) {
  const db = getDb();

  await db`
    update public.processing_jobs
    set
      status = 'running',
      started_at = coalesce(started_at, timezone('utc', now())),
      error_message = null
    where id = ${jobId}::uuid
  `;
}

async function markLectureProcessingJobCompleted(
  jobId: string,
  outputPayload: Record<string, unknown>
) {
  const db = getDb();

  await db`
    update public.processing_jobs
    set
      status = 'completed',
      output_payload = ${JSON.stringify(outputPayload)}::jsonb,
      completed_at = timezone('utc', now()),
      error_message = null
    where id = ${jobId}::uuid
  `;
}

async function markLectureProcessingJobFailed(jobId: string, errorMessage: string) {
  const db = getDb();

  await db`
    update public.processing_jobs
    set
      status = 'failed',
      error_message = ${errorMessage},
      completed_at = timezone('utc', now())
    where id = ${jobId}::uuid
  `;
}

async function processLectureChunkTranscriptionJob(input: {
  lectureId: string;
  userId: string;
  audioFileId: string | null;
  chunkId: string;
  processingJobId: string;
}) {
  const db = getDb();
  const chunkRows = await db<
    {
      id: string;
      chunk_index: number;
      storage_path: string;
      duration_seconds: number | null;
    }[]
  >`
    select
      id::text as id,
      chunk_index,
      storage_path,
      duration_seconds
    from public.audio_chunks
    where id = ${input.chunkId}::uuid
      and lecture_id = ${input.lectureId}::uuid
    limit 1
  `;

  const chunk = chunkRows[0];

  if (!chunk) {
    throw new HttpError(404, 'Lecture chunk not found.');
  }

  await markLectureProcessingJobRunning(input.processingJobId);

  await db`
    update public.audio_chunks
    set status = 'transcribing'
    where id = ${input.chunkId}::uuid
  `;

  try {
    const audio = await downloadLectureAudio(AUDIO_BUCKET_NAME, chunk.storage_path);
    const mimeType = inferChunkMimeType(chunk.storage_path);
    const filename = chunk.storage_path.split('/').pop() ?? `chunk-${chunk.chunk_index}.m4a`;
    const transcription =
      audio.byteLength > OPENAI_AUDIO_FILE_LIMIT_BYTES
        ? await transcribeLargeLectureAudioInParts({
            lectureId: input.lectureId,
            userId: input.userId,
            audioFileId: input.audioFileId,
            processingJobId: input.processingJobId,
            audioBytes: audio,
            mimeType,
            filename,
            durationSeconds: chunk.duration_seconds,
          })
        : await transcribeLectureAudioWithRetry({
            lectureId: input.lectureId,
            userId: input.userId,
            partIndex: chunk.chunk_index,
            partCount: 1,
            audioBytes: audio,
            mimeType,
            filename,
          });

    await db`
      insert into public.chunk_transcriptions (
        lecture_id,
        chunk_id,
        raw_diarized_json
      ) values (
        ${input.lectureId}::uuid,
        ${input.chunkId}::uuid,
        ${db.json(transcription.rawResponse as any)}
      )
      on conflict (chunk_id) do update
      set
        lecture_id = excluded.lecture_id,
        raw_diarized_json = excluded.raw_diarized_json
    `;

    await db`
      update public.audio_chunks
      set status = 'done'
      where id = ${input.chunkId}::uuid
    `;

    await markLectureProcessingJobCompleted(input.processingJobId, {
      chunkId: input.chunkId,
      chunkIndex: chunk.chunk_index,
      totalSegments: transcription.totalSegments,
      totalTokensEstimate: transcription.totalTokensEstimate,
      durationSeconds: chunk.duration_seconds,
    });

    return maybeRunLectureMergeProcessingAndEmbeddingPipeline({
      lectureId: input.lectureId,
      userId: input.userId,
      audioFileId: input.audioFileId,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Lecture audio chunk transcription failed.';

    await db`
      update public.audio_chunks
      set status = 'failed'
      where id = ${input.chunkId}::uuid
    `;
    await markLectureProcessingJobFailed(input.processingJobId, errorMessage);
    await markLectureFailed(input.lectureId);
    throw error;
  }
}

async function maybeRunLectureMergeProcessingAndEmbeddingPipeline(input: {
  lectureId: string;
  userId: string;
  audioFileId: string | null;
}) {
  const chunkStatus = await getLectureChunkStatus(input.lectureId);

  if (
    !chunkStatus.expectedChunkCount ||
    chunkStatus.totalChunks < chunkStatus.expectedChunkCount ||
    chunkStatus.doneChunks < chunkStatus.expectedChunkCount ||
    chunkStatus.failedChunks > 0
  ) {
    return null;
  }

  return runLectureMergeProcessingAndEmbeddingPipeline(input);
}

async function ensureImportedLectureAudioFile(input: {
  lectureId: string;
  userId: string;
}) {
  const lectureContext = await loadLecturePipelineContext(input.lectureId);

  if (!lectureContext) {
    throw new HttpError(404, 'Lecture not found.');
  }

  const existingAudio = await getPrimaryAudioFileForLecture(input.lectureId);

  if (existingAudio?.bucketName && existingAudio.objectPath) {
    return existingAudio;
  }

  const chunkRows = await listLectureAudioChunks(input.lectureId);

  if (chunkRows.length === 0) {
    throw new HttpError(409, 'No lecture audio chunks are available to merge.');
  }

  const mergedAudioBytes = await concatenateLectureByteParts(
    chunkRows.map((chunk) => ({
      bytesPromise: downloadLectureAudio(AUDIO_BUCKET_NAME, chunk.storagePath),
    }))
  );
  const objectPath = buildMergedAudioObjectPath(input.userId, lectureContext.courseId, input.lectureId);
  const supabase = getSupabaseAdminClient();
  const uploadResult = await supabase.storage.from(AUDIO_BUCKET_NAME).upload(objectPath, mergedAudioBytes, {
    contentType: existingAudio?.mimeType ?? 'audio/mp4',
    upsert: true,
  });

  if (uploadResult.error) {
    throw new HttpError(502, 'Failed to store merged lecture audio.', uploadResult.error.message);
  }

  await upsertMergedLectureAudioFile({
    lectureId: input.lectureId,
    userId: input.userId,
    preferredAudioFileId: lectureContext.audioFileId,
    bucketName: AUDIO_BUCKET_NAME,
    objectPath,
    originalFilename: existingAudio?.originalFilename ?? 'lecture-recording.m4a',
    mimeType: existingAudio?.mimeType ?? 'audio/mp4',
    fileSizeBytes: mergedAudioBytes.byteLength,
    durationSeconds: await getLectureDurationSeconds(input.lectureId),
  });

  return getPrimaryAudioFileForLecture(input.lectureId);
}

async function runLectureMergeProcessingAndEmbeddingPipeline(input: {
  lectureId: string;
  userId: string;
  audioFileId?: string | null;
}) {
  const existingProcessedTranscript = await getProcessedTranscriptForLecture(input.lectureId);

  if (
    existingProcessedTranscript?.status === 'ready' &&
    hasCanonicalSpeakerLabels(existingProcessedTranscript.fullText) &&
    (await getLectureStatus(input.lectureId)) === 'ready'
  ) {
    return existingProcessedTranscript;
  }

  const lectureContext = await loadLecturePipelineContext(input.lectureId);

  if (!lectureContext) {
    throw new HttpError(404, 'Lecture not found.');
  }

  const audioFileId = input.audioFileId ?? lectureContext.audioFileId;

  const mergeStage = await runLectureMergeStage({
    lectureId: input.lectureId,
    userId: input.userId,
    courseId: lectureContext.courseId,
    audioFileId,
  });
  const processingStage = await runLectureProcessingStage({
    lectureId: input.lectureId,
    userId: input.userId,
    audioFileId,
    rawTranscriptId: mergeStage.rawTranscript.id,
    lectureContext,
    transcriptText: mergeStage.mergedTranscript.fullText,
    transcriptSegments: mergeStage.mergedTranscript.segments,
  });

  await runLectureEmbeddingsStage({
    lectureId: input.lectureId,
    userId: input.userId,
    processedTranscriptId: processingStage.processedTranscriptId,
    processedTranscript: processingStage.processedTranscript,
  });

  await updateLectureStatus(input.lectureId, 'ready');

  const transcript = await getProcessedTranscriptForLecture(input.lectureId);

  if (!transcript) {
    throw new HttpError(500, 'Failed to load the processed merged lecture transcript.');
  }

  return transcript;
}

async function rebuildProcessedTranscriptFromSavedTranscript(input: {
  lectureId: string;
  userId: string;
}) {
  const rawTranscript = await getTranscriptForLecture(input.lectureId);
  const transcriptionCheckpoint = await loadLectureTranscriptionCheckpoint(input.lectureId);

  if (
    !rawTranscript ||
    ((!rawTranscript.fullText || rawTranscript.fullText.trim().length === 0) &&
      rawTranscript.segments.length === 0)
  ) {
    return null;
  }

  if (
    transcriptionCheckpoint &&
    transcriptionCheckpoint.completedPartCount < transcriptionCheckpoint.partCount
  ) {
    return null;
  }

  if (rawTranscript.status === 'processing') {
    return null;
  }

  const lectureContext = await loadLecturePipelineContext(input.lectureId);

  if (!lectureContext) {
    throw new HttpError(404, 'Lecture not found.');
  }

  const processingStage = await runLectureProcessingStage({
    lectureId: input.lectureId,
    userId: input.userId,
    audioFileId: rawTranscript.sourceAudioFileId ?? lectureContext.audioFileId,
    rawTranscriptId: rawTranscript.id,
    lectureContext,
    transcriptText: rawTranscript.fullText ?? '',
    transcriptSegments: rawTranscript.segments.map((segment) => ({
      segmentIndex: segment.segmentIndex,
      startTimeSeconds: segment.startTimeSeconds,
      endTimeSeconds: segment.endTimeSeconds,
      rawText: segment.rawText ?? '',
      cleanedText: segment.cleanedText ?? '',
      speakerLabel: segment.speakerLabel ?? 'Speaker 1',
      confidenceScore: segment.confidenceScore,
      tokenCountEstimate: segment.tokenCountEstimate ?? 0,
    })),
  });

  await runLectureEmbeddingsStage({
    lectureId: input.lectureId,
    userId: input.userId,
    processedTranscriptId: processingStage.processedTranscriptId,
    processedTranscript: processingStage.processedTranscript,
  });

  await updateLectureStatus(input.lectureId, 'ready');

  return getProcessedTranscriptForLecture(input.lectureId);
}

async function repairInvalidChunkTranscriptionsFromStoredAudio(input: {
  lectureId: string;
  userId: string;
}) {
  const chunkTranscriptions = await loadChunkTranscriptionsForMerge(input.lectureId);
  const invalidChunks = chunkTranscriptions.filter(
    (chunk) => !hasStoredDiarizedTranscript(chunk.rawDiarizedJson)
  );

  if (invalidChunks.length === 0) {
    return null;
  }

  let latestTranscript: LectureTranscript | null = null;

  for (const chunk of invalidChunks) {
    const processingJob = await createLectureProcessingJob({
      lectureId: input.lectureId,
      userId: input.userId,
      jobType: 'chunk_transcription',
      inputPayload: {
        chunkId: chunk.chunkId,
        chunkIndex: chunk.chunkIndex,
        storagePath: chunk.storagePath,
        bucketName: AUDIO_BUCKET_NAME,
        repair: true,
      },
    });

    latestTranscript = await processLectureChunkTranscriptionJob({
      lectureId: input.lectureId,
      userId: input.userId,
      audioFileId: null,
      chunkId: chunk.chunkId,
      processingJobId: processingJob.id,
    });
  }

  return latestTranscript;
}

async function runLectureMergeStage(input: {
  lectureId: string;
  userId: string;
  courseId: string;
  audioFileId: string | null;
}) {
  const mergeJob = await createLectureProcessingJob({
    lectureId: input.lectureId,
    userId: input.userId,
    jobType: 'merge',
    inputPayload: {
      lectureId: input.lectureId,
    },
  });

  try {
    await markLectureProcessingJobRunning(mergeJob.id);

    const chunkRows = await loadChunkTranscriptionsForMerge(input.lectureId);

    if (chunkRows.length === 0) {
      throw new HttpError(409, 'No completed chunk transcriptions are available for merge.');
    }

    const merged = mergeChunkTranscriptions(
      chunkRows.map((chunk) => ({
        chunkIndex: chunk.chunkIndex,
        durationSeconds: chunk.durationSeconds,
        rawDiarizedJson: chunk.rawDiarizedJson,
      }))
    );

    const mergedAudio = await createMergedLectureAudioArtifact({
      lectureId: input.lectureId,
      courseId: input.courseId,
      userId: input.userId,
      preferredAudioFileId: input.audioFileId,
      chunks: chunkRows.map((chunk) => ({
        chunkIndex: chunk.chunkIndex,
        storagePath: chunk.storagePath,
        durationSeconds: chunk.durationSeconds,
      })),
    });

    const rawTranscript = await saveLectureTranscription({
      lectureId: input.lectureId,
      audioFileId: mergedAudio.audioFileId,
      processingJobId: mergeJob.id,
      status: 'ready',
      transcription: {
        providerName: TRANSCRIPTION_PROVIDER_NAME,
        modelName: TRANSCRIPTION_MODEL_NAME,
        languageCode: resolveMergedTranscriptLanguageCode(chunkRows),
        fullText: merged.fullText,
        confidenceAvg: merged.confidenceAvg,
        totalSegments: merged.totalSegments,
        totalTokensEstimate: merged.totalTokensEstimate,
        rawResponse: {
          mergedFromChunkCount: chunkRows.length,
        },
        segments: merged.segments,
      },
    });

    await markLectureProcessingJobCompleted(mergeJob.id, {
      chunkCount: chunkRows.length,
      audioFileId: mergedAudio.audioFileId,
      mergedAudioObjectPath: mergedAudio.objectPath,
      totalSegments: merged.totalSegments,
      totalTokensEstimate: merged.totalTokensEstimate,
      transcriptId: rawTranscript.id,
    });

    return {
      jobId: mergeJob.id,
      rawTranscript,
      mergedTranscript: merged,
    };
  } catch (error) {
    await markLectureStageFailure(input.lectureId, mergeJob.id, error, 'Lecture chunk merge failed.');
    throw error;
  }
}

async function runLectureProcessingStage(input: {
  lectureId: string;
  userId: string;
  audioFileId: string | null;
  rawTranscriptId: string;
  lectureContext: Awaited<ReturnType<typeof loadLecturePipelineContext>>;
  transcriptText: string;
  transcriptSegments: TranscriptionSegment[];
}) {
  const lectureContext = input.lectureContext;

  if (!lectureContext) {
    throw new HttpError(404, 'Lecture not found.');
  }

  const processingJob = await createLectureProcessingJob({
    lectureId: input.lectureId,
    userId: input.userId,
    jobType: 'processing',
    inputPayload: {
      transcriptId: input.rawTranscriptId,
    },
  });

  try {
    await markLectureProcessingJobRunning(processingJob.id);

    const processedTranscript = await processTranscriptSpeakers({
      courseTitle: lectureContext.courseName,
      courseDescription: lectureContext.courseDescription,
      lectureTitle: lectureContext.title,
      transcriptText: input.transcriptText,
      segments: input.transcriptSegments.map((segment) => ({
        segmentIndex: segment.segmentIndex,
        startTimeSeconds: segment.startTimeSeconds,
        endTimeSeconds: segment.endTimeSeconds,
        rawText: segment.rawText ?? '',
        cleanedText: segment.cleanedText ?? '',
        speakerLabel: segment.speakerLabel ?? 'Speaker 1',
        confidenceScore: segment.confidenceScore,
        tokenCountEstimate: segment.tokenCountEstimate ?? 0,
      })),
    });

    const processedTranscriptId = await upsertProcessedTranscript({
      lectureId: input.lectureId,
      rawTranscriptId: input.rawTranscriptId,
      audioFileId: input.audioFileId,
      processingJobId: processingJob.id,
      processing: processedTranscript,
    });

    await markLectureProcessingJobCompleted(processingJob.id, {
      processedTranscriptId,
      speakerCount: processedTranscript.speakerMap.length,
      paragraphCount: processedTranscript.payload.paragraphs.length,
    });

    return {
      jobId: processingJob.id,
      processedTranscriptId,
      processedTranscript,
    };
  } catch (error) {
    await markLectureStageFailure(input.lectureId, processingJob.id, error, 'Lecture transcript processing failed.');
    throw error;
  }
}

async function runLectureEmbeddingsStage(input: {
  lectureId: string;
  userId: string;
  processedTranscriptId: string;
  processedTranscript: Awaited<ReturnType<typeof processTranscriptSpeakers>>;
}) {
  const embeddingsJob = await createLectureProcessingJob({
    lectureId: input.lectureId,
    userId: input.userId,
    jobType: 'embeddings',
    inputPayload: {
      processedTranscriptId: input.processedTranscriptId,
    },
  });

  try {
    await markLectureProcessingJobRunning(embeddingsJob.id);

    const persistedTranscript = await persistTranscriptChunksForProcessedTranscript({
      lectureId: input.lectureId,
      processedTranscriptId: input.processedTranscriptId,
      payload: input.processedTranscript.payload,
    });

    await markLectureProcessingJobCompleted(embeddingsJob.id, {
      chunkCount: persistedTranscript.chunkCount,
      embeddingModel: persistedTranscript.embeddingModel,
      embeddingDimensions: persistedTranscript.embeddingDimensions,
    });

    return persistedTranscript;
  } catch (error) {
    await markLectureStageFailure(input.lectureId, embeddingsJob.id, error, 'Lecture transcript embeddings failed.');
    throw error;
  }
}

async function loadChunkTranscriptionsForMerge(lectureId: string) {
  const db = getDb();
  const rows = await db<
    {
      chunkId: string;
      chunkIndex: number;
      storagePath: string;
      durationSeconds: number | null;
      rawDiarizedJson: unknown;
    }[]
  >`
    select
      ac.id::text as "chunkId",
      ac.chunk_index as "chunkIndex",
      ac.storage_path as "storagePath",
      ac.duration_seconds as "durationSeconds",
      ct.raw_diarized_json as "rawDiarizedJson"
    from public.audio_chunks ac
    inner join public.chunk_transcriptions ct
      on ct.chunk_id = ac.id
    where ac.lecture_id = ${lectureId}::uuid
      and ac.status = 'done'
    order by ac.chunk_index asc
  `;

  return rows.map((row) => ({
    ...row,
    rawDiarizedJson: normalizeStoredRawDiarizedJson(row.rawDiarizedJson),
  }));
}

async function loadLecturePipelineContext(lectureId: string) {
  const db = getDb();
  const rows = await db<
    {
      lectureId: string;
      courseId: string;
      title: string;
      courseName: string;
      courseDescription: string | null;
      audioFileId: string | null;
    }[]
  >`
    select
      l.id::text as "lectureId",
      l.course_id::text as "courseId",
      l.title,
      c.course_name as "courseName",
      c.description as "courseDescription",
      af.id::text as "audioFileId"
    from public.lectures l
    inner join public.courses c
      on c.id = l.course_id
    left join lateral (
      select id
      from public.audio_files
      where lecture_id = l.id
      order by is_primary desc, uploaded_at desc nulls last, created_at desc nulls last
      limit 1
    ) af on true
    where l.id = ${lectureId}::uuid
    limit 1
  `;

  return rows[0] ?? null;
}

async function getPrimaryAudioFileForLecture(lectureId: string) {
  const db = getDb();
  const rows = await db<
    {
      id: string;
      bucketName: string | null;
      objectPath: string | null;
      originalFilename: string | null;
      mimeType: string | null;
    }[]
  >`
    select
      id::text as id,
      bucket_name as "bucketName",
      object_path as "objectPath",
      original_filename as "originalFilename",
      mime_type as "mimeType"
    from public.audio_files
    where lecture_id = ${lectureId}::uuid
    order by is_primary desc, uploaded_at desc nulls last, created_at desc nulls last
    limit 1
  `;

  return rows[0] ?? null;
}

async function listLectureAudioChunks(lectureId: string) {
  const db = getDb();
  const rows = await db<
    {
      chunkIndex: number;
      storagePath: string;
    }[]
  >`
    select
      chunk_index as "chunkIndex",
      storage_path as "storagePath"
    from public.audio_chunks
    where lecture_id = ${lectureId}::uuid
      and status = 'done'
    order by chunk_index asc
  `;

  return rows;
}

async function getLectureDurationSeconds(lectureId: string) {
  const db = getDb();
  const rows = await db<{ duration_seconds: number | null }[]>`
    select duration_seconds
    from public.lectures
    where id = ${lectureId}::uuid
    limit 1
  `;

  return rows[0]?.duration_seconds ?? null;
}

async function getLectureChunkStatus(lectureId: string) {
  const db = getDb();
  const rows = await db<
    {
      expected_chunk_count: number | null;
      total_chunks: number;
      done_chunks: number;
      failed_chunks: number;
    }[]
  >`
    select
      l.expected_chunk_count,
      count(ac.id)::int as total_chunks,
      count(*) filter (where ac.status = 'done')::int as done_chunks,
      count(*) filter (where ac.status = 'failed')::int as failed_chunks
    from public.lectures l
    left join public.audio_chunks ac
      on ac.lecture_id = l.id
    where l.id = ${lectureId}::uuid
    group by l.id, l.expected_chunk_count
  `;

  const row = rows[0];

  return {
    expectedChunkCount: row?.expected_chunk_count ?? null,
    totalChunks: row?.total_chunks ?? 0,
    doneChunks: row?.done_chunks ?? 0,
    failedChunks: row?.failed_chunks ?? 0,
  };
}

async function getLectureStatus(lectureId: string) {
  const db = getDb();
  const rows = await db<{ status: string }[]>`
    select status
    from public.lectures
    where id = ${lectureId}::uuid
    limit 1
  `;

  return rows[0]?.status ?? 'processing';
}

async function updateLectureStatus(lectureId: string, status: string) {
  const db = getDb();

  await db`
    update public.lectures
    set status = ${status}
    where id = ${lectureId}::uuid
  `;
}

async function markLectureFailed(lectureId: string) {
  await updateLectureStatus(lectureId, 'failed');
}

async function markLectureStageFailure(
  lectureId: string,
  processingJobId: string,
  error: unknown,
  fallbackMessage: string
) {
  const errorMessage = error instanceof Error ? error.message : fallbackMessage;
  await markLectureProcessingJobFailed(processingJobId, errorMessage);
  await markLectureFailed(lectureId);
}

function resolveMergedTranscriptLanguageCode(
  chunks: Array<{
    rawDiarizedJson: Record<string, unknown>;
  }>
) {
  for (const chunk of chunks) {
    const language = chunk.rawDiarizedJson.language;

    if (typeof language === 'string' && language.trim().length > 0) {
      return language.trim();
    }
  }

  return null;
}

function inferChunkMimeType(storagePath: string) {
  const normalized = storagePath.toLowerCase();

  if (normalized.endsWith('.wav')) {
    return 'audio/wav';
  }

  if (normalized.endsWith('.caf')) {
    return 'audio/x-caf';
  }

  return 'audio/mp4';
}

export async function getLectureAudioForUser(
  userId: string,
  lectureId: string
): Promise<LectureAudioDownload> {
  const db = getDb();
  const lectureRows = await db<
    {
      course_id: string;
      audio_file_id: string | null;
      bucket_name: string | null;
      object_path: string | null;
      original_filename: string | null;
      mime_type: string | null;
      file_size_bytes: number | null;
    }[]
  >`
    select
      l.course_id,
      af.id as audio_file_id,
      af.bucket_name,
      af.object_path,
      af.original_filename,
      af.mime_type,
      af.file_size_bytes
    from public.lectures l
    left join lateral (
      select id, bucket_name, object_path, original_filename, mime_type, file_size_bytes
      from public.audio_files
      where lecture_id = l.id
      order by is_primary desc, uploaded_at desc nulls last, created_at desc nulls last
      limit 1
    ) af on true
    where l.id = ${lectureId}::uuid
    limit 1
  `;

  const lecture = lectureRows[0];

  if (!lecture) {
    throw new HttpError(404, 'Lecture not found.');
  }

  await assertUserCanViewCourse(userId, lecture.course_id);

  if (!lecture.audio_file_id || !lecture.bucket_name || !lecture.object_path) {
    const chunkStatus = await getLectureChunkStatus(lectureId);

    if (
      chunkStatus.expectedChunkCount &&
      chunkStatus.totalChunks >= chunkStatus.expectedChunkCount &&
      chunkStatus.doneChunks >= chunkStatus.expectedChunkCount &&
      chunkStatus.failedChunks === 0
    ) {
      const mergedAudio = await ensureImportedLectureAudioFile({
        lectureId,
        userId,
      });

      if (mergedAudio?.bucketName && mergedAudio.objectPath) {
        const audioBytes = await downloadLectureAudio(mergedAudio.bucketName, mergedAudio.objectPath);

        return {
          audioBytes,
          mimeType: mergedAudio.mimeType ?? 'audio/mp4',
          filename: mergedAudio.originalFilename ?? 'lecture-recording.m4a',
          fileSizeBytes: audioBytes.byteLength,
        };
      }
    }

    throw new HttpError(409, 'Lecture audio is not available for download yet.');
  }

  const audioBytes = await downloadLectureAudio(lecture.bucket_name, lecture.object_path);

  return {
    audioBytes,
    mimeType: lecture.mime_type ?? 'audio/mp4',
    filename: lecture.original_filename ?? 'lecture-recording.m4a',
    fileSizeBytes: lecture.file_size_bytes,
  };
}

export async function getLectureAudioDownloadUrlForUser(
  userId: string,
  lectureId: string
): Promise<LectureAudioDownloadUrl> {
  const db = getDb();
  const lectureRows = await db<
    {
      course_id: string;
      audio_file_id: string | null;
      bucket_name: string | null;
      object_path: string | null;
      original_filename: string | null;
      mime_type: string | null;
      file_size_bytes: number | null;
    }[]
  >`
    select
      l.course_id,
      af.id as audio_file_id,
      af.bucket_name,
      af.object_path,
      af.original_filename,
      af.mime_type,
      af.file_size_bytes
    from public.lectures l
    left join lateral (
      select id, bucket_name, object_path, original_filename, mime_type, file_size_bytes
      from public.audio_files
      where lecture_id = l.id
      order by is_primary desc, uploaded_at desc nulls last, created_at desc nulls last
      limit 1
    ) af on true
    where l.id = ${lectureId}::uuid
    limit 1
  `;

  const lecture = lectureRows[0];

  if (!lecture) {
    throw new HttpError(404, 'Lecture not found.');
  }

  await assertUserCanViewCourse(userId, lecture.course_id);

  if (!lecture.audio_file_id || !lecture.bucket_name || !lecture.object_path) {
    throw new HttpError(409, 'Lecture audio is not available for download yet.');
  }

  const supabase = getSupabaseAdminClient();
  const signedUrlResult = await supabase.storage.from(lecture.bucket_name).createSignedUrl(
    lecture.object_path,
    60 * 30,
    {
      download: lecture.original_filename ?? 'lecture-recording.m4a',
    }
  );

  if (signedUrlResult.error || !signedUrlResult.data?.signedUrl) {
    throw new HttpError(
      502,
      'Failed to create lecture audio download URL.',
      signedUrlResult.error?.message
    );
  }

  return {
    signedUrl: signedUrlResult.data.signedUrl,
    mimeType: lecture.mime_type ?? 'audio/mp4',
    filename: lecture.original_filename ?? 'lecture-recording.m4a',
    fileSizeBytes: lecture.file_size_bytes,
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
      af.created_at as audio_created_at,
      pt.id as processed_transcript_id,
      pt.source_transcript_id,
      pt.source_audio_file_id as transcript_source_audio_file_id,
      pt.processing_job_id as transcript_processing_job_id,
      pt.provider_name as transcription_provider,
      pt.model_name as transcript_model_name,
      t.language_code as transcript_language_code,
      pt.formatted_text as transcript_full_text,
      null::numeric as transcript_confidence_avg,
      jsonb_array_length(coalesce(pt.processed_payload->'paragraphs', '[]'::jsonb)) as transcript_total_segments,
      null::integer as transcript_total_tokens_estimate,
      pt.status as transcript_status,
      pt.generated_at as transcript_generated_at,
      pt.created_at as transcript_created_at,
      pt.updated_at as transcript_updated_at,
      coalesce(pt.speaker_map, '[]'::jsonb) as processed_speaker_map,
      pt.processed_payload,
      '[]'::jsonb as transcript_segments
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
    left join public.transcripts t
      on t.lecture_id = l.id
    left join public.processed_transcripts pt
      on pt.lecture_id = l.id
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

async function upsertRunningTranscriptionJob(input: {
  lectureId: string;
  userId: string;
  audioFileId: string;
  bucketName: string;
  objectPath: string;
}) {
  const db = getDb();
  const existingRows = await db<{ id: string; status: string }[]>`
    select id, status
    from public.processing_jobs
    where lecture_id = ${input.lectureId}::uuid
      and job_type = 'transcription'
      and status in ('queued', 'running')
    order by created_at desc
    limit 1
  `;
  const existingJob = existingRows[0];

  if (existingJob) {
    await db`
      update public.processing_jobs
      set
        status = 'running',
        provider_name = ${TRANSCRIPTION_PROVIDER_NAME},
        model_name = ${TRANSCRIPTION_MODEL_NAME},
        input_payload = ${JSON.stringify({
          bucketName: input.bucketName,
          objectPath: input.objectPath,
          audioFileId: input.audioFileId,
        })}::jsonb,
        started_at = coalesce(started_at, timezone('utc', now())),
        error_message = null
      where id = ${existingJob.id}::uuid
    `;

    return existingJob;
  }

  const rows = await db<{ id: string; status: string }[]>`
    insert into public.processing_jobs (
      lecture_id,
      triggered_by_user_id,
      job_type,
      provider_name,
      model_name,
      status,
      input_payload,
      started_at
    ) values (
      ${input.lectureId}::uuid,
      ${input.userId}::uuid,
      'transcription',
      ${TRANSCRIPTION_PROVIDER_NAME},
      ${TRANSCRIPTION_MODEL_NAME},
      'running',
      ${JSON.stringify({
        bucketName: input.bucketName,
        objectPath: input.objectPath,
        audioFileId: input.audioFileId,
      })}::jsonb,
      timezone('utc', now())
    )
    returning id, status
  `;

  const processingJob = rows[0];

  if (!processingJob) {
    throw new HttpError(500, 'Failed to create transcription job.');
  }

  return processingJob;
}

async function downloadLectureAudio(bucketName: string, objectPath: string) {
  const supabase = getSupabaseAdminClient();
  const result = await supabase.storage.from(bucketName).download(objectPath);

  if (result.error) {
    throw new HttpError(502, 'Failed to load lecture audio for transcription.', result.error.message);
  }

  return Buffer.from(await result.data.arrayBuffer());
}

async function saveLectureTranscription(input: {
  lectureId: string;
  audioFileId: string | null;
  processingJobId: string;
  status: 'processing' | 'ready';
  transcription: Awaited<ReturnType<typeof transcribeLectureAudio>>;
}) {
  return persistLectureTranscriptionSnapshot(input);
}

async function persistLectureTranscriptionSnapshot(input: {
  lectureId: string;
  audioFileId: string | null;
  processingJobId: string;
  status: 'processing' | 'ready';
  transcription: Awaited<ReturnType<typeof transcribeLectureAudio>>;
}) {
  const db = getDb();
  const transcriptRows = await db<{ id: string }[]>`
    insert into public.transcripts (
      lecture_id,
      source_audio_file_id,
      processing_job_id,
      transcription_provider,
      model_name,
      language_code,
      full_text,
      confidence_avg,
      total_segments,
      total_tokens_estimate,
      status,
      generated_at
    ) values (
      ${input.lectureId}::uuid,
      ${input.audioFileId ? db`${input.audioFileId}::uuid` : db`null`},
      ${input.processingJobId}::uuid,
      ${input.transcription.providerName},
      ${input.transcription.modelName},
      ${input.transcription.languageCode},
      ${input.transcription.fullText},
      ${input.transcription.confidenceAvg},
      ${input.transcription.totalSegments},
      ${input.transcription.totalTokensEstimate},
      ${input.status},
      timezone('utc', now())
    )
    on conflict (lecture_id) do update
    set
      source_audio_file_id = excluded.source_audio_file_id,
      processing_job_id = excluded.processing_job_id,
      transcription_provider = excluded.transcription_provider,
      model_name = excluded.model_name,
      language_code = excluded.language_code,
      full_text = excluded.full_text,
      confidence_avg = excluded.confidence_avg,
      total_segments = excluded.total_segments,
      total_tokens_estimate = excluded.total_tokens_estimate,
      status = excluded.status,
      generated_at = excluded.generated_at
    returning id
  `;

  const transcriptId = transcriptRows[0]?.id;

  if (!transcriptId) {
    throw new HttpError(500, 'Failed to save lecture transcription.');
  }

  await db`
    delete from public.transcript_segments
    where transcript_id = ${transcriptId}::uuid
  `;

  for (const segment of input.transcription.segments) {
    await insertTranscriptSegment({
      lectureId: input.lectureId,
      transcriptId,
      segment,
    });
  }

  const transcript = await getTranscriptForLecture(input.lectureId);

  if (!transcript) {
    throw new HttpError(500, 'Failed to load saved lecture transcription.');
  }

  return transcript;
}

async function loadLectureTranscriptionCheckpoint(lectureId: string) {
  const db = getDb();
  const rows = await db<{ output_payload: unknown }[]>`
    select pj.output_payload
    from public.processing_jobs pj
    where pj.lecture_id = ${lectureId}::uuid
      and pj.job_type = 'transcription'
      and pj.output_payload is not null
    order by pj.created_at desc
    limit 1
  `;

  const outputPayload = rows[0]?.output_payload;

  if (!outputPayload || typeof outputPayload !== 'object') {
    return null;
  }

  const payload = outputPayload as Record<string, unknown>;
  const chunkResultsValue = payload.chunkResults;

  if (!Array.isArray(chunkResultsValue)) {
    return null;
  }

  const chunkResults = chunkResultsValue
    .map((chunkResult) => {
      if (!chunkResult || typeof chunkResult !== 'object') {
        return null;
      }

      const record = chunkResult as Record<string, unknown>;
      const rawDiarizedJson = record.rawDiarizedJson;

      if (!rawDiarizedJson || typeof rawDiarizedJson !== 'object') {
        return null;
      }

      return {
        chunkIndex: readNonNegativeInteger(record.chunkIndex, 'chunkIndex'),
        durationSeconds:
          record.durationSeconds == null ? null : readOptionalNonNegativeNumber(record.durationSeconds, 'durationSeconds'),
        rawDiarizedJson: rawDiarizedJson as RawDiarizedTranscription,
      };
    })
    .filter(
      (chunkResult): chunkResult is {
        chunkIndex: number;
        durationSeconds: number | null;
        rawDiarizedJson: RawDiarizedTranscription;
      } => chunkResult != null
    );

  if (chunkResults.length === 0) {
    return null;
  }

  const completedPartCount = readNonNegativeInteger(payload.completedPartCount ?? chunkResults.length, 'completedPartCount');
  const partCount = readStrictPositiveInteger(payload.partCount ?? chunkResults.length, 'partCount');
  const fullText = typeof payload.fullText === 'string' ? payload.fullText : '';
  const languageCode = typeof payload.languageCode === 'string' && payload.languageCode.trim().length > 0 ? payload.languageCode : null;
  const totalSegments = readNonNegativeInteger(payload.totalSegments ?? 0, 'totalSegments');
  const totalTokensEstimate = readNonNegativeInteger(payload.totalTokensEstimate ?? 0, 'totalTokensEstimate');
  const confidenceAvg =
    payload.confidenceAvg == null ? null : readOptionalNonNegativeNumber(payload.confidenceAvg, 'confidenceAvg');

  return {
    completedPartCount,
    partCount,
    chunkResults,
    fullText,
    languageCode,
    totalSegments,
    totalTokensEstimate,
    confidenceAvg,
  };
}

async function updateTranscriptionJobCheckpoint(processingJobId: string, checkpointPayload: Record<string, unknown>) {
  const db = getDb();

  await db`
    update public.processing_jobs
    set
      output_payload = ${JSON.stringify(checkpointPayload)}::jsonb,
      updated_at = timezone('utc', now())
    where id = ${processingJobId}::uuid
  `;
}

async function insertTranscriptSegment(input: {
  lectureId: string;
  transcriptId: string;
  segment: TranscriptionSegment;
}) {
  const db = getDb();

  await db`
    insert into public.transcript_segments (
      transcript_id,
      lecture_id,
      segment_index,
      start_time_seconds,
      end_time_seconds,
      raw_text,
      cleaned_text,
      speaker_label,
      confidence_score,
      token_count_estimate
    ) values (
      ${input.transcriptId}::uuid,
      ${input.lectureId}::uuid,
      ${input.segment.segmentIndex},
      ${input.segment.startTimeSeconds},
      ${input.segment.endTimeSeconds},
      ${input.segment.rawText},
      ${input.segment.cleanedText},
      ${input.segment.speakerLabel},
      ${input.segment.confidenceScore},
      ${input.segment.tokenCountEstimate}
    )
  `;
}

async function markTranscriptionFailed(input: {
  lectureId: string;
  processingJobId: string;
  errorMessage: string;
}) {
  const db = getDb();

  await db`
    update public.processing_jobs
    set
      status = 'failed',
      error_message = ${input.errorMessage},
      completed_at = timezone('utc', now())
    where id = ${input.processingJobId}::uuid
  `;

  await db`
    update public.lectures
    set status = 'failed'
    where id = ${input.lectureId}::uuid
  `;

  await db`
    update public.transcripts
    set
      status = 'failed',
      processing_job_id = ${input.processingJobId}::uuid
    where lecture_id = ${input.lectureId}::uuid
  `;

  await db`
    update public.processed_transcripts
    set
      status = 'failed',
      processing_job_id = ${input.processingJobId}::uuid
    where lecture_id = ${input.lectureId}::uuid
  `;
}

async function getProcessedTranscriptForLecture(lectureId: string) {
  const db = getDb();
  const rows = await db<DbProcessedTranscriptRow[]>`
    select
      pt.id as processed_transcript_id,
      pt.lecture_id as processed_transcript_lecture_id,
      pt.source_transcript_id,
      pt.source_audio_file_id as processed_source_audio_file_id,
      pt.processing_job_id as processed_processing_job_id,
      pt.provider_name as processed_provider_name,
      pt.model_name as processed_model_name,
      t.language_code as transcript_language_code,
      pt.formatted_text,
      pt.speaker_map,
      pt.processed_payload,
      pt.status as processed_status,
      pt.generated_at as processed_generated_at,
      pt.created_at as processed_created_at,
      pt.updated_at as processed_updated_at
    from public.processed_transcripts pt
    inner join public.transcripts t
      on t.id = pt.source_transcript_id
    where pt.lecture_id = ${lectureId}::uuid
    limit 1
  `;

  return rows[0] ? mapProcessedTranscriptRow(rows[0]) : null;
}

async function getTranscriptForLecture(lectureId: string) {
  const db = getDb();
  const rows = await db<DbLectureTranscriptRow[]>`
    select
      t.id as transcript_id,
      t.lecture_id as transcript_lecture_id,
      t.source_audio_file_id as transcript_source_audio_file_id,
      t.processing_job_id as transcript_processing_job_id,
      t.transcription_provider,
      t.model_name as transcript_model_name,
      t.language_code as transcript_language_code,
      t.full_text as transcript_full_text,
      t.confidence_avg as transcript_confidence_avg,
      t.total_segments as transcript_total_segments,
      t.total_tokens_estimate as transcript_total_tokens_estimate,
      t.status as transcript_status,
      t.generated_at as transcript_generated_at,
      t.created_at as transcript_created_at,
      t.updated_at as transcript_updated_at,
      coalesce(ts.segments, '[]'::jsonb) as transcript_segments
    from public.transcripts t
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'id', segment.id,
          'segmentIndex', segment.segment_index,
          'startTimeSeconds', segment.start_time_seconds,
          'endTimeSeconds', segment.end_time_seconds,
          'rawText', segment.raw_text,
          'cleanedText', segment.cleaned_text,
          'speakerLabel', segment.speaker_label,
          'confidenceScore', segment.confidence_score,
          'tokenCountEstimate', segment.token_count_estimate,
          'isKeyMoment', segment.is_key_moment,
          'createdAt', segment.created_at
        )
        order by segment.segment_index
      ) as segments
      from public.transcript_segments segment
      where segment.transcript_id = t.id
    ) ts on true
    where t.lecture_id = ${lectureId}::uuid
    limit 1
  `;

  return rows[0] ? mapLectureTranscriptRow(rows[0]) : null;
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
  processed_transcript_id: string | null;
  source_transcript_id: string | null;
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
  processed_speaker_map: unknown;
  processed_payload: unknown;
  transcript_segments: DbTranscriptSegmentJson[];
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
    transcript: row.processed_transcript_id ? mapLectureTranscriptRow(row) : null,
  };
}

type DbTranscriptSegmentJson = {
  id: string;
  segmentIndex: number;
  startTimeSeconds: number | string | null;
  endTimeSeconds: number | string | null;
  rawText: string | null;
  cleanedText: string | null;
  speakerLabel: string | null;
  confidenceScore: number | string | null;
  tokenCountEstimate: number | null;
  isKeyMoment: boolean;
  createdAt: string | null;
};

type DbLectureTranscriptRow = {
  transcript_id: string;
  transcript_lecture_id: string;
  transcript_source_audio_file_id: string | null;
  transcript_processing_job_id: string | null;
  transcription_provider: string | null;
  transcript_model_name: string | null;
  transcript_language_code: string | null;
  transcript_full_text: string | null;
  transcript_confidence_avg: number | string | null;
  transcript_total_segments: number | null;
  transcript_total_tokens_estimate: number | null;
  transcript_status: string;
  transcript_generated_at: string | null;
  transcript_created_at: string | null;
  transcript_updated_at: string | null;
  transcript_segments: DbTranscriptSegmentJson[];
};

type DbProcessedTranscriptRow = {
  processed_transcript_id: string;
  processed_transcript_lecture_id: string;
  source_transcript_id: string | null;
  processed_source_audio_file_id: string | null;
  processed_processing_job_id: string | null;
  processed_provider_name: string | null;
  processed_model_name: string | null;
  transcript_language_code: string | null;
  formatted_text: string | null;
  speaker_map: unknown;
  processed_payload: unknown;
  processed_status: string;
  processed_generated_at: string | null;
  processed_created_at: string | null;
  processed_updated_at: string | null;
};

function mapProcessedTranscriptRow(row: DbProcessedTranscriptRow): LectureTranscript {
  const processedPayload = readProcessedTranscriptPayload(row.processed_payload);
  const speakerMap = readProcessedSpeakerMap(row.speaker_map, processedPayload);
  const formattedText = row.formatted_text ?? processedPayload?.formattedText ?? null;

  return {
    id: row.processed_transcript_id,
    lectureId: row.processed_transcript_lecture_id,
    sourceTranscriptId: row.source_transcript_id,
    sourceAudioFileId: row.processed_source_audio_file_id,
    processingJobId: row.processed_processing_job_id,
    transcriptionProvider: row.processed_provider_name,
    modelName: row.processed_model_name,
    languageCode: row.transcript_language_code,
    fullText: formattedText,
    confidenceAvg: null,
    totalSegments: processedPayload?.paragraphs.length ?? null,
    totalTokensEstimate: formattedText ? estimateTokenCount(formattedText) : null,
    status: row.processed_status,
    generatedAt: row.processed_generated_at,
    createdAt: row.processed_created_at,
    updatedAt: row.processed_updated_at,
    speakerMap,
    processedPayload,
    segments: [],
  };
}

function mapLectureTranscriptRow(row: DbLectureTranscriptRow | DbLectureRecordingRow): LectureTranscript {
  const isProcessedRecordingRow = 'processed_transcript_id' in row;
  const processedPayload = isProcessedRecordingRow ? readProcessedTranscriptPayload(row.processed_payload) : null;
  const speakerMap = isProcessedRecordingRow
    ? readProcessedSpeakerMap(row.processed_speaker_map, processedPayload)
    : [];
  const formattedText = row.transcript_full_text ?? processedPayload?.formattedText ?? null;

  return {
    id: isProcessedRecordingRow ? row.processed_transcript_id ?? '' : row.transcript_id ?? '',
    lectureId: 'transcript_lecture_id' in row ? row.transcript_lecture_id : row.lecture_id,
    sourceTranscriptId: isProcessedRecordingRow ? row.source_transcript_id : null,
    sourceAudioFileId: row.transcript_source_audio_file_id,
    processingJobId: row.transcript_processing_job_id,
    transcriptionProvider: row.transcription_provider,
    modelName: row.transcript_model_name,
    languageCode: row.transcript_language_code,
    fullText: formattedText,
    confidenceAvg: readNullableNumber(row.transcript_confidence_avg),
    totalSegments: row.transcript_total_segments ?? processedPayload?.paragraphs.length ?? null,
    totalTokensEstimate: row.transcript_total_tokens_estimate ?? (formattedText ? estimateTokenCount(formattedText) : null),
    status: row.transcript_status ?? 'processing',
    generatedAt: row.transcript_generated_at,
    createdAt: row.transcript_created_at,
    updatedAt: row.transcript_updated_at,
    speakerMap,
    processedPayload,
    segments: row.transcript_segments.map((segment) => ({
      id: segment.id,
      segmentIndex: segment.segmentIndex,
      startTimeSeconds: readNullableNumber(segment.startTimeSeconds),
      endTimeSeconds: readNullableNumber(segment.endTimeSeconds),
      rawText: segment.rawText,
      cleanedText: segment.cleanedText,
      speakerLabel: segment.speakerLabel,
      confidenceScore: readNullableNumber(segment.confidenceScore),
      tokenCountEstimate: segment.tokenCountEstimate,
      isKeyMoment: segment.isKeyMoment,
      createdAt: segment.createdAt,
    })),
  };
}

function estimateTokenCount(text: string) {
  if (!text.trim()) {
    return 0;
  }

  return Math.ceil(text.trim().split(/\s+/).length * 1.33);
}

function readProcessedTranscriptPayload(value: unknown): ProcessedTranscriptPayload | null {
  const parsed = readJsonObject(value);

  if (!parsed) {
    return null;
  }

  const speakers = Array.isArray(parsed.speakers)
    ? (parsed.speakers as ProcessedTranscriptSpeaker[])
    : [];
  const paragraphs = Array.isArray(parsed.paragraphs)
    ? (parsed.paragraphs as ProcessedTranscriptPayload['paragraphs'])
    : [];
  const formattedText = typeof parsed.formattedText === 'string' ? parsed.formattedText : '';

  if (speakers.length === 0 && paragraphs.length === 0 && formattedText.length === 0) {
    return null;
  }

  return {
    speakers,
    paragraphs,
    formattedText,
  };
}

function readProcessedSpeakerMap(
  value: unknown,
  processedPayload: ProcessedTranscriptPayload | null
): ProcessedTranscriptSpeaker[] {
  if (Array.isArray(value)) {
    return value as ProcessedTranscriptSpeaker[];
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed as ProcessedTranscriptSpeaker[];
      }
    } catch {
      return processedPayload?.speakers ?? [];
    }
  }

  return processedPayload?.speakers ?? [];
}

function readJsonObject(value: unknown): Record<string, unknown> | null {
  if (value == null) {
    return null;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  return typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function hasCanonicalSpeakerLabels(fullText: string | null) {
  if (!fullText) {
    return false;
  }

  return /^(Professor|Student [A-Z]|Unknown Speaker [A-Z]):\s+/m.test(fullText);
}

function isProcessedTranscriptReadyForDisplay(transcript: LectureTranscript | null | undefined) {
  return Boolean(
    transcript &&
      transcript.status === 'ready' &&
      transcript.fullText &&
      transcript.fullText.trim().length > 0 &&
      hasCanonicalSpeakerLabels(transcript.fullText)
  );
}

function hasStoredDiarizedTranscript(value: Record<string, unknown> | null) {
  if (!value) {
    return false;
  }

  if (typeof value.text === 'string' && value.text.trim().length > 0) {
    return true;
  }

  return Array.isArray(value.segments) && value.segments.length > 0;
}

function isRetryableLectureTranscriptionError(error: unknown) {
  if (!(error instanceof HttpError)) {
    return true;
  }

  if ([429, 502, 503, 504].includes(error.statusCode)) {
    return true;
  }

  if (error.statusCode < 500) {
    return false;
  }

  const errorDetails = error.details;
  const serializedDetails =
    typeof errorDetails === 'string'
      ? errorDetails
      : errorDetails != null
        ? JSON.stringify(errorDetails)
        : '';

  return /rate_limit|too many requests|temporarily unavailable/i.test(serializedDetails);
}

async function delay(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function logTranscriptionStep(message: string, payload: Record<string, unknown>) {
  console.log(`${TRANSCRIPTION_LOG_PREFIX} ${message}`, payload);
}

function buildLogPreview(value: unknown) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);

  if (serialized.length <= 2000) {
    return serialized;
  }

  return `${serialized.slice(0, 2000)}... [truncated]`;
}

function normalizeStoredRawDiarizedJson(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;

      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }

  return {};
}

async function createMergedLectureAudioArtifact(input: {
  lectureId: string;
  courseId: string;
  userId: string;
  preferredAudioFileId: string | null;
  chunks: Array<{
    chunkIndex: number;
    storagePath: string;
    durationSeconds: number | null;
  }>;
}) {
  const orderedChunks = input.chunks.slice().sort((left, right) => left.chunkIndex - right.chunkIndex);

  if (orderedChunks.length === 0) {
    throw new HttpError(409, 'No lecture audio chunks are available to merge.');
  }

  const mergedAudioBytes = await concatenateLectureChunks(
    orderedChunks.map((chunk) => ({
      filename: chunk.storagePath.split('/').pop() ?? `chunk-${chunk.chunkIndex}.m4a`,
      bytesPromise: downloadLectureAudio(AUDIO_BUCKET_NAME, chunk.storagePath),
    }))
  );

  const objectPath = buildMergedAudioObjectPath(input.userId, input.courseId, input.lectureId);
  const supabase = getSupabaseAdminClient();
  const uploadResult = await supabase.storage.from(AUDIO_BUCKET_NAME).upload(objectPath, mergedAudioBytes, {
    contentType: 'audio/mp4',
    upsert: true,
  });

  if (uploadResult.error) {
    throw new HttpError(502, 'Failed to store merged lecture audio.', uploadResult.error.message);
  }

  const audioFileId = await upsertMergedLectureAudioFile({
    lectureId: input.lectureId,
    userId: input.userId,
    preferredAudioFileId: input.preferredAudioFileId,
    bucketName: AUDIO_BUCKET_NAME,
    objectPath,
    originalFilename: 'lecture-recording.m4a',
    mimeType: 'audio/mp4',
    fileSizeBytes: mergedAudioBytes.byteLength,
    durationSeconds: orderedChunks.reduce(
      (totalSeconds, chunk) => totalSeconds + Math.max(0, chunk.durationSeconds ?? 0),
      0
    ) || null,
  });

  return {
    audioFileId,
    objectPath,
  };
}

async function concatenateLectureChunks(input: Array<{ filename: string; bytesPromise: Promise<Buffer> }>) {
  if (input.length === 1) {
    return input[0].bytesPromise;
  }

  if (!ffmpegPath) {
    throw new HttpError(500, 'FFmpeg is unavailable on the API server.');
  }

  const tempDirectory = await mkdtemp(join(tmpdir(), 'lectrai-audio-merge-'));

  try {
    const concatEntries: string[] = [];

    for (const [index, chunk] of input.entries()) {
      const chunkPath = join(tempDirectory, `${String(index).padStart(4, '0')}-${sanitizeFilename(chunk.filename)}`);
      await writeFile(chunkPath, await chunk.bytesPromise);
      concatEntries.push(`file '${escapeFfmpegConcatPath(chunkPath)}'`);
    }

    const concatListPath = join(tempDirectory, 'chunks.txt');
    const outputPath = join(tempDirectory, 'lecture-recording.m4a');
    await writeFile(concatListPath, `${concatEntries.join('\n')}\n`);

    try {
      await execFileAsync(ffmpegPath, [
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        concatListPath,
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        '-y',
        outputPath,
      ]);
    } catch (error) {
      const stderr = error && typeof error === 'object' && 'stderr' in error ? String((error as { stderr?: unknown }).stderr ?? '') : '';
      throw new HttpError(502, 'Failed to concatenate lecture audio chunks.', stderr || 'ffmpeg concat command failed.');
    }

    return readFile(outputPath);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

async function splitAudioForTranscription(input: {
  lectureId: string;
  userId: string;
  audioBytes: Buffer;
  mimeType: string;
  filename: string;
  durationSeconds: number | null;
}) {
  if (!ffmpegPath) {
    throw new HttpError(500, 'FFmpeg is unavailable on the API server.');
  }

  const totalDurationSeconds =
    input.durationSeconds != null && Number.isFinite(input.durationSeconds) && input.durationSeconds > 0
      ? input.durationSeconds
      : Math.max(1, Math.ceil(input.audioBytes.byteLength / SAFE_OPENAI_TRANSCRIPTION_CHUNK_BYTES) * 60);
  const estimatedPartCount = Math.max(
    2,
    Math.ceil(input.audioBytes.byteLength / SAFE_OPENAI_TRANSCRIPTION_CHUNK_BYTES)
  );
  const segmentDurationSeconds = Math.max(60, Math.ceil(totalDurationSeconds / estimatedPartCount));
  const tempDirectory = await mkdtemp(join(tmpdir(), 'lectrai-transcribe-split-'));

  try {
    const extension = input.filename.match(/\.[a-z0-9]+$/i)?.[0] ?? '.m4a';
    const sourcePath = join(tempDirectory, `source${extension}`);
    const outputPattern = join(tempDirectory, `part-%03d${extension}`);
    await writeFile(sourcePath, input.audioBytes);

    try {
      await execFileAsync(ffmpegPath, [
        '-i',
        sourcePath,
        '-f',
        'segment',
        '-segment_time',
        String(segmentDurationSeconds),
        '-c',
        'copy',
        '-reset_timestamps',
        '1',
        outputPattern,
      ]);
    } catch (error) {
      const stderr =
        error && typeof error === 'object' && 'stderr' in error
          ? String((error as { stderr?: unknown }).stderr ?? '')
          : '';
      throw new HttpError(502, 'Failed to split lecture audio for transcription.', stderr || 'ffmpeg segment command failed.');
    }

    const partFiles = Array.from({ length: estimatedPartCount + 8 }, (_, index) =>
      join(tempDirectory, `part-${String(index).padStart(3, '0')}${extension}`)
    );
    const audioParts = [];

    for (const partPath of partFiles) {
      try {
        const bytes = await readFile(partPath);

        if (bytes.byteLength === 0) {
          continue;
        }

        audioParts.push({
          filename: partPath.split('/').pop() ?? `part-${audioParts.length}${extension}`,
          audioBytes: bytes,
        });
      } catch {
        // Ignore missing part paths.
      }
    }

    if (audioParts.length === 0) {
      throw new HttpError(500, 'Lecture audio split produced no transcription parts.');
    }

    return audioParts;
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

async function concatenateLectureByteParts(input: Array<{ bytesPromise: Promise<Buffer> }>) {
  const buffers = await Promise.all(input.map((entry) => entry.bytesPromise));
  return Buffer.concat(buffers);
}

async function upsertMergedLectureAudioFile(input: {
  lectureId: string;
  userId: string;
  preferredAudioFileId: string | null;
  bucketName: string;
  objectPath: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  durationSeconds: number | null;
}) {
  const db = getDb();
  const audioFileId = input.preferredAudioFileId ?? crypto.randomUUID();
  const rows = await db<{ id: string }[]>`
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
      is_primary,
      upload_status,
      uploaded_at
    ) values (
      ${audioFileId}::uuid,
      ${input.lectureId}::uuid,
      ${input.userId}::uuid,
      'gcs',
      ${input.bucketName},
      ${input.objectPath},
      ${input.originalFilename},
      ${input.mimeType},
      ${input.fileSizeBytes},
      ${input.durationSeconds},
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
      is_primary = excluded.is_primary,
      upload_status = excluded.upload_status,
      uploaded_at = excluded.uploaded_at
    returning id::text as id
  `;

  const row = rows[0];

  if (!row?.id) {
    throw new HttpError(500, 'Failed to save merged lecture audio metadata.');
  }

  return row.id;
}

function buildMergedAudioObjectPath(userId: string, courseId: string, lectureId: string) {
  return `${userId}/${courseId}/${lectureId}/merged/lecture-recording.m4a`;
}

function escapeFfmpegConcatPath(path: string) {
  return path.replace(/'/g, `'\\''`);
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function readNullableNumber(value: number | string | null) {
  if (value == null) {
    return null;
  }

  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function buildObjectPath(userId: string, courseId: string, lectureId: string, filename: string) {
  return `${userId}/${courseId}/${lectureId}/${Date.now()}-${sanitizeFilename(filename)}`;
}

function buildChunkObjectPath(
  userId: string,
  courseId: string,
  lectureId: string,
  chunkIndex: number,
  filename: string
) {
  return `${userId}/${courseId}/${lectureId}/chunks/${String(chunkIndex).padStart(4, '0')}-${sanitizeFilename(filename)}`;
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

function readStrictPositiveInteger(value: unknown, fieldName: string) {
  const normalized = readPositiveInteger(value, fieldName);

  if (normalized <= 0) {
    throw new HttpError(400, `${fieldName} must be greater than zero.`);
  }

  return normalized;
}

function readNonNegativeInteger(value: unknown, fieldName: string) {
  return readPositiveInteger(value, fieldName);
}

function readOptionalNonNegativeNumber(value: unknown, fieldName: string) {
  if (value == null) {
    return null;
  }

  const normalized = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new HttpError(400, `${fieldName} must be a non-negative number when provided.`);
  }

  return normalized;
}

function readChunkUploadMode(value: unknown): LectureChunkUploadInput['chunkUploadMode'] {
  if (value === 'assemble_only') {
    return 'assemble_only';
  }

  return 'transcribe';
}
