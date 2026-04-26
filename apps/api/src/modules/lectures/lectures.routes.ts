import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import {
  getLectureAudio,
  getLectures,
  postLectureChunk,
  postLectureRecording,
  postLectureTranscription,
} from './lectures.controller.js';

const lecturesRouter = Router();

lecturesRouter.get('/', asyncHandler(getLectures));
lecturesRouter.get('/:lectureId/audio', asyncHandler(getLectureAudio));
lecturesRouter.post('/:lectureId/chunks', asyncHandler(postLectureChunk));
lecturesRouter.post('/recordings', asyncHandler(postLectureRecording));
lecturesRouter.post('/:lectureId/transcription', asyncHandler(postLectureTranscription));

export { lecturesRouter };
