import type { AuthUser } from './auth-api';
import { fetchCourseFiles } from './course-files-api';
import { upsertRemoteCourseFiles } from './course-files-repository';
import { fetchCourses } from './courses-api';
import { replaceCoursesForUser } from './courses-repository';
import { fetchLectureRecordings } from './recordings-api';
import { upsertRemoteLectureRecordings } from './recordings-repository';

export async function bootstrapLocalCacheFromApi(user: AuthUser, accessToken: string) {
  const courses = await fetchCourses(accessToken);
  await replaceCoursesForUser(user, courses);

  const lecturesPromise = fetchLectureRecordings(accessToken);
  const courseFilesPromises = courses.map(async (course) => {
    const response = await fetchCourseFiles(course.id, accessToken);
    await upsertRemoteCourseFiles(user, response.files);
  });

  const [lectures] = await Promise.all([lecturesPromise, Promise.all(courseFilesPromises)]);
  await upsertRemoteLectureRecordings(user, lectures, accessToken);
}
