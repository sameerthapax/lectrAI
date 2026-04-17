import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router/stack';
import { useEffect } from 'react';
import { View } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { AuthGate, AuthProvider } from '../providers/auth-provider';
import { LoadingOverlayProvider } from '../providers/loading-overlay-provider';
import { SettingsProvider, useAppTheme } from '../providers/settings-provider';

export default function RootLayout() {
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
    void SystemUI.setBackgroundColorAsync(theme.colors.screen);
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
