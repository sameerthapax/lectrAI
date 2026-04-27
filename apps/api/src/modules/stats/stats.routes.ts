import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { getStatsOverview } from './stats.controller.js';

const statsRouter = Router();

statsRouter.get('/', asyncHandler(getStatsOverview));

export { statsRouter };
