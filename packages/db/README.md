# db

Shared Firestore environment/config utilities for this Nx monorepo.

## Targets

Because this package follows the same Nx layout as other `packages/*` libs,
Nx manages it with inferred targets (`build`, `lint`, `typecheck`).

## Environment Variables

Use one of these patterns for server-side Firestore auth:

1. `FIREBASE_SERVICE_ACCOUNT_PATH` (local file path, e.g. `secrets/service_account.json`)
2. `FIREBASE_SERVICE_ACCOUNT_JSON` (full JSON as a single secret)
3. Split fields:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY`

`FIREBASE_PRIVATE_KEY` may include escaped newlines (`\\n`); the helper normalizes them.

Do not expose these values in mobile client bundles.
