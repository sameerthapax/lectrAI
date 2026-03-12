import { getDb, getSupabaseAdminClient, getSupabaseClient } from '@lectrai/db';
import type { AuthError, Session, User } from '@supabase/supabase-js';
import { HttpError } from '../../lib/http-error.js';
import { env } from '../../config/env.js';

type UserRole = 'student' | 'instructor' | 'admin';
type LogoutScope = 'global' | 'local' | 'others';

type AppUserProfile = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  universityName: string | null;
  major: string | null;
  timezone: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
};

export type SignUpInput = {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  universityName: string;
  major: string;
  timezone: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type RefreshInput = {
  refreshToken: string;
};

export type LogoutInput = {
  scope: LogoutScope;
};

export function parseSignUpInput(payload: unknown): SignUpInput {
  const record = readObject(payload);
  const email = readRequiredString(record.email, 'email').toLowerCase();
  const password = readRequiredString(record.password, 'password');

  validateEmail(email);
  validatePassword(password);

  return {
    email,
    password,
    fullName: readRequiredString(record.fullName, 'fullName'),
    role: readRole(record.role),
    universityName: readRequiredString(record.universityName, 'universityName'),
    major: readRequiredString(record.major, 'major'),
    timezone: readRequiredString(record.timezone, 'timezone'),
  };
}

export function parseLoginInput(payload: unknown): LoginInput {
  const record = readObject(payload);
  const email = readRequiredString(record.email, 'email').toLowerCase();
  const password = readRequiredString(record.password, 'password');

  validateEmail(email);

  return { email, password };
}

export function parseRefreshInput(payload: unknown): RefreshInput {
  const record = readObject(payload);

  return {
    refreshToken: readRequiredString(record.refreshToken, 'refreshToken'),
  };
}

export function parseLogoutInput(payload: unknown): LogoutInput {
  if (payload == null) {
    return { scope: 'global' };
  }

  const record = readObject(payload);
  const scope = record.scope;

  if (scope == null) {
    return { scope: 'global' };
  }

  if (scope === 'global' || scope === 'local' || scope === 'others') {
    return { scope };
  }

  throw new HttpError(400, 'scope must be one of: global, local, others.');
}

export async function signUpWithEmail(input: SignUpInput) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: env.supabaseAuthEmailRedirectTo ?? undefined,
      data: {
        full_name: input.fullName,
        role: input.role,
        university_name: input.universityName,
        major: input.major,
        timezone: input.timezone,
      },
    },
  });

  if (error) {
    throw mapSupabaseError(error, 'sign_up');
  }

  if (!data.user?.id) {
    throw new HttpError(500, 'Supabase did not return a user id for the sign-up request.');
  }

  await upsertAppUser({
    id: data.user.id,
    email: data.user.email ?? input.email,
    fullName: input.fullName,
    role: input.role,
    universityName: input.universityName,
    major: input.major,
    timezone: input.timezone,
    markLastLogin: false,
  });

  const profile = await getAppUserProfile(data.user.id);

  return {
    message:
      data.session == null
        ? 'Sign-up successful. Check your email to verify your account.'
        : 'Sign-up successful.',
    user: formatAuthUser(data.user, profile),
    session: formatSession(data.session),
    emailVerificationRequired: data.session == null,
  };
}

export async function loginWithEmail(input: LoginInput) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error) {
    throw mapSupabaseError(error, 'login');
  }

  if (!data.user?.id || !data.session) {
    throw new HttpError(401, 'Login failed. Invalid email or password.');
  }

  const profile = await syncAndReadProfileFromAuthUser(data.user, true);

  return {
    message: 'Login successful.',
    user: formatAuthUser(data.user, profile),
    session: formatSession(data.session),
    emailVerificationRequired: data.user.email_confirmed_at == null,
  };
}

export async function refreshAuthSession(input: RefreshInput) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: input.refreshToken,
  });

  if (error) {
    throw mapSupabaseError(error, 'refresh');
  }

  if (!data.user?.id || !data.session) {
    throw new HttpError(401, 'Refresh failed. Invalid or expired refresh token.');
  }

  const profile = await syncAndReadProfileFromAuthUser(data.user, true);

  return {
    message: 'Session refreshed.',
    user: formatAuthUser(data.user, profile),
    session: formatSession(data.session),
    emailVerificationRequired: data.user.email_confirmed_at == null,
  };
}

export async function logoutAuthSession(accessToken: string, input: LogoutInput) {
  const supabaseAdmin = getSupabaseAdminClient();
  const { error } = await supabaseAdmin.auth.admin.signOut(accessToken, input.scope);

  if (error && !isIgnorableLogoutError(error)) {
    throw mapSupabaseError(error, 'logout');
  }

  return {
    message: 'Logout successful.',
    scope: input.scope,
  };
}

function readObject(payload: unknown): Record<string, unknown> {
  if (payload == null || typeof payload !== 'object') {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }

  return payload as Record<string, unknown>;
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, `${fieldName} is required.`);
  }

  return value.trim();
}

function readRole(value: unknown): UserRole {
  if (value == null) {
    return 'student';
  }

  if (value === 'student' || value === 'instructor' || value === 'admin') {
    return value;
  }

  throw new HttpError(400, 'role must be one of: student, instructor, admin.');
}

function validateEmail(email: string) {
  if (!email.includes('@')) {
    throw new HttpError(400, 'email must be a valid email address.');
  }
}

function validatePassword(password: string) {
  if (password.length < 8) {
    throw new HttpError(400, 'password must be at least 8 characters long.');
  }
}

async function syncAndReadProfileFromAuthUser(user: User, markLastLogin: boolean) {
  await upsertAppUser({
    id: user.id,
    email: user.email ?? '',
    fullName: readOptionalMetadata(user.user_metadata, 'full_name'),
    role: readRoleFromMetadata(user.user_metadata?.role),
    universityName: readOptionalMetadata(user.user_metadata, 'university_name'),
    major: readOptionalMetadata(user.user_metadata, 'major'),
    timezone: readOptionalMetadata(user.user_metadata, 'timezone'),
    markLastLogin,
  });

  return getAppUserProfile(user.id);
}

function readOptionalMetadata(metadata: unknown, key: string): string | null {
  if (metadata == null || typeof metadata !== 'object') {
    return null;
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readRoleFromMetadata(value: unknown): UserRole {
  return value === 'instructor' || value === 'admin' ? value : 'student';
}

async function upsertAppUser(input: {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  universityName: string | null;
  major: string | null;
  timezone: string | null;
  markLastLogin: boolean;
}) {
  const sql = getDb();

  await sql`
    insert into public.users (
      id,
      email,
      password_hash,
      auth_provider,
      full_name,
      role,
      university_name,
      major,
      timezone,
      is_active,
      last_login_at
    )
    values (
      ${input.id}::uuid,
      ${input.email},
      null,
      'email',
      ${input.fullName},
      ${input.role},
      ${input.universityName},
      ${input.major},
      ${input.timezone},
      true,
      ${input.markLastLogin ? new Date().toISOString() : null}::timestamptz
    )
    on conflict (id) do update
    set
      email = excluded.email,
      auth_provider = excluded.auth_provider,
      full_name = coalesce(excluded.full_name, public.users.full_name),
      role = excluded.role,
      university_name = coalesce(excluded.university_name, public.users.university_name),
      major = coalesce(excluded.major, public.users.major),
      timezone = coalesce(excluded.timezone, public.users.timezone),
      is_active = true,
      last_login_at = case
        when excluded.last_login_at is null then public.users.last_login_at
        else excluded.last_login_at
      end
  `;

  await sql`
    insert into public.user_settings (
      user_id,
      theme,
      language,
      notifications_enabled,
      reminder_enabled,
      auto_generate_quiz,
      auto_generate_summary,
      auto_generate_flashcards,
      preferred_quiz_question_count,
      preferred_quiz_difficulty,
      chat_response_max_tokens
    )
    values (
      ${input.id}::uuid,
      'system',
      'en',
      true,
      false,
      true,
      true,
      true,
      10,
      'medium',
      512
    )
    on conflict (user_id) do nothing
  `;
}

async function getAppUserProfile(userId: string): Promise<AppUserProfile | null> {
  const sql = getDb();
  const rows = await sql<AppUserProfile[]>`
    select
      id::text as id,
      email,
      full_name as "fullName",
      role,
      university_name as "universityName",
      major,
      timezone,
      is_active as "isActive",
      last_login_at::text as "lastLoginAt"
    from public.users
    where id = ${userId}::uuid
    limit 1
  `;

  return rows[0] ?? null;
}

function formatAuthUser(user: User, profile: AppUserProfile | null) {
  return {
    id: user.id,
    email: user.email ?? profile?.email ?? null,
    fullName: profile?.fullName ?? readOptionalMetadata(user.user_metadata, 'full_name'),
    role: profile?.role ?? readRoleFromMetadata(user.user_metadata?.role),
    universityName:
      profile?.universityName ?? readOptionalMetadata(user.user_metadata, 'university_name'),
    major: profile?.major ?? readOptionalMetadata(user.user_metadata, 'major'),
    timezone: profile?.timezone ?? readOptionalMetadata(user.user_metadata, 'timezone'),
    isActive: profile?.isActive ?? true,
    lastLoginAt: profile?.lastLoginAt ?? null,
    emailConfirmedAt: user.email_confirmed_at ?? null,
  };
}

function formatSession(session: Session | null) {
  if (!session) {
    return null;
  }

  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    tokenType: session.token_type,
    expiresIn: session.expires_in,
    expiresAt: session.expires_at ?? null,
  };
}

function mapSupabaseError(error: AuthError, operation: 'sign_up' | 'login' | 'refresh' | 'logout') {
  if (error.status === 429) {
    return new HttpError(429, 'Too many auth attempts. Try again later.');
  }

  if (operation === 'login' || operation === 'refresh') {
    if (error.status === 400 || error.status === 401 || error.status === 422) {
      return new HttpError(401, error.message);
    }
  }

  if (operation === 'sign_up') {
    if (error.status === 400 || error.status === 422) {
      return new HttpError(400, error.message);
    }
  }

  if (operation === 'logout' && (error.status === 401 || error.status === 403 || error.status === 404)) {
    return new HttpError(401, 'Logout failed because the session is already invalid.');
  }

  return new HttpError(502, `Supabase auth ${operation.replace('_', ' ')} failed.`, error.message);
}

function isIgnorableLogoutError(error: AuthError) {
  return error.status === 401 || error.status === 403 || error.status === 404;
}
