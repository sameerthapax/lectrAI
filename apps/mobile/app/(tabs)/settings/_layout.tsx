import { Stack } from 'expo-router';
import { useAppTheme } from '../../../providers/settings-provider';

export default function SettingsLayout() {
  const theme = useAppTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackButtonDisplayMode: 'minimal',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: theme.colors.screen },
        headerTintColor: theme.colors.text,
        headerTitleStyle: {
          color: theme.colors.text,
          fontSize: 20,
          fontWeight: '800',
        },
        contentStyle: { backgroundColor: theme.colors.screen },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="appearance" options={{ title: 'Appearance' }} />
      <Stack.Screen name="profile" options={{ title: 'Profile' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="permissions" options={{ title: 'Permissions' }} />
    </Stack>
  );
}
