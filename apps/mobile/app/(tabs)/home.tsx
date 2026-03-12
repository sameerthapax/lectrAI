import { Link } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

export default function HomeRoute() {
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
          Auth
        </Text>
        <Text selectable style={{ fontSize: 24, lineHeight: 30, color: '#ffffff', fontWeight: '800' }}>
          Sign in or create your LectrAI account
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Link
            href="/login"
            style={{
              backgroundColor: '#ff6a00',
              color: '#ffffff',
              paddingVertical: 10,
              paddingHorizontal: 16,
              borderRadius: 12,
              overflow: 'hidden',
              fontWeight: '700',
            }}
          >
            Login
          </Link>
          <Link
            href="/sign-up"
            style={{
              backgroundColor: '#ffffff',
              color: '#0b0b0b',
              paddingVertical: 10,
              paddingHorizontal: 16,
              borderRadius: 12,
              overflow: 'hidden',
              fontWeight: '700',
            }}
          >
            Sign Up
          </Link>
        </View>
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
          This is the Home page with native tabs navigation.
        </Text>
      </View>
    </ScrollView>
  );
}
