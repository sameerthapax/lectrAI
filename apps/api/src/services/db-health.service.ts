import { getDatabaseConfig, getDb } from '@lectrai/db';

export type DatabaseHealth = {
  source: string;
  supabaseUrl: string | null;
  keyTablesFound: number;
  keyTablesExpected: number;
};

const REQUIRED_TABLES = [
  'users',
  'courses',
  'lectures',
  'transcripts',
  'embedding_documents',
  'transcript_chunks',
] as const;

export async function getDatabaseHealth(): Promise<DatabaseHealth> {
  const sql = getDb();
  const databaseConfig = getDatabaseConfig();

  const result = await sql.unsafe<{ table_count: number }[]>(
    `
      select count(*)::int as table_count
      from information_schema.tables
      where table_schema = 'public'
        and table_name in (
          'users',
          'courses',
          'lectures',
          'transcripts',
          'embedding_documents',
          'transcript_chunks'
        )
    `
  );

  return {
    source: databaseConfig.connectionStringSource,
    supabaseUrl: databaseConfig.supabaseUrl,
    keyTablesFound: result[0]?.table_count ?? 0,
    keyTablesExpected: REQUIRED_TABLES.length,
  };
}
