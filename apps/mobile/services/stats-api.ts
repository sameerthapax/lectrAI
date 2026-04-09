import { authorizedRequest } from './auth-api';

export type RemoteStatsRecord = {
  streakDays: number;
  progressPercent: number;
  coursesThisSemester: number;
  currentSemesterLabel: string;
  lastIncrementedOn: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function fetchStatsOverview(accessToken: string) {
  const response = await authorizedRequest<{ stats: RemoteStatsRecord }>(
    '/stats',
    { method: 'GET' },
    accessToken
  );

  return response.stats;
}

export async function incrementStreak(accessToken: string) {
  const response = await authorizedRequest<{ stats: RemoteStatsRecord }>(
    '/stats/streaks/increment',
    { method: 'POST' },
    accessToken
  );

  return response.stats;
}
