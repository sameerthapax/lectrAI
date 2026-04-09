import { authorizedRequest } from './auth-api';

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
