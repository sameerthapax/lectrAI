import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

let didAttemptLoad = false;

/**
 * Best-effort local .env loading for scripts/dev.
 * Cloud Run production should rely on runtime env + attached IAM identity.
 */
export function ensureDotEnvLoaded(): void {
  if (didAttemptLoad) {
    return;
  }
  didAttemptLoad = true;

  const processWithLoadEnvFile = process as typeof process & {
    loadEnvFile?: (path?: string) => void;
  };

  if (!processWithLoadEnvFile.loadEnvFile) {
    return;
  }

  const envPath = resolve('.env');
  if (existsSync(envPath)) {
    processWithLoadEnvFile.loadEnvFile(envPath);
  }
}
