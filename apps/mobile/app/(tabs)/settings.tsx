import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useAuth } from '../../providers/auth-provider';

export default function SettingsRoute() {
  const auth = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const onLogout = async () => {
    try {
      setLoggingOut(true);
      await auth.signOut();
    } catch (error) {
      Alert.alert(
        'Logout failed',
        error instanceof Error ? error.message : 'Unable to sign out right now.'
      );
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        padding: 16,
        gap: 12,
      }}
    >
      <View
        style={{
          borderRadius: 16,
          borderCurve: 'continuous',
          padding: 16,
          backgroundColor: '#ffffff',
          boxShadow: '0 2px 8px rgba(15, 23, 42, 0.08)',
        }}
      >
        <Text selectable style={{ fontSize: 26, fontWeight: '700', color: '#122033' }}>
          Settings
        </Text>
        <Text
          selectable
          style={{ paddingTop: 8, fontSize: 16, color: '#344155', lineHeight: 22 }}
        >
          Signed in as {auth.user?.email ?? 'unknown user'}.
        </Text>

        <Pressable
          disabled={loggingOut}
          onPress={onLogout}
          style={({ pressed }) => ({
            marginTop: 16,
            minHeight: 48,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 14,
            borderCurve: 'continuous',
            backgroundColor: loggingOut ? '#ffb480' : '#ff6a00',
            opacity: pressed ? 0.92 : 1,
          })}
        >
          {loggingOut ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700' }}>Log out</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}
