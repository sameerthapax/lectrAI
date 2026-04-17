import postgres from 'postgres';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ensureDotEnvLoaded } from './runtime-env.js';

export type DatabaseConfig = {
  supabaseUrl: string | null;
  hasAnonKey: boolean;
  hasServiceRoleKey: boolean;
  connectionStringSource: 'DATABASE_URL' | 'SUPABASE_DB_URL' | 'POSTGRES_URL' | 'none';
  sslMode: 'require' | 'prefer' | 'disable';
  runningOnCloudRun: boolean;
};

let sqlClient: postgres.Sql | null = null;
let supabaseAdminClient: SupabaseClient | null = null;
let supabaseAnonClient: SupabaseClient | null = null;

function resolveConnectionString(): {
  value: string | null;
  source: DatabaseConfig['connectionStringSource'];
} {
  if (process.env.DATABASE_URL) {
    return { value: process.env.DATABASE_URL, source: 'DATABASE_URL' };
  }

  if (process.env.SUPABASE_DB_URL) {
    return { value: process.env.SUPABASE_DB_URL, source: 'SUPABASE_DB_URL' };
  }

  if (process.env.POSTGRES_URL) {
    return { value: process.env.POSTGRES_URL, source: 'POSTGRES_URL' };
  }

  return { value: null, source: 'none' };
}

function resolveSslMode(): DatabaseConfig['sslMode'] {
  const raw = process.env.PGSSLMODE?.toLowerCase();

  if (raw === 'disable') {
    return 'disable';
  }

  if (raw === 'prefer') {
    return 'prefer';
  }

  return 'require';
}

export function getDatabaseConfig(): DatabaseConfig {
  ensureDotEnvLoaded();

  const connection = resolveConnectionString();

  return {
    supabaseUrl: process.env.SUPABASE_URL ?? null,
    hasAnonKey: Boolean(process.env.SUPABASE_ANON_KEY),
    hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    connectionStringSource: connection.source,
    sslMode: resolveSslMode(),
    runningOnCloudRun: process.env.K_SERVICE != null,
  };
}

export function getDb(): postgres.Sql {
  ensureDotEnvLoaded();

  if (sqlClient) {
    return sqlClient;
  }

  const connection = resolveConnectionString();

  if (!connection.value) {
    throw new Error(
      'Missing database connection string. Set DATABASE_URL, SUPABASE_DB_URL, or POSTGRES_URL.'
    );
  }

  sqlClient = postgres(connection.value, {
    ssl: resolveSslMode() === 'disable' ? false : 'require',
    max: 5,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false,
  });

  return sqlClient;
}

export function getSupabaseAdminClient(): SupabaseClient {
  ensureDotEnvLoaded();

  if (supabaseAdminClient) {
    return supabaseAdminClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing Supabase admin credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  supabaseAdminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseAdminClient;
}

export function getSupabaseClient(): SupabaseClient {
  ensureDotEnvLoaded();

  if (supabaseAnonClient) {
    return supabaseAnonClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error('Missing Supabase client credentials. Set SUPABASE_URL and SUPABASE_ANON_KEY.');
  }

  supabaseAnonClient = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseAnonClient;
}
