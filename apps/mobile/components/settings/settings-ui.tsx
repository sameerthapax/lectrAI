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
import { useAppTheme } from '../../providers/settings-provider';

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
  const theme = useAppTheme();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.colors.screen }}
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: 16,
        paddingTop: 18,
        paddingBottom: 32,
        gap: 14,
        backgroundColor: theme.colors.screen,
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
            backgroundColor: theme.resolvedMode === 'dark' ? '#20262b' : 'rgba(255,255,255,0.72)',
            borderWidth: 1,
            borderColor: theme.colors.border,
            opacity: pressed ? 0.88 : 1,
          })}
        >
          <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>←</Text>
        </Pressable>
        <Text style={{ color: theme.colors.text, fontSize: 30, lineHeight: 36, fontWeight: '900' }}>
          {title}
        </Text>
      </View>

      {subtitle ? (
        <Text
          style={{
            marginTop: -4,
            textAlign: 'center',
            color: theme.colors.textMuted,
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
  const theme = useAppTheme();

  return (
    <View
      style={{
        borderRadius: 24,
        borderCurve: 'continuous',
        backgroundColor: theme.colors.card,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: 18,
        gap: 16,
      }}
    >
      <View style={{ gap: description ? 6 : 0 }}>
        <Text style={{ color: theme.colors.text, fontSize: 22, lineHeight: 28, fontWeight: '900' }}>
          {title}
        </Text>
        {description ? (
          <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 21 }}>{description}</Text>
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
  const theme = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 24,
        borderCurve: 'continuous',
        backgroundColor: theme.colors.card,
        borderWidth: 1,
        borderColor: theme.colors.border,
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
          <Text style={{ color: theme.colors.text, fontSize: 20, lineHeight: 25, fontWeight: '900' }}>
            {title}
          </Text>
          <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 21 }}>{description}</Text>
        </View>
        <Text style={{ color: theme.colors.accent, fontSize: 24, fontWeight: '800' }}>›</Text>
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
  const theme = useAppTheme();

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '800' }}>{label}</Text>
      <TextInput
        value={value}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.inputPlaceholder}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? 'words'}
        onChangeText={onChangeText}
        style={{
          minHeight: 52,
          borderRadius: 16,
          borderCurve: 'continuous',
          borderWidth: 1,
          borderColor: theme.colors.inputBorder,
          backgroundColor: theme.colors.inputBackground,
          paddingHorizontal: 14,
          color: theme.colors.text,
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
  const theme = useAppTheme();

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
        <Text style={{ color: theme.colors.text, fontSize: 16, lineHeight: 21, fontWeight: '800' }}>
          {title}
        </Text>
        <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 }}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.colors.switchTrackOff, true: theme.colors.switchTrackOn }}
        thumbColor={value ? theme.colors.switchThumbOn : theme.colors.switchThumbOff}
      />
    </View>
  );
}

export function Divider() {
  const theme = useAppTheme();

  return <View style={{ height: 1, backgroundColor: theme.colors.hairline }} />;
}
