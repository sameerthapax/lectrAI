import React from 'react';
import { ScrollView, Text, View } from 'react-native';

export const SettingsPage = () => {
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
        <Text
          selectable
          style={{ fontSize: 26, fontWeight: '700', color: '#122033' }}
        >
          Settings
        </Text>
        <Text
          selectable
          style={{ paddingTop: 8, fontSize: 16, color: '#344155', lineHeight: 22 }}
        >
          This is the Settings page with basic account and app options.
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
        <Text selectable style={{ fontSize: 17, fontWeight: '600', color: '#122033' }}>
          Preferences
        </Text>
        <Text
          selectable
          style={{ paddingTop: 8, fontSize: 15, color: '#49566a', lineHeight: 20 }}
        >
          Theme, notifications, and profile controls can be placed here.
        </Text>
      </View>
    </ScrollView>
  );
};
