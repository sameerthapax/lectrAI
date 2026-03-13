import { Stack } from 'expo-router/stack';
import { AuthGate, AuthProvider } from '../providers/auth-provider';

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthGate>
        <Stack initialRouteName="(auth)">
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </AuthGate>
    </AuthProvider>
  );
}
