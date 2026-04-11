import { Router } from 'express';
import { getStatsOverview } from './stats.controller.js';

const statsRouter = Router();

statsRouter.get('/', getStatsOverview);

export { statsRouter };
