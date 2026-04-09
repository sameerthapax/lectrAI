import { Router } from 'express';
import { getLectures, postLectureRecording } from './lectures.controller.js';

const lecturesRouter = Router();

lecturesRouter.get('/', getLectures);
lecturesRouter.post('/recordings', postLectureRecording);

export { lecturesRouter };
