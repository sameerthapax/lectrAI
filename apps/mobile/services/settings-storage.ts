import * as SecureStore from 'expo-secure-store';
import type { ThemeMode } from './app-theme';

export type ProfileSettings = {
  name: string;
  email: string;
  university: string;
  age: string;
  gender: string;
};

export type NotificationSettings = {
  lectureProcessing: boolean;
  quizReminders: boolean;
};

export type PermissionSettings = {
  microphone: boolean;
  storage: boolean;
  notifications: boolean;
  soundFx: boolean;
};

export type AppearanceSettings = {
  themeMode: ThemeMode;
};

export type UserSettings = {
  profile: ProfileSettings;
  notifications: NotificationSettings;
  permissions: PermissionSettings;
  appearance: AppearanceSettings;
};

const SETTINGS_STORAGE_KEY_PREFIX = 'lectrai.settings.user.';

export function createDefaultUserSettings(input: {
  fullName?: string | null;
  email?: string | null;
  universityName?: string | null;
}): UserSettings {
  return {
    profile: {
      name: input.fullName?.trim() || '',
      email: input.email?.trim() || '',
      university: input.universityName?.trim() || '',
      age: '',
      gender: '',
    },
    notifications: {
      lectureProcessing: true,
      quizReminders: true,
    },
    permissions: {
      microphone: false,
      storage: false,
      notifications: false,
      soundFx: true,
    },
    appearance: {
      themeMode: 'system',
    },
  };
}

function getSettingsStorageKey(userId: string) {
  return `${SETTINGS_STORAGE_KEY_PREFIX}${userId}`;
}

export async function getStoredUserSettings(userId: string) {
  const rawValue = await SecureStore.getItemAsync(getSettingsStorageKey(userId));

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as UserSettings;
  } catch {
    await clearStoredUserSettings(userId);
    return null;
  }
}

export async function setStoredUserSettings(userId: string, settings: UserSettings) {
  await SecureStore.setItemAsync(getSettingsStorageKey(userId), JSON.stringify(settings));
}

export async function clearStoredUserSettings(userId: string) {
  await SecureStore.deleteItemAsync(getSettingsStorageKey(userId));
}
