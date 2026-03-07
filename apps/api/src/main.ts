import express from 'express';
import { getDb, getFirestoreConfig } from '@park-u/db';

const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

const app = express();

app.get('/', (req, res) => {
  res.send({ message: 'Hello API' });
});
async function bootstrap() {
  const db = getDb();
  const firestoreConfig = getFirestoreConfig();

  try {
    const lotsSnapshot = await db.collection('lots').limit(1).get();
    console.log(
      `[ db ] Firestore connection OK (project=${firestoreConfig.projectId}, database=${firestoreConfig.databaseId}). lots query succeeded (docs: ${lotsSnapshot.size}).`
    );
  } catch (error) {
    const grpcCode = typeof error === 'object' && error && 'code' in error
      ? (error as { code?: number }).code
      : undefined;

    console.error(
      `[ db ] Firestore connection failed (project=${firestoreConfig.projectId}, database=${firestoreConfig.databaseId}).`,
      error
    );
    if (grpcCode === 5) {
      console.error(
        '[ db ] gRPC NOT_FOUND usually means wrong GCP project identity or missing Firestore database. Check Firebase Console > Firestore Database and verify FIRESTORE_DATABASE_ID.'
      );
    }
    process.exit(1);
  }

  app.listen(port, host, () => {
    console.log(`[ ready ] http://${host}:${port}`);
  });
}

void bootstrap();
