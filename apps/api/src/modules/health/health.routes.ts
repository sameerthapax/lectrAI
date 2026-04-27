import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { getApiHealth } from './health.controller.js';

const healthRouter = Router();

healthRouter.get('/', asyncHandler(getApiHealth));

export { healthRouter };
