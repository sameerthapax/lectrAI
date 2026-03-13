import { Router } from 'express';
import { getApiHealth } from './health.controller.js';

const healthRouter = Router();

healthRouter.get('/', getApiHealth);

export { healthRouter };
