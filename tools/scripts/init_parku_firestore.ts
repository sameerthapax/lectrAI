import { getDb, getFirestoreConfig } from '@park-u/db';
import { FieldValue } from 'firebase-admin/firestore';

type LotSeed = {
  id: string;
  name: string;
  campusId: string;
  center: { lat: number; lng: number };
  polygon?: Array<{ lat: number; lng: number }>;
  capacityTotal: number;
  capacityMonitored: number;
  status: 'active' | 'inactive';
};

const INITIAL_LOTS: LotSeed[] = [
  {
    id: 'main-commuter-lot',
    name: 'Main Commuter Lot',
    campusId: 'murray-state',
    center: { lat: 36.6105, lng: -88.3147 },
    polygon: [],
    capacityTotal: 120,
    capacityMonitored: 120,
    status: 'active',
  },
  {
    id: 'faculty-staff-lot',
    name: 'Faculty & Staff Lot',
    campusId: 'murray-state',
    center: { lat: 36.6112, lng: -88.3154 },
    polygon: [],
    capacityTotal: 60,
    capacityMonitored: 60,
    status: 'active',
  },
];

async function runMigration() {
  const db = getDb();
  const firestoreConfig = getFirestoreConfig();

  console.log(
    `[ db ] Running migration against project=${firestoreConfig.projectId}, database=${firestoreConfig.databaseId}`
  );

  const now = FieldValue.serverTimestamp();

  const migrationRef = db
    .collection('_migrations')
    .doc('001_init_parku_firestore');
  const migrationSnap = await migrationRef.get();

  if (migrationSnap.exists) {
    console.log('Migration already applied: 001_init_parku_firestore');
    return;
  }

  const batch = db.batch();

  // Global schema metadata
  const schemaRef = db.collection('_meta').doc('schema');
  batch.set(
    schemaRef,
    {
      schemaVersion: 1,
      app: 'ParkU',
      updatedAt: now,
    },
    { merge: true },
  );

  // Seed lots
  for (const lot of INITIAL_LOTS) {
    const lotRef = db.collection('lots').doc(lot.id);

    batch.set(
      lotRef,
      {
        name: lot.name,
        campusId: lot.campusId,
        center: lot.center,
        polygon: lot.polygon ?? [],
        capacityTotal: lot.capacityTotal,
        capacityMonitored: lot.capacityMonitored,
        occupancyCount: 0,
        availableCount: lot.capacityMonitored,
        occupancyPct: 0,
        updatedAt: now,
        status: lot.status,
      },
      { merge: true },
    );

    // Optional lot config doc
    const configRef = lotRef.collection('config').doc('settings');
    batch.set(
      configRef,
      {
        snapshotIntervalMinutes: 5,
        spaceLevelTrackingEnabled: true,
        notificationsEnabled: true,
        updatedAt: now,
      },
      { merge: true },
    );
  }

  // Example device registry placeholder
  const deviceRef = db.collection('devices').doc('pi-demo-001');
  batch.set(
    deviceRef,
    {
      lotId: 'main-commuter-lot',
      name: 'Raspberry Pi Demo Unit 001',
      status: 'offline',
      firmwareVersion: 'v1.0.0',
      modelVersion: 'yolo-v1',
      lastHeartbeatAt: null,
      lastEventAt: null,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  // Migration record
  batch.set(migrationRef, {
    name: '001_init_parku_firestore',
    appliedAt: now,
    description:
      'Initializes ParkU Firestore schema metadata, seed lots, default config, and device placeholder.',
  });

  await batch.commit();

  console.log('Migration applied successfully: 001_init_parku_firestore');
}

runMigration().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
