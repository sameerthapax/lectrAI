import { Pressable, Text, View } from 'react-native';
import {
  Divider,
  SectionCard,
  SettingsLoadingState,
  SettingsScreen,
} from '../../../components/settings/settings-ui';
import { useSettings } from '../../../providers/settings-provider';
import type { ThemeMode } from '../../../services/app-theme';

const THEME_OPTIONS: Array<{
  value: ThemeMode;
  title: string;
  description: string;
}> = [
  {
    value: 'system',
    title: 'Use phone setting',
    description: 'Automatically match your device appearance as it changes.',
  },
  {
    value: 'light',
    title: 'Light',
    description: 'Keep LectrAI in light mode.',
  },
  {
    value: 'dark',
    title: 'Dark',
    description: 'Keep LectrAI in dark mode.',
  },
];

export default function SettingsAppearanceRoute() {
  const { loading, settings, theme, updateThemeMode } = useSettings();

  if (loading || !settings) {
    return <SettingsLoadingState />;
  }

  return (
    <SettingsScreen
      title="Appearance"
      subtitle="Choose whether LectrAI follows your phone appearance or stays fixed in one mode."
    >
      <SectionCard
        title="Theme"
        description={`Current appearance: ${theme.resolvedMode === 'dark' ? 'Dark' : 'Light'}.`}
      >
        {THEME_OPTIONS.map((option, index) => {
          const selected = settings.appearance.themeMode === option.value;

          return (
            <View key={option.value} style={{ gap: 14 }}>
              <Pressable
                onPress={() => updateThemeMode(option.value)}
                style={({ pressed }) => ({
                  borderRadius: 18,
                  borderCurve: 'continuous',
                  borderWidth: 1,
                  borderColor: selected ? theme.colors.accent : theme.colors.border,
                  backgroundColor: selected ? theme.colors.accentSoft : theme.colors.cardMuted,
                  paddingHorizontal: 16,
                  paddingVertical: 15,
                  opacity: pressed ? 0.92 : 1,
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
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontSize: 16,
                        lineHeight: 21,
                        fontWeight: '800',
                      }}
                    >
                      {option.title}
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.textMuted,
                        fontSize: 14,
                        lineHeight: 20,
                      }}
                    >
                      {option.description}
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      borderWidth: 2,
                      borderColor: selected ? theme.colors.accent : theme.colors.textSubtle,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {selected ? (
                      <View
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          backgroundColor: theme.colors.accent,
                        }}
                      />
                    ) : null}
                  </View>
                </View>
              </Pressable>
              {index < THEME_OPTIONS.length - 1 ? <Divider /> : null}
            </View>
          );
        })}
      </SectionCard>
    </SettingsScreen>
  );
}
