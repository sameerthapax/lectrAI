import { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { getDatabaseHealth } from '../../services/db-health.service.js';

export async function getApiHealth(_req: Request, res: Response) {
  const database = await getDatabaseHealth();

  res.json({
    status: database.keyTablesFound === database.keyTablesExpected ? 'ok' : 'degraded',
    service: 'lectrai-api',
    environment: env.nodeEnv,
    database,
  });
}
