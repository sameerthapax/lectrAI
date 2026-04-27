import { Router } from 'express';
import { authenticateWithSupabase } from '../middleware/supabase-auth.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { chatRouter } from '../modules/chat/chat.routes.js';
import { coursesRouter } from '../modules/courses/courses.routes.js';
import { flashcardsRouter } from '../modules/flashcards/flashcards.routes.js';
import { healthRouter } from '../modules/health/health.routes.js';
import { lecturesRouter } from '../modules/lectures/lectures.routes.js';
import { quizzesRouter } from '../modules/quizzes/quizzes.routes.js';
import { statsRouter } from '../modules/stats/stats.routes.js';

const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use(authenticateWithSupabase);
apiRouter.use('/courses', coursesRouter);
apiRouter.use('/stats', statsRouter);
apiRouter.use('/lectures', lecturesRouter);
apiRouter.use('/quizzes', quizzesRouter);
apiRouter.use('/flashcards', flashcardsRouter);
apiRouter.use('/chat', chatRouter);

export { apiRouter };
