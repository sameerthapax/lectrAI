import { StatusBar } from 'expo-status-bar';
import { type ErrorBoundaryProps } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import * as SplashScreen from 'expo-splash-screen';
import { AppErrorFallback } from '../components/error/app-error-fallback';
import { AppStartupShell } from '../components/ui/app-startup-shell';
import { AuthGate, AuthProvider, useAuth } from '../providers/auth-provider';
import { LoadingOverlayProvider } from '../providers/loading-overlay-provider';
import { SettingsProvider, useAppTheme, useSettings } from '../providers/settings-provider';
import {
  clearLatestFatalMobileError,
  installGlobalMobileErrorHandlers,
  logMobileError,
  useLatestFatalMobileError,
} from '../services/error-monitor';

void SplashScreen.preventAutoHideAsync().catch(() => null);
SplashScreen.setOptions({
  duration: 220,
  fade: true,
});

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const report = logMobileError(error, {
    source: 'expo-router-boundary',
    fatal: true,
  });

  return (
    <AppErrorFallback
      title="App recovered from a screen error"
      errorReport={report}
      onRetry={retry}
    />
  );
}

export default function RootLayout() {
  const fatalError = useLatestFatalMobileError();

  useEffect(() => {
    installGlobalMobileErrorHandlers();
  }, []);

  if (fatalError) {
    return (
      <AppErrorFallback
        title="App recovered from an unexpected error"
        errorReport={fatalError}
        onRetry={clearLatestFatalMobileError}
        retryLabel="Dismiss"
      />
    );
  }

  return (
    <LoadingOverlayProvider>
      <AuthProvider>
        <SettingsProvider>
          <ThemedAppShell />
        </SettingsProvider>
      </AuthProvider>
    </LoadingOverlayProvider>
  );
}

function ThemedAppShell() {
  const auth = useAuth();
  const settingsState = useSettings();
  const theme = useAppTheme();
  const splashHiddenRef = useRef(false);
  const appIsReady = auth.status !== 'loading' && !settingsState.loading;

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.colors.screen).catch((error) => {
      logMobileError(error, {
        source: 'system-ui-background',
      });
    });
  }, [theme.colors.screen]);

  const handleRootLayout = useCallback(() => {
    if (!appIsReady || splashHiddenRef.current) {
      return;
    }

    splashHiddenRef.current = true;
    void SplashScreen.hideAsync().catch((error) => {
      logMobileError(error, {
        source: 'splash-screen.hide',
      });
    });
  }, [appIsReady]);

  return (
    <View
      onLayout={handleRootLayout}
      style={{ flex: 1, backgroundColor: theme.colors.screen }}
    >
      <StatusBar style={theme.resolvedMode === 'dark' ? 'light' : 'dark'} />
      {appIsReady ? (
        <AuthGate>
          <Stack
            initialRouteName="index"
            screenOptions={{ contentStyle: { backgroundColor: theme.colors.screen } }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="(pages)" options={{ headerShown: false }} />
          </Stack>
        </AuthGate>
      ) : (
        <AppStartupShell />
      )}
    </View>
  );
}
