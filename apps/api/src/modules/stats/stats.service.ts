import { getDb } from '@lectrai/db';
import { HttpError } from '../../lib/http-error.js';

export type StatsOverviewRecord = {
  streakDays: number;
  progressPercent: number;
  coursesThisSemester: number;
  currentSemesterLabel: string;
  lastIncrementedOn: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function getStatsOverviewForUser(userId: string) {
  const db = getDb();
  const currentSemester = getCurrentSemesterWindow(new Date());
  const statsRow = await ensureUserStatsRow(userId);
  const courseCountRows = await db<{ count: string }[]>`
    select count(*)::text as count
    from public.courses
    where owner_user_id = ${userId}
      and is_archived = false
      and semester = ${currentSemester.label}
  `;

  return mapStatsRecord(statsRow, Number(courseCountRows[0]?.count ?? '0'), currentSemester);
}

export async function incrementStreakForUser(userId: string) {
  const db = getDb();
  const today = toDateOnlyString(new Date());

  const rows = await db<DbUserStatsRow[]>`
    insert into public.user_stats (
      user_id,
      streak_days,
      last_incremented_on
    ) values (
      ${userId},
      1,
      ${today}
    )
    on conflict (user_id) do update
    set
      streak_days = public.user_stats.streak_days + 1,
      last_incremented_on = ${today}
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
    throw new HttpError(500, 'Failed to update streak.');
  }

  const currentSemester = getCurrentSemesterWindow(new Date());
  const courseCountRows = await db<{ count: string }[]>`
    select count(*)::text as count
    from public.courses
    where owner_user_id = ${userId}
      and is_archived = false
      and semester = ${currentSemester.label}
  `;

  return mapStatsRecord(row, Number(courseCountRows[0]?.count ?? '0'), currentSemester);
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

function mapStatsRecord(
  row: DbUserStatsRow,
  coursesThisSemester: number,
  semester: SemesterWindow
): StatsOverviewRecord {
  return {
    streakDays: row.streak_days,
    progressPercent: calculateSemesterProgressPercent(new Date(), semester),
    coursesThisSemester,
    currentSemesterLabel: semester.label,
    lastIncrementedOn: row.last_incremented_on,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function calculateSemesterProgressPercent(now: Date, semester: SemesterWindow) {
  const start = semester.startDate.getTime();
  const end = semester.endDate.getTime();
  const current = now.getTime();

  if (current <= start) {
    return 0;
  }

  if (current >= end) {
    return 100;
  }

  return Math.max(0, Math.min(100, Math.round(((current - start) / (end - start)) * 100)));
}

function getCurrentSemesterWindow(now: Date): SemesterWindow {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  if (month <= 1 || month === 11) {
    return {
      label: `Winter ${year}`,
      startDate: new Date(Date.UTC(year, 11, 1, 0, 0, 0)),
      endDate: new Date(Date.UTC(year + 1, 1, 28, 23, 59, 59)),
    };
  }

  if (month <= 4) {
    return {
      label: `Spring ${year}`,
      startDate: new Date(Date.UTC(year, 2, 1, 0, 0, 0)),
      endDate: new Date(Date.UTC(year, 4, 31, 23, 59, 59)),
    };
  }

  if (month <= 7) {
    return {
      label: `Summer ${year}`,
      startDate: new Date(Date.UTC(year, 5, 1, 0, 0, 0)),
      endDate: new Date(Date.UTC(year, 7, 31, 23, 59, 59)),
    };
  }

  return {
    label: `Fall ${year}`,
    startDate: new Date(Date.UTC(year, 8, 1, 0, 0, 0)),
    endDate: new Date(Date.UTC(year, 10, 30, 23, 59, 59)),
  };
}

function toDateOnlyString(value: Date) {
  return value.toISOString().slice(0, 10);
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
