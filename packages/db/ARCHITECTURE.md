# Supabase Runtime Architecture

This package supports the LectrAI backend runtime by providing shared Postgres and Supabase initialization for the mobile app and cloud services.

## Why lazy initialization

Import-time initialization is brittle because it forces credentials/config to be valid at module load.
That breaks CLI tools, tests, and scripts that import code paths without actually needing the database.

This package uses lazy singletons:

- `getDb()` initializes the Postgres client on first call.
- `getSupabaseAdminClient()` initializes the Supabase admin client on first call.
- Both cache instances for process lifetime.

## Why Postgres is the primary backend

LectrAI needs relational data, transactional workflows, and vector search for retrieval-augmented generation.
Supabase provides managed Postgres plus the `pgvector` extension, which is a better fit than Firestore for:

- lecture, quiz, and chat data with joins and transactional writes
- embeddings storage and similarity search
- SQL migrations and schema evolution
- direct integration with Postgres tooling

## Security model reminder

Server-side code should use the direct Postgres connection string and Supabase service-role key only in trusted runtimes such as Cloud Run and local backend tooling.
Client applications should use the anon key and row-level security policies instead of service-role credentials.
