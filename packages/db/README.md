# db

Shared Firebase Admin / Firestore access for this Nx monorepo.

## Targets

Because this package follows the same Nx layout as other `packages/*` libs,
Nx manages it with inferred targets (`build`, `lint`, `typecheck`).

## Runtime Model

- Uses lazy singleton initialization (`getFirebaseAdminApp`, `getDb`).
- Uses Application Default Credentials (ADC) by default.
- Designed for Cloud Run with attached IAM service account.
- Does not require Firebase private key env vars.

## Environment Variables

- `FIRESTORE_DATABASE_ID` (optional, defaults to `(default)`)
- `GOOGLE_APPLICATION_CREDENTIALS` (optional for local key-file based ADC)
- `GOOGLE_CLOUD_PROJECT`/`GCLOUD_PROJECT` (optional, improves diagnostics)

For local dev, ADC is recommended:

```bash
gcloud auth application-default login
```

## Usage

```ts
import { getDb, getFirestoreConfig } from '@park-u/db';

const db = getDb();
const cfg = getFirestoreConfig();
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for details.
