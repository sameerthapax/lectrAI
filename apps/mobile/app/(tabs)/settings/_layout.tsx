import { Stack } from 'expo-router';
import { SettingsProvider } from '../../../providers/settings-provider';

export default function SettingsLayout() {
  return (

    <SettingsProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="permissions" />
      </Stack>
    </SettingsProvider>
  );
}
