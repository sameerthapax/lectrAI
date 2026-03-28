import type { Request, Response } from 'express';
import {
  createCourseForUser,
  deleteCourseForUser,
  listCoursesForUser,
  parseCourseInput,
  updateCourseForUser,
} from './courses.service.js';

function requireAuthUserId(request: Request) {
  const userId = request.authUser?.id;

  if (!userId) {
    throw new Error('Authenticated user id missing from request context.');
  }

  return userId;
}

export async function getCourses(request: Request, response: Response) {
  const courses = await listCoursesForUser(requireAuthUserId(request));
  response.status(200).json({ courses });
}

export async function postCourse(request: Request, response: Response) {
  const input = parseCourseInput(request.body);
  const course = await createCourseForUser(requireAuthUserId(request), input);
  response.status(201).json({ course });
}

export async function patchCourse(request: Request, response: Response) {
  const input = parseCourseInput(request.body);
  const course = await updateCourseForUser(
    requireAuthUserId(request),
    request.params.courseId,
    input
  );

  response.status(200).json({ course });
}

export async function deleteCourse(request: Request, response: Response) {
  await deleteCourseForUser(requireAuthUserId(request), request.params.courseId);
  response.status(204).send();
}
