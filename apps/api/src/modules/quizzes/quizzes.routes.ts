import { Router } from 'express';
import {
  getQuizById,
  getDailyQuickQuiz,
  postQuizAttempt,
  postDailyQuickQuizAnswer,
  postDailyQuickQuizAttempt,
  postGenerateDailyQuickQuiz,
} from './quizzes.controller.js';

const quizzesRouter = Router();

quizzesRouter.get('/daily', getDailyQuickQuiz);
quizzesRouter.post('/daily/generate', postGenerateDailyQuickQuiz);
quizzesRouter.post('/daily/answers', postDailyQuickQuizAnswer);
quizzesRouter.post('/daily/attempt', postDailyQuickQuizAttempt);
quizzesRouter.post('/:quizId/attempt', postQuizAttempt);
quizzesRouter.get('/:quizId', getQuizById);

export { quizzesRouter };
