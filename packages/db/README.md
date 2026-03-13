# db

Shared Supabase/Postgres access for the LectrAI Nx monorepo.

LectrAI is an AI-powered lecture capture and intelligent study assistant designed to help students record, organize, and study lecture material more effectively. The system allows students to record lectures through a mobile application, upload the audio to a cloud backend, and automatically generate structured study materials including transcripts, summaries, key concepts, timelines, and practice quizzes. LectrAI also provides an AI-powered chat assistant that uses retrieval-augmented generation (RAG) to answer questions based on a student's own lecture recordings.

## Targets

Because this package follows the same Nx layout as other `packages/*` libs,
Nx manages it with inferred targets (`build`, `lint`, `typecheck`).

## Runtime Model

- Uses lazy singleton initialization for both raw Postgres access and Supabase admin access.
- Uses direct Postgres connections for schema/bootstrap work and vector queries.
- Uses Supabase service-role access for privileged API operations when needed.
- Keeps credentials in environment variables rather than hardcoding provider config.

## Environment Variables

- `DATABASE_URL` or `SUPABASE_DB_URL` or `POSTGRES_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY` (optional for client-facing integrations)
- `PGSSLMODE` (optional, defaults to `require`)

## Usage

```ts
import { getDb, getDatabaseConfig, getSupabaseAdminClient } from '@lectrai/db';

const sql = getDb();
const cfg = getDatabaseConfig();
const supabase = getSupabaseAdminClient();
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for details.
