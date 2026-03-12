import { ScrollView, Text, View } from 'react-native';
import { useAuth } from '../../providers/auth-provider';

export default function HomeRoute() {
  const auth = useAuth();

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
          borderRadius: 20,
          borderCurve: 'continuous',
          padding: 16,
          gap: 10,
          backgroundColor: '#0d0d0d',
          boxShadow: '0 16px 36px rgba(0, 0, 0, 0.18)',
        }}
      >
        <Text selectable style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.78)', fontWeight: '600' }}>
          Welcome
        </Text>
        <Text selectable style={{ fontSize: 24, lineHeight: 30, color: '#ffffff', fontWeight: '800' }}>
          {auth.user?.fullName ?? 'LectrAI'}
        </Text>
        <Text selectable style={{ fontSize: 15, color: 'rgba(255, 255, 255, 0.78)', lineHeight: 22 }}>
          Signed in as {auth.user?.email ?? 'unknown user'}
        </Text>
      </View>

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
          Home
        </Text>
        <Text
          selectable
          style={{ paddingTop: 8, fontSize: 16, color: '#344155', lineHeight: 22 }}
        >
          Your session is now protected by the app auth gate. Unauthenticated users are redirected
          to login before they can reach this screen.
        </Text>
      </View>
    </ScrollView>
  );
}
