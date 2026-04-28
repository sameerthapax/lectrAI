import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import { useAuth } from './auth-provider';
import { useDelayedLoadingOverlay } from './loading-overlay-provider';
import { createAppTheme, resolveThemeMode, type AppTheme, type ThemeMode } from '../services/app-theme';
import {
  createDefaultUserSettings,
  getStoredUserSettings,
  setStoredUserSettings,
  type NotificationSettings,
  type PermissionSettings,
  type ProfileSettings,
  type UserSettings,
} from '../services/settings-storage';
import { logMobileError } from '../services/error-monitor';

type SettingsContextValue = {
  settings: UserSettings | null;
  loading: boolean;
  topEmail: string;
  theme: AppTheme;
  saveProfile: (profile: ProfileSettings) => void;
  updateProfileField: (field: keyof ProfileSettings, value: string) => void;
  updateNotificationSetting: (
    field: keyof NotificationSettings,
    value: boolean
  ) => void;
  updatePermissionSetting: (field: keyof PermissionSettings, value: boolean) => void;
  updateThemeMode: (value: ThemeMode) => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasHydrated, setHasHydrated] = useState(false);
  const systemColorScheme = useColorScheme();

  useDelayedLoadingOverlay(loading, 0);

  const userId = auth.user?.id ?? null;

  const defaultSettings = useMemo(
    () =>
      createDefaultUserSettings({
        fullName: auth.user?.fullName,
        email: auth.user?.email,
        universityName: auth.user?.universityName,
      }),
    [auth.user?.email, auth.user?.fullName, auth.user?.universityName]
  );

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      if (!userId) {
        setSettings(defaultSettings);
        setLoading(false);
        setHasHydrated(true);
        return;
      }

      try {
        setLoading(true);
        const storedSettings = await getStoredUserSettings(userId);

        if (cancelled) {
          return;
        }

        const resolvedSettings = storedSettings
          ? {
              ...storedSettings,
              profile: {
                ...storedSettings.profile,
                name: storedSettings.profile.name || defaultSettings.profile.name,
                email: storedSettings.profile.email || defaultSettings.profile.email,
                university:
                  storedSettings.profile.university ||
                  defaultSettings.profile.university,
              },
              appearance: {
                ...defaultSettings.appearance,
                ...storedSettings.appearance,
              },
              permissions: {
                ...defaultSettings.permissions,
                ...storedSettings.permissions,
              },
              notifications: {
                ...defaultSettings.notifications,
                ...storedSettings.notifications,
              },
            }
          : defaultSettings;

        setSettings(resolvedSettings);
      } catch (error) {
        logMobileError(error, {
          source: 'settings-provider.load-settings',
          extra: { userId },
        });
        if (!cancelled) {
          setSettings(defaultSettings);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setHasHydrated(true);
        }
      }
    };

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [defaultSettings, userId]);

  useEffect(() => {
    if (!userId || !settings || !hasHydrated) {
      return;
    }

    void setStoredUserSettings(userId, settings).catch((error) => {
      logMobileError(error, {
        source: 'settings-provider.persist-settings',
        extra: { userId },
      });
    });
  }, [hasHydrated, settings, userId]);

  const updateProfileField = (field: keyof ProfileSettings, value: string) => {
    setSettings((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        profile: {
          ...current.profile,
          [field]: value,
        },
      };
    });
  };

  const saveProfile = (profile: ProfileSettings) => {
    setSettings((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        profile,
      };
    });
  };

  const updateNotificationSetting = (
    field: keyof NotificationSettings,
    value: boolean
  ) => {
    setSettings((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        notifications: {
          ...current.notifications,
          [field]: value,
        },
      };
    });
  };

  const updatePermissionSetting = (
    field: keyof PermissionSettings,
    value: boolean
  ) => {
    setSettings((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        permissions: {
          ...current.permissions,
          [field]: value,
        },
      };
    });
  };

  const updateThemeMode = (value: ThemeMode) => {
    setSettings((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        appearance: {
          ...current.appearance,
          themeMode: value,
        },
      };
    });
  };

  const topEmail = auth.user?.email ?? settings?.profile.email ?? 'unknown user';
  const normalizedSystemColorScheme = systemColorScheme === 'unspecified' ? null : systemColorScheme;
  const resolvedThemeMode = resolveThemeMode(
    settings?.appearance.themeMode ?? defaultSettings.appearance.themeMode,
    normalizedSystemColorScheme
  );
  const theme = useMemo(
    () =>
      createAppTheme(
        settings?.appearance.themeMode ?? defaultSettings.appearance.themeMode,
        resolvedThemeMode
      ),
    [defaultSettings.appearance.themeMode, resolvedThemeMode, settings?.appearance.themeMode]
  );

  return (
    <SettingsContext.Provider
      value={{
        settings,
        loading,
        topEmail,
        theme,
        saveProfile,
        updateProfileField,
        updateNotificationSetting,
        updatePermissionSetting,
        updateThemeMode,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);

  if (!context) {
    throw new Error('useSettings must be used inside SettingsProvider.');
  }

  return context;
}

export function useAppTheme() {
  return useSettings().theme;
}
