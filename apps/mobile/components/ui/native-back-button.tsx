import { Pressable, Text } from 'react-native';
import type { AppTheme } from '../../services/app-theme';

export function NativeBackButton({
  theme,
  onPress,
}: {
  theme: AppTheme;
  onPress: () => void;
}) {
  const backgroundColor = theme.resolvedMode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.92)';
  const shadowColor = theme.resolvedMode === 'dark' ? '#000000' : '#0f172a';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go back"
      onPress={onPress}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 999,
        borderCurve: 'continuous',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor,
        opacity: pressed ? 0.86 : 1,
        shadowColor,
        shadowOpacity: theme.resolvedMode === 'dark' ? 0.26 : 0.12,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 3,
      })}
    >
      <Text
        style={{
          color: theme.resolvedMode === 'dark' ? theme.colors.text : '#111111',
          fontSize: 27,
          lineHeight: 27,
          fontWeight: '800',
          marginLeft: -2,
        }}
      >
        ‹
      </Text>
    </Pressable>
  );
}
