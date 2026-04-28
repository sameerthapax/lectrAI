import type { Request, Response } from 'express';
import { HttpError } from '../../lib/http-error.js';
import {
  createLectureChunkForUser,
  createLectureRecordingForUser,
  getLectureAudioForUser,
  listLectureRecordingsForUser,
  parseLectureChunkUploadInput,
  parseLectureRecordingInput,
  processLectureTranscriptionForUser,
} from './lectures.service.js';

function requireAuthUserId(request: Request) {
  const userId = request.authUser?.id;

  if (!userId) {
    throw new HttpError(401, 'Authentication required.');
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

export async function postLectureChunk(request: Request, response: Response) {
  const lectureId = request.params.lectureId;

  if (!lectureId) {
    response.status(400).json({ error: 'lectureId is required.' });
    return;
  }

  const input = parseLectureChunkUploadInput(lectureId, request.body);
  const result = await createLectureChunkForUser(requireAuthUserId(request), lectureId, input);
  response.status(201).json(result);
}

export async function getLectureAudio(request: Request, response: Response) {
  const lectureId = request.params.lectureId;

  if (!lectureId) {
    response.status(400).json({ error: 'lectureId is required.' });
    return;
  }

  const audio = await getLectureAudioForUser(requireAuthUserId(request), lectureId);

  response.setHeader('Content-Type', audio.mimeType);
  response.setHeader('Content-Length', String(audio.audioBytes.byteLength));
  response.setHeader(
    'Content-Disposition',
    `attachment; filename="${sanitizeHeaderFilename(audio.filename)}"`
  );
  response.status(200).send(audio.audioBytes);
}

export async function postLectureTranscription(request: Request, response: Response) {
  const lectureId = request.params.lectureId;

  if (!lectureId) {
    response.status(400).json({ error: 'lectureId is required.' });
    return;
  }

  const userId = requireAuthUserId(request);

  console.log('[ transcription ] Received transcription request.', {
    lectureId,
    userId,
    method: request.method,
    path: request.originalUrl,
  });

  const result = await processLectureTranscriptionForUser(userId, lectureId);

  console.log('[ transcription ] Sending transcription response.', {
    lectureId,
    userId,
    lectureStatus: result.lecture.status,
    transcriptStatus: result.transcript?.status ?? null,
    totalSegments: result.transcript?.totalSegments ?? null,
    responsePreview: buildLogPreview(result),
  });

  response.status(200).json(result);
}

function buildLogPreview(value: unknown) {
  const serialized = JSON.stringify(value);

  if (serialized.length <= 2000) {
    return serialized;
  }

  return `${serialized.slice(0, 2000)}... [truncated]`;
}

function sanitizeHeaderFilename(filename: string) {
  return filename.replace(/["\r\n]/g, '-');
}
