import { Router } from 'express';
import { getDailyQuickQuiz } from './quizzes.controller.js';

const quizzesRouter = Router();

quizzesRouter.get('/daily', getDailyQuickQuiz);

export { quizzesRouter };
