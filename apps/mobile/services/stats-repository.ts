import type { AuthUser } from './auth-api';
import type { RemoteStatsRecord } from './stats-api';
import { initializeLocalDatabase, runSerializedLocalWrite } from './local-db';

export type LocalStatsRecord = {
  userId: string;
  streakDays: number;
  progressPercent: number;
  coursesThisSemester: number;
  currentSemesterLabel: string;
  lastIncrementedOn: string | null;
  syncStatus: 'synced' | 'pending_pull' | 'pending_push' | 'conflict';
  createdAt: string | null;
  updatedAt: string | null;
};

export async function getCachedStatsForUser(user: AuthUser) {
  const db = await initializeLocalDatabase();
  await ensureLocalUser(db, user);

  const row = await db.getFirstAsync<{
    user_id: string;
    streak_days: number;
    progress_percent: number;
    courses_this_semester: number;
    current_semester_label: string | null;
    last_incremented_on: string | null;
    sync_status: LocalStatsRecord['syncStatus'];
    created_at: string | null;
    updated_at: string | null;
  }>(
    `SELECT
       user_id,
       streak_days,
       progress_percent,
       courses_this_semester,
       current_semester_label,
       last_incremented_on,
       sync_status,
       created_at,
       updated_at
     FROM cached_user_stats
     WHERE user_id = ?`,
    [user.id]
  );

  return row ? mapRow(row) : createEmptyStats(user.id);
}

export async function upsertStatsForUser(user: AuthUser, stats: RemoteStatsRecord) {
  await runSerializedLocalWrite(async (db) => {
    await db.withTransactionAsync(async () => {
      await ensureLocalUser(db, user);
      await db.runAsync(
        `INSERT INTO cached_user_stats (
           user_id,
           streak_days,
           progress_percent,
           courses_this_semester,
           current_semester_label,
           last_incremented_on,
           created_at,
           updated_at,
           sync_status,
           dirty_fields_json,
           last_synced_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, CURRENT_TIMESTAMP)
         ON CONFLICT(user_id) DO UPDATE SET
           streak_days = excluded.streak_days,
           progress_percent = excluded.progress_percent,
           courses_this_semester = excluded.courses_this_semester,
           current_semester_label = excluded.current_semester_label,
           last_incremented_on = excluded.last_incremented_on,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at,
           sync_status = excluded.sync_status,
           dirty_fields_json = excluded.dirty_fields_json,
           last_synced_at = excluded.last_synced_at`,
        [
          user.id,
          stats.streakDays,
          stats.progressPercent,
          stats.coursesThisSemester,
          stats.currentSemesterLabel,
          stats.lastIncrementedOn,
          stats.createdAt,
          stats.updatedAt,
          JSON.stringify([]),
        ]
      );
    });
  });
}

function createEmptyStats(userId: string): LocalStatsRecord {
  return {
    userId,
    streakDays: 0,
    progressPercent: 0,
    coursesThisSemester: 0,
    currentSemesterLabel: '',
    lastIncrementedOn: null,
    syncStatus: 'pending_pull',
    createdAt: null,
    updatedAt: null,
  };
}

function mapRow(row: {
  user_id: string;
  streak_days: number;
  progress_percent: number;
  courses_this_semester: number;
  current_semester_label: string | null;
  last_incremented_on: string | null;
  sync_status: LocalStatsRecord['syncStatus'];
  created_at: string | null;
  updated_at: string | null;
}): LocalStatsRecord {
  return {
    userId: row.user_id,
    streakDays: row.streak_days,
    progressPercent: row.progress_percent,
    coursesThisSemester: row.courses_this_semester,
    currentSemesterLabel: row.current_semester_label ?? '',
    lastIncrementedOn: row.last_incremented_on,
    syncStatus: row.sync_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function ensureLocalUser(
  db: Awaited<ReturnType<typeof initializeLocalDatabase>>,
  user: AuthUser
) {
  await db.runAsync(
    `INSERT INTO cached_users (
       id,
       email,
       full_name,
       role,
       university_name,
       major,
       timezone,
       is_active,
       last_login_at,
       created_at,
       updated_at,
       sync_status,
       dirty_fields_json,
       last_synced_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'synced', ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       email = excluded.email,
       full_name = excluded.full_name,
       role = excluded.role,
       university_name = excluded.university_name,
       major = excluded.major,
       timezone = excluded.timezone,
       is_active = excluded.is_active,
       last_login_at = excluded.last_login_at,
       updated_at = CURRENT_TIMESTAMP`,
    [
      user.id,
      user.email ?? `${user.id}@local.invalid`,
      user.fullName,
      user.role,
      user.universityName,
      user.major,
      user.timezone,
      user.isActive ? 1 : 0,
      user.lastLoginAt,
      JSON.stringify([]),
    ]
  );
}
