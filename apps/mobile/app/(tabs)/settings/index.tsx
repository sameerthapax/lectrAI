import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import {
  ORANGE,
  SettingsLinkCard,
  SettingsLoadingState,
  CREAM,
  INK,
  CARD,
  BORDER,
} from '../../../components/settings/settings-ui';
import { useAuth } from '../../../providers/auth-provider';
import { useSettings } from '../../../providers/settings-provider';

export default function SettingsHomeRoute() {
  const auth = useAuth();
  const { loading, topEmail } = useSettings();
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
    <View
      style={{
        flex: 1,
        backgroundColor: CREAM,
        paddingHorizontal: 16,
        paddingTop: 18,
        paddingBottom: 32,
        gap: 14,
      }}
    >
      <View
        style={{
          borderRadius: 28,
          borderCurve: 'continuous',
          padding: 22,
          backgroundColor: INK,
          overflow: 'hidden',
          gap: 10,
        }}
      >
        <View
          style={{
            position: 'absolute',
            top: -42,
            right: -28,
            width: 180,
            height: 180,
            borderRadius: 999,
            backgroundColor: 'rgba(255, 106, 0, 0.16)',
          }}
        />
        <Text style={{ color: 'rgba(255,255,255,0.74)', fontSize: 13, fontWeight: '800' }}>
          SETTINGS
        </Text>
        <Text style={{ color: '#ffffff', fontSize: 30, lineHeight: 36, fontWeight: '900' }}>
          Manage your LectrAI experience.
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.84)', fontSize: 15, lineHeight: 22 }}>
          Signed in as {topEmail}
        </Text>
      </View>

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
        description="Control microphone, storage, and notification access."
        onPress={() => router.push('/(tabs)/settings/permissions')}
      />
      <View
        style={{
          borderRadius: 24,
          borderCurve: 'continuous',
          backgroundColor: CARD,
          borderWidth: 1,
          borderColor: BORDER,
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
            backgroundColor: loggingOut ? '#ffb480' : ORANGE,
            opacity: pressed ? 0.92 : 1,
          })}
        >
          {loggingOut ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '900' }}>
              Log Out
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
