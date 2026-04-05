import type { Request, Response } from 'express';
import { getStatsOverviewForUser, incrementStreakForUser } from './stats.service.js';

function requireAuthUserId(request: Request) {
  const userId = request.authUser?.id;

  if (!userId) {
    throw new Error('Authenticated user id missing from request context.');
  }

  return userId;
}

export async function getStatsOverview(request: Request, response: Response) {
  const stats = await getStatsOverviewForUser(requireAuthUserId(request));
  response.status(200).json({ stats });
}

export async function postIncrementStreak(request: Request, response: Response) {
  const stats = await incrementStreakForUser(requireAuthUserId(request));
  response.status(200).json({ stats });
}
