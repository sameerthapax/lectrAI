import { authorizedRequest } from './auth-api';

export type UploadCourseFilePayload = {
  courseFileId: string;
  title: string;
  description: string;
  relationType: 'lecture_file' | 'module_file' | 'chapter_file' | 'notes' | 'other';
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  fileBase64: string;
};

export type UploadedCourseFileResponse = {
  file: {
    id: string;
    courseId: string;
    uploadedByUserId: string;
    title: string;
    description: string | null;
    relationType: 'lecture_file' | 'module_file' | 'chapter_file' | 'notes' | 'other';
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
};

export function uploadCourseFile(
  courseId: string,
  payload: UploadCourseFilePayload,
  accessToken: string
) {
  return authorizedRequest<UploadedCourseFileResponse>(
    `/courses/${courseId}/files`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    accessToken
  );
}

export function fetchCourseFiles(courseId: string, accessToken: string) {
  return authorizedRequest<{ files: UploadedCourseFileResponse['file'][] }>(
    `/courses/${courseId}/files`,
    {
      method: 'GET',
    },
    accessToken
  );
}
