import { getDb } from '@lectrai/db';
import { HttpError } from '../../lib/http-error.js';

export type StatsOverviewRecord = {
  streakDays: number;
  daysRemainingInSemester: number;
  coursesThisSemester: number;
  currentSemesterLabel: string;
  lastIncrementedOn: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function getStatsOverviewForUser(userId: string) {
  const db = getDb();
  const currentSemester = getCurrentSemesterWindow(new Date());
  const statsRow = await refreshDailyQuizStreakForUser(userId);
  const courseCountRows = await db<{ count: string }[]>`
    select count(*)::text as count
    from public.courses
    where owner_user_id = ${userId}
      and is_archived = false
      and semester = ${currentSemester.label}
  `;

  return mapStatsRecord(statsRow, Number(courseCountRows[0]?.count ?? '0'), currentSemester);
}

async function ensureUserStatsRow(userId: string) {
  const db = getDb();
  const rows = await db<DbUserStatsRow[]>`
    insert into public.user_stats (
      user_id
    ) values (
      ${userId}
    )
    on conflict (user_id) do update
    set user_id = excluded.user_id
    returning
      id,
      user_id,
      streak_days,
      last_incremented_on,
      created_at,
      updated_at
  `;

  const row = rows[0];

  if (!row) {
    throw new HttpError(500, 'Failed to initialize user stats.');
  }

  return row;
}

export async function refreshDailyQuizStreakForUser(userId: string) {
  const db = getDb();
  await ensureUserStatsRow(userId);

  const streakRows = await db<DbComputedDailyQuizStreakRow[]>`
    select
      streak_days as "streakDays",
      last_completed_on::text as "lastCompletedOn"
    from public.compute_daily_quiz_streak(${userId}::uuid)
  `;

  const streak = streakRows[0] ?? {
    streakDays: 0,
    lastCompletedOn: null,
  };

  const updatedRows = await db<DbUserStatsRow[]>`
    update public.user_stats
    set
      streak_days = ${streak.streakDays},
      last_incremented_on = ${streak.lastCompletedOn}::date
    where user_id = ${userId}::uuid
    returning
      id,
      user_id,
      streak_days,
      last_incremented_on,
      created_at,
      updated_at
  `;

  const row = updatedRows[0];

  if (!row) {
    throw new HttpError(500, 'Failed to refresh daily quiz streak.');
  }

  return row;
}

function mapStatsRecord(
  row: DbUserStatsRow,
  coursesThisSemester: number,
  semester: SemesterWindow
): StatsOverviewRecord {
  return {
    streakDays: row.streak_days,
    daysRemainingInSemester: calculateDaysRemainingInSemester(new Date(), semester),
    coursesThisSemester,
    currentSemesterLabel: semester.label,
    lastIncrementedOn: row.last_incremented_on,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function calculateDaysRemainingInSemester(now: Date, semester: SemesterWindow) {
  const current = now.getTime();
  const end = semester.endDate.getTime();

  if (current >= end) {
    return 0;
  }

  const dayMs = 1000 * 60 * 60 * 24;
  return Math.max(0, Math.ceil((end - current) / dayMs));
}

function getCurrentSemesterWindow(now: Date): SemesterWindow {
  const year = now.getUTCFullYear();
  const windows = [year - 1, year, year + 1]
    .flatMap((windowYear) => buildSemesterWindows(windowYear))
    .sort((left, right) => left.startDate.getTime() - right.startDate.getTime());
  const current = now.getTime();

  const activeWindow = windows.find(
    (window) => current >= window.startDate.getTime() && current <= window.endDate.getTime()
  );

  if (activeWindow) {
    return activeWindow;
  }

  const upcomingWindow = windows.find((window) => current < window.startDate.getTime());
  const fallbackWindow = windows[windows.length - 1];

  if (!fallbackWindow) {
    throw new HttpError(500, 'Failed to determine the current semester window.');
  }

  return upcomingWindow ?? fallbackWindow;
}

function buildSemesterWindows(year: number): SemesterWindow[] {
  return [
    {
      label: `Winter ${year}`,
      startDate: new Date(Date.UTC(year - 1, 11, 15, 0, 0, 0)),
      endDate: new Date(Date.UTC(year, 0, 15, 23, 59, 59)),
    },
    {
      label: `Spring ${year}`,
      startDate: new Date(Date.UTC(year, 0, 16, 0, 0, 0)),
      endDate: new Date(Date.UTC(year, 4, 12, 23, 59, 59)),
    },
    {
      label: `Summer ${year}`,
      startDate: new Date(Date.UTC(year, 5, 1, 0, 0, 0)),
      endDate: new Date(Date.UTC(year, 7, 15, 23, 59, 59)),
    },
    {
      label: `Fall ${year}`,
      startDate: new Date(Date.UTC(year, 7, 16, 0, 0, 0)),
      endDate: new Date(Date.UTC(year, 11, 14, 23, 59, 59)),
    },
  ];
}

type SemesterWindow = {
  label: string;
  startDate: Date;
  endDate: Date;
};

type DbUserStatsRow = {
  id: string;
  user_id: string;
  streak_days: number;
  last_incremented_on: string | null;
  created_at: Date;
  updated_at: Date;
};

type DbComputedDailyQuizStreakRow = {
  streakDays: number;
  lastCompletedOn: string | null;
};
