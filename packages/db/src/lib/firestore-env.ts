import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type FirestoreServiceAccount = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function normalizePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, '\n');
}

function parseServiceAccountJson(json: string, sourceName: string): FirestoreServiceAccount {
  const parsed = JSON.parse(json) as {
    project_id?: string;
    client_email?: string;
    private_key?: string;
  };

  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error(
      `${sourceName} is missing project_id/client_email/private_key.`
    );
  }

  return {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    privateKey: normalizePrivateKey(parsed.private_key),
  };
}

function fromJsonFilePath(): FirestoreServiceAccount | null {
  const configuredPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const defaultPath = 'secrets/service_account.json';
  const pathToUse = configuredPath ?? (existsSync(resolve(defaultPath)) ? defaultPath : null);

  if (!pathToUse) {
    return null;
  }

  const absolutePath = resolve(pathToUse);
  if (!existsSync(absolutePath)) {
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT_PATH points to a missing file: ${absolutePath}`
    );
  }

  const json = readFileSync(absolutePath, 'utf8');
  return parseServiceAccountJson(json, `Service account file (${absolutePath})`);
}

function fromJsonEnv(): FirestoreServiceAccount | null {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) {
    return null;
  }

  return parseServiceAccountJson(json, 'FIREBASE_SERVICE_ACCOUNT_JSON');
}

function fromSplitEnv(): FirestoreServiceAccount {
  return {
    projectId: requireEnv('FIREBASE_PROJECT_ID'),
    clientEmail: requireEnv('FIREBASE_CLIENT_EMAIL'),
    privateKey: normalizePrivateKey(requireEnv('FIREBASE_PRIVATE_KEY')),
  };
}

export function getFirestoreServiceAccountFromEnv(): FirestoreServiceAccount {
  return fromJsonFilePath() ?? fromJsonEnv() ?? fromSplitEnv();
}
