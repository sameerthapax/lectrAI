import * as SecureStore from 'expo-secure-store';

const SESSION_STORAGE_KEY = 'lectrai.auth.session';

export type StoredAuthSession = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  expiresAt: number | null;
};

export async function getStoredAuthSession() {
  const rawSession = await SecureStore.getItemAsync(SESSION_STORAGE_KEY);

  if (!rawSession) {
    return null;
  }

  try {
    return JSON.parse(rawSession) as StoredAuthSession;
  } catch {
    await clearStoredAuthSession();
    return null;
  }
}

export async function setStoredAuthSession(session: StoredAuthSession) {
  await SecureStore.setItemAsync(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export async function clearStoredAuthSession() {
  await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
}
