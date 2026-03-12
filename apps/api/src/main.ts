import { env } from './config/env.js';
import { createApp } from './app.js';
import { getDatabaseHealth } from './services/db-health.service.js';

async function bootstrap() {
  const app = createApp();

  try {
    const database = await getDatabaseHealth();
    console.log(
      `[ db ] Database connection OK (source=${database.source}, supabaseUrl=${database.supabaseUrl ?? 'unset'}). schema check succeeded (key tables found: ${database.keyTablesFound}/${database.keyTablesExpected}).`
    );
  } catch (error) {
    console.error('[ db ] Database connection failed.', error);
    process.exit(1);
  }

  app.listen(env.port, env.host, () => {
    console.log(`[ ready ] http://${env.host}:${env.port}`);
  });
}

void bootstrap();
