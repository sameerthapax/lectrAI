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
  CARD,
  BORDER,
} from '../../../components/settings/settings-ui';
import { useAuth } from '../../../providers/auth-provider';
import { useSettings } from '../../../providers/settings-provider';

export default function SettingsHomeRoute() {
  const auth = useAuth();
  const { loading } = useSettings();
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
      contentContainerStyle={{
        padding: 16,
        gap: 14,
        paddingBottom: 32,
        backgroundColor: '#f7f6f2',
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
          <Text style={{ color: '#0f172a', fontSize: 30, fontWeight: '800' }}>
            Settings
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
    </ScrollView>
  );
}
