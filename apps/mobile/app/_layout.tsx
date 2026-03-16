import { Stack } from 'expo-router/stack';
import { AuthGate, AuthProvider } from '../providers/auth-provider';

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthGate>
        <Stack initialRouteName="welcome">
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </AuthGate>
    </AuthProvider>
  );
}
