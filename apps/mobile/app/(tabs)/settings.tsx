import { ScrollView, Text, View } from 'react-native';

export default function SettingsRoute() {
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
          This is the Settings page with native tabs navigation.
        </Text>
      </View>
    </ScrollView>
  );
}
