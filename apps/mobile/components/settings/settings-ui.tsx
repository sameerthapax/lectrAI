import { router } from 'expo-router';
import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

export const ORANGE = '#ff6a00';
export const INK = '#0b0b0b';
export const CREAM = '#f7f1e8';
export const CARD = '#fffaf3';
export const BORDER = '#eadfce';
export const MUTED = '#6a6157';

export function SettingsLoadingState() {
  return null;
}

export function SettingsScreen({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: 18,
        paddingBottom: 32,
        gap: 14,
        backgroundColor: CREAM,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 8,
          paddingBottom: 4,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({
            position: 'absolute',
            left: 0,
            width: 38,
            height: 38,
            borderRadius: 999,
            borderCurve: 'continuous',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255,255,255,0.72)',
            borderWidth: 1,
            borderColor: BORDER,
            opacity: pressed ? 0.88 : 1,
          })}
        >
          <Text style={{ color: INK, fontSize: 18, fontWeight: '900' }}>←</Text>
        </Pressable>
        <Text style={{ color: INK, fontSize: 30, lineHeight: 36, fontWeight: '900' }}>
          {title}
        </Text>
      </View>

      {subtitle ? (
        <Text
          style={{
            marginTop: -4,
            textAlign: 'center',
            color: MUTED,
            fontSize: 14,
            lineHeight: 21,
            paddingHorizontal: 20,
          }}
        >
          {subtitle}
        </Text>
      ) : null}

      {children}
    </ScrollView>
  );
}

export function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <View
      style={{
        borderRadius: 24,
        borderCurve: 'continuous',
        backgroundColor: CARD,
        borderWidth: 1,
        borderColor: BORDER,
        padding: 18,
        gap: 16,
      }}
    >
      <View style={{ gap: description ? 6 : 0 }}>
        <Text style={{ color: INK, fontSize: 22, lineHeight: 28, fontWeight: '900' }}>
          {title}
        </Text>
        {description ? (
          <Text style={{ color: MUTED, fontSize: 14, lineHeight: 21 }}>{description}</Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function SettingsLinkCard({
  title,
  description,
  onPress,
}: {
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 24,
        borderCurve: 'continuous',
        backgroundColor: CARD,
        borderWidth: 1,
        borderColor: BORDER,
        padding: 18,
        gap: 8,
        opacity: pressed ? 0.94 : 1,
      })}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ color: INK, fontSize: 20, lineHeight: 25, fontWeight: '900' }}>
            {title}
          </Text>
          <Text style={{ color: MUTED, fontSize: 14, lineHeight: 21 }}>{description}</Text>
        </View>
        <Text style={{ color: ORANGE, fontSize: 24, fontWeight: '800' }}>›</Text>
      </View>
    </Pressable>
  );
}

export function ProfileField({
  label,
  value,
  placeholder,
  onChangeText,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'email-address' | 'number-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: '#3d3328', fontSize: 14, fontWeight: '800' }}>{label}</Text>
      <TextInput
        value={value}
        placeholder={placeholder}
        placeholderTextColor="#9b8f81"
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? 'words'}
        onChangeText={onChangeText}
        style={{
          minHeight: 52,
          borderRadius: 16,
          borderCurve: 'continuous',
          borderWidth: 1,
          borderColor: '#e2d6c7',
          backgroundColor: '#ffffff',
          paddingHorizontal: 14,
          color: INK,
          fontSize: 15,
          fontWeight: '600',
        }}
      />
    </View>
  );
}

export function ToggleRow({
  title,
  description,
  value,
  onValueChange,
}: {
  title: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: INK, fontSize: 16, lineHeight: 21, fontWeight: '800' }}>
          {title}
        </Text>
        <Text style={{ color: MUTED, fontSize: 14, lineHeight: 20 }}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#d8cec0', true: '#ffb480' }}
        thumbColor={value ? ORANGE : '#f8f1e6'}
      />
    </View>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: '#eee3d5' }} />;
}
