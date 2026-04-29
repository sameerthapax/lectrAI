import { authorizedRequest, binaryRequestFromUrl } from './auth-api';

const LECTURE_TRANSCRIPTION_REQUEST_TIMEOUT_MS = 120_000;
const LECTURE_AUDIO_DOWNLOAD_TIMEOUT_MS = 180_000;

export type RemoteRecordingSyncPayload = {
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

export type RemoteLectureChunkUploadPayload = {
  audioFileId: string;
  courseId: string;
  title: string;
  recordedAt: string;
  durationSeconds: number;
  expectedChunkCount: number;
  chunkIndex: number;
  chunkDurationSeconds: number;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  audioBase64: string;
  chunkUploadMode?: 'transcribe' | 'assemble_only';
};

export type RemoteRecordingSyncResult = {
  lecture: {
    id: string;
    status: string;
  };
  audioFile: {
    id: string;
    bucketName: string;
    objectPath: string;
    uploadStatus: string;
  };
  processingJob: {
    id: string;
    jobType: string;
    status: string;
  };
  transcript: RemoteLectureTranscript | null;
};

export type RemoteLectureChunkUploadResult = {
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
  transcript: RemoteLectureTranscript | null;
};

export type RemoteLectureTranscriptSegment = {
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

export type RemoteLectureTranscript = {
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
  speakerMap: Array<{
    originalLabel: string;
    role: 'professor' | 'student' | 'unknown';
    displayName: string;
    confidence: number;
    rationale: string;
  }>;
  processedPayload: unknown;
  segments: RemoteLectureTranscriptSegment[];
};

export type RemoteLectureRecordingRecord = {
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
  transcript: RemoteLectureTranscript | null;
};

type RemoteLectureAudioDownloadUrlResponse = {
  signedUrl: string;
  mimeType: string;
  filename: string;
  fileSizeBytes: number | null;
};

export function uploadLectureRecording(
  payload: RemoteRecordingSyncPayload,
  accessToken: string
) {
  return authorizedRequest<RemoteRecordingSyncResult>(
    '/lectures/recordings',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    accessToken
  );
}

export function uploadLectureChunk(
  lectureId: string,
  payload: RemoteLectureChunkUploadPayload,
  accessToken: string
) {
  return authorizedRequest<RemoteLectureChunkUploadResult>(
    `/lectures/${encodeURIComponent(lectureId)}/chunks`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    accessToken
  );
}

export async function fetchLectureRecordings(accessToken: string, courseId?: string) {
  const query = courseId ? `?courseId=${encodeURIComponent(courseId)}` : '';
  const response = await authorizedRequest<{ lectures: RemoteLectureRecordingRecord[] }>(
    `/lectures${query}`,
    {
      method: 'GET',
    },
    accessToken
  );

  return response.lectures;
}

export async function processLectureTranscription(lectureId: string, accessToken: string) {
  return authorizedRequest<{
    lecture: {
      id: string;
      status: string;
    };
    transcript: RemoteLectureTranscript;
  }>(
    `/lectures/${encodeURIComponent(lectureId)}/transcription`,
    {
      method: 'POST',
    },
    accessToken,
    { timeoutMs: LECTURE_TRANSCRIPTION_REQUEST_TIMEOUT_MS }
  );
}

export function downloadLectureAudio(lectureId: string, accessToken: string) {
  return authorizedRequest<RemoteLectureAudioDownloadUrlResponse>(
    `/lectures/${encodeURIComponent(lectureId)}/audio-url`,
    {
      method: 'GET',
    },
    accessToken,
    { timeoutMs: LECTURE_AUDIO_DOWNLOAD_TIMEOUT_MS }
  ).then((audio) =>
    binaryRequestFromUrl(audio.signedUrl, {
      timeoutMs: LECTURE_AUDIO_DOWNLOAD_TIMEOUT_MS,
    })
  );
}
