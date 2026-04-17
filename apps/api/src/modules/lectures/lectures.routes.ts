import { Router } from 'express';
import {
  getLectureAudio,
  getLectures,
  postLectureRecording,
  postLectureTranscription,
} from './lectures.controller.js';

const lecturesRouter = Router();

lecturesRouter.get('/', getLectures);
lecturesRouter.get('/:lectureId/audio', getLectureAudio);
lecturesRouter.post('/recordings', postLectureRecording);
lecturesRouter.post('/:lectureId/transcription', postLectureTranscription);

export { lecturesRouter };
