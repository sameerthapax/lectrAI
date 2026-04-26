import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import {
  getQuizById,
  getDailyQuickQuiz,
  postQuizAttempt,
  postDailyQuickQuizAnswer,
  postDailyQuickQuizAttempt,
  postGenerateDailyQuickQuiz,
} from './quizzes.controller.js';

const quizzesRouter = Router();

quizzesRouter.get('/daily', asyncHandler(getDailyQuickQuiz));
quizzesRouter.post('/daily/generate', asyncHandler(postGenerateDailyQuickQuiz));
quizzesRouter.post('/daily/answers', asyncHandler(postDailyQuickQuizAnswer));
quizzesRouter.post('/daily/attempt', asyncHandler(postDailyQuickQuizAttempt));
quizzesRouter.post('/:quizId/attempt', asyncHandler(postQuizAttempt));
quizzesRouter.get('/:quizId', asyncHandler(getQuizById));

export { quizzesRouter };
