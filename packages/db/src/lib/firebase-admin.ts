import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { ensureDotEnvLoaded } from './runtime-env.js';

export type FirestoreConfig = {
  projectId: string | null;
  databaseId: string;
  credentialMode: 'application-default-credentials';
  runningOnCloudRun: boolean;
};

let app: admin.app.App | null = null;
let firestore: FirebaseFirestore.Firestore | null = null;

function getDatabaseId(): string {
  return process.env.FIRESTORE_DATABASE_ID ?? '(default)';
}

function resolveProjectId(): string | null {
  return (
    process.env.GOOGLE_CLOUD_PROJECT ??
    process.env.GCLOUD_PROJECT ??
    process.env.GCP_PROJECT ??
    (app?.options.projectId ?? null)
  );
}

/**
 * Lazy Firebase Admin app initialization.
 *
 * Cloud Run production should use attached IAM service account + ADC.
 * Local development can use ADC via `gcloud auth application-default login`
 * or `GOOGLE_APPLICATION_CREDENTIALS`.
 */
export function getFirebaseAdminApp(): admin.app.App {
  ensureDotEnvLoaded();

  if (app) {
    return app;
  }

  app = admin.apps.length ? admin.app() : admin.initializeApp();
  return app;
}

/**
 * Lazy singleton Firestore accessor.
 * Initialization only happens on first usage, not at import time.
 */
export function getDb(): FirebaseFirestore.Firestore {
  if (firestore) {
    return firestore;
  }

  const firebaseApp = getFirebaseAdminApp();
  const databaseId = getDatabaseId();

  firestore =
    databaseId === '(default)'
      ? getFirestore(firebaseApp)
      : getFirestore(firebaseApp, databaseId);

  return firestore;
}

/**
 * Safe diagnostics for logging/health checks (no secrets).
 */
export function getFirestoreConfig(): FirestoreConfig {
  ensureDotEnvLoaded();

  return {
    projectId: resolveProjectId(),
    databaseId: getDatabaseId(),
    credentialMode: 'application-default-credentials',
    runningOnCloudRun: process.env.K_SERVICE != null,
  };
}
