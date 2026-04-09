import type { Request, Response } from 'express';
import {
  createLectureRecordingForUser,
  listLectureRecordingsForUser,
  parseLectureRecordingInput,
} from './lectures.service.js';

function requireAuthUserId(request: Request) {
  const userId = request.authUser?.id;

  if (!userId) {
    throw new Error('Authenticated user id missing from request context.');
  }

  return userId;
}

export async function getLectures(request: Request, response: Response) {
  const courseId =
    typeof request.query.courseId === 'string' && request.query.courseId.length > 0
      ? request.query.courseId
      : undefined;
  const lectures = await listLectureRecordingsForUser(requireAuthUserId(request), courseId);
  response.status(200).json({ lectures });
}

export async function postLectureRecording(request: Request, response: Response) {
  const input = parseLectureRecordingInput(request.body);
  const result = await createLectureRecordingForUser(requireAuthUserId(request), input);
  response.status(201).json(result);
}
