import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import {
  getLectureAudio,
  getLectureAudioDownloadUrl,
  getLectures,
  postLectureChunk,
  postLectureRecording,
  postLectureTranscription,
} from './lectures.controller.js';

const lecturesRouter = Router();

lecturesRouter.get('/', asyncHandler(getLectures));
lecturesRouter.get('/:lectureId/audio', asyncHandler(getLectureAudio));
lecturesRouter.get('/:lectureId/audio-url', asyncHandler(getLectureAudioDownloadUrl));
lecturesRouter.post('/:lectureId/chunks', asyncHandler(postLectureChunk));
lecturesRouter.post('/recordings', asyncHandler(postLectureRecording));
lecturesRouter.post('/:lectureId/transcription', asyncHandler(postLectureTranscription));

export { lecturesRouter };
