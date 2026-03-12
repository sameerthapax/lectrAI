# Firestore Runtime Architecture

This package supports the LectrAI backend runtime by providing shared Firestore initialization for the mobile app and cloud services.

## Why lazy initialization

Import-time initialization is brittle because it forces credentials/config to be valid at module load.
That breaks CLI tools, tests, and scripts that import code paths without actually needing Firestore.

This package now uses lazy singletons:

- `getFirebaseAdminApp()` initializes Firebase Admin on first call.
- `getDb()` initializes Firestore on first call.
- Both cache instances for process lifetime.

## Why Cloud Run should use ADC + attached IAM service account

On Cloud Run, the runtime identity should come from the service account attached to the service.
This avoids shipping static private keys as environment variables or build args.

Firebase Admin uses Google Application Default Credentials (ADC), which work with:

- Cloud Run attached identity (production)
- `gcloud auth application-default login` (local dev)
- `GOOGLE_APPLICATION_CREDENTIALS` path (local/service environments)

## Security model reminder

Firestore Security Rules are for client SDK access.
Firebase Admin SDK bypasses Firestore Security Rules and is fully privileged based on IAM.
Use IAM + backend authorization controls for server-side writes.
