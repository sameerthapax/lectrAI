import type { Request, Response } from 'express';
import { HttpError } from '../../lib/http-error.js';
import { getStatsOverviewForUser } from './stats.service.js';

function requireAuthUserId(request: Request) {
  const userId = request.authUser?.id;

  if (!userId) {
    throw new HttpError(401, 'Authentication required.');
  }

  return userId;
}

export async function getStatsOverview(request: Request, response: Response) {
  const stats = await getStatsOverviewForUser(requireAuthUserId(request));
  response.status(200).json({ stats });
}
