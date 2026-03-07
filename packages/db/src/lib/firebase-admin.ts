import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getFirestoreServiceAccountFromEnv } from './firestore-env.js';

const serviceAccount = getFirestoreServiceAccountFromEnv();
const firestoreDatabaseId = process.env.FIRESTORE_DATABASE_ID ?? '(default)';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: serviceAccount.projectId,
      clientEmail: serviceAccount.clientEmail,
      privateKey: serviceAccount.privateKey,
    }),
  });
}

const app = admin.app();
export const db =
  firestoreDatabaseId === '(default)'
    ? getFirestore(app)
    : getFirestore(app, firestoreDatabaseId);

export const firestoreConfig = {
  projectId: serviceAccount.projectId,
  databaseId: firestoreDatabaseId,
};
