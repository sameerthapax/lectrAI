import { Router } from 'express';
import { getStatsOverview, postIncrementStreak } from './stats.controller.js';

const statsRouter = Router();

statsRouter.get('/', getStatsOverview);
statsRouter.post('/streaks/increment', postIncrementStreak);

export { statsRouter };
