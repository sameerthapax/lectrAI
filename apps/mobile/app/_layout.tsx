import { StatusBar } from 'expo-status-bar';
import { type ErrorBoundaryProps } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useEffect } from 'react';
import { View } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { AppErrorFallback } from '../components/error/app-error-fallback';
import { AuthGate, AuthProvider } from '../providers/auth-provider';
import { LoadingOverlayProvider } from '../providers/loading-overlay-provider';
import { SettingsProvider, useAppTheme } from '../providers/settings-provider';
import {
  clearLatestFatalMobileError,
  installGlobalMobileErrorHandlers,
  logMobileError,
  useLatestFatalMobileError,
} from '../services/error-monitor';

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
          <AuthGate>
            <ThemedAppShell />
          </AuthGate>
        </SettingsProvider>
      </AuthProvider>
    </LoadingOverlayProvider>
  );
}

function ThemedAppShell() {
  const theme = useAppTheme();

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.colors.screen).catch((error) => {
      logMobileError(error, {
        source: 'system-ui-background',
      });
    });
  }, [theme.colors.screen]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.screen }}>
      <StatusBar style={theme.resolvedMode === 'dark' ? 'light' : 'dark'} />
      <Stack
        initialRouteName="index"
        screenOptions={{ contentStyle: { backgroundColor: theme.colors.screen } }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(pages)" options={{ headerShown: false }} />
      </Stack>
    </View>
  );
}
