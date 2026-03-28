import { authorizedRequest } from './auth-api';

export type RemoteCoursePayload = {
  courseCode: string;
  courseName: string;
  instructorName: string;
  semesterTerm: 'Winter' | 'Spring' | 'Summer' | 'Fall';
  semesterYear: number;
  section: string;
  description: string;
  colorHex: string;
};

export type RemoteCourseRecord = {
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

export async function fetchCourses(accessToken: string) {
  const response = await authorizedRequest<{ courses: RemoteCourseRecord[] }>(
    '/courses',
    { method: 'GET' },
    accessToken
  );

  return response.courses;
}

export async function createCourse(accessToken: string, payload: RemoteCoursePayload) {
  const response = await authorizedRequest<{ course: RemoteCourseRecord }>(
    '/courses',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    accessToken
  );

  return response.course;
}

export async function updateCourse(
  accessToken: string,
  courseId: string,
  payload: RemoteCoursePayload
) {
  const response = await authorizedRequest<{ course: RemoteCourseRecord }>(
    `/courses/${courseId}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    accessToken
  );

  return response.course;
}

export async function deleteCourse(accessToken: string, courseId: string) {
  await authorizedRequest<void>(
    `/courses/${courseId}`,
    {
      method: 'DELETE',
    },
    accessToken
  );
}
