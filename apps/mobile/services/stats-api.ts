import { authorizedRequest } from './auth-api';

export type RemoteStatsRecord = {
  streakDays: number;
  daysRemainingInSemester: number;
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
