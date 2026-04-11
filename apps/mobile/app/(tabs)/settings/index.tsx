import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import {
  ORANGE,
  SettingsLinkCard,
  SettingsLoadingState,
} from '../../../components/settings/settings-ui';
import { useAuth } from '../../../providers/auth-provider';
import { useSettings } from '../../../providers/settings-provider';

export default function SettingsHomeRoute() {
  const auth = useAuth();
  const { loading, settings, theme } = useSettings();
  const [loggingOut, setLoggingOut] = useState(false);

  const onLogout = async () => {
    try {
      setLoggingOut(true);
      await auth.signOut();
      router.replace('/login');
    } catch (error) {
      Alert.alert(
        'Logout failed',
        error instanceof Error ? error.message : 'Unable to sign out right now.'
      );
    } finally {
      setLoggingOut(false);
    }
  };

  if (loading) {
    return <SettingsLoadingState />;
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.colors.screen }}
      contentContainerStyle={{
        flexGrow: 1,
        padding: 16,
        gap: 14,
        paddingBottom: 32,
        backgroundColor: theme.colors.screen,
      }}
    >
      <View
        style={{
          paddingTop: 2,
          paddingHorizontal: 2,
          gap: 14,
        }}
      >
        <View
          style={{
          }}
        >
          <Text style={{ color: theme.colors.text, fontSize: 30, fontWeight: '800' }}>
            Settings
          </Text>
        </View>

        <SettingsLinkCard
          title="Appearance"
          description={
            settings?.appearance.themeMode === 'system'
              ? `Following your phone: ${theme.resolvedMode === 'dark' ? 'Dark' : 'Light'}.`
              : `Using ${settings?.appearance.themeMode === 'dark' ? 'Dark' : 'Light'} mode.`
          }
          onPress={() => router.push('/(tabs)/settings/appearance')}
        />
        <SettingsLinkCard
          title="Profile"
          description="View and edit your name, email, age, and gender."
          onPress={() => router.push('/(tabs)/settings/profile')}
        />
        <SettingsLinkCard
          title="Notifications"
          description="Manage lecture processing alerts and quiz reminders."
          onPress={() => router.push('/(tabs)/settings/notifications')}
        />
        <SettingsLinkCard
          title="Permissions"
          description="Control microphone, file access, notification access, and sound effects."
          onPress={() => router.push('/(tabs)/settings/permissions')}
        />
        <View
          style={{
            borderRadius: 24,
            borderCurve: 'continuous',
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.border,
            padding: 18,
          }}
        >
          <Pressable
            disabled={loggingOut}
            onPress={onLogout}
            style={({ pressed }) => ({
              minHeight: 54,
              borderRadius: 18,
              borderCurve: 'continuous',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: loggingOut ? theme.colors.switchTrackOn : ORANGE,
              opacity: pressed ? 0.92 : 1,
            })}
          >
            {loggingOut ? (
              <ActivityIndicator color={theme.colors.accentContrast} />
            ) : (
              <Text style={{ color: theme.colors.accentContrast, fontSize: 16, fontWeight: '900' }}>
                Log Out
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}
