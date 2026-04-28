import { Pressable, Text } from 'react-native';
import type { AppTheme } from '../../services/app-theme';

export function NativeBackButton({
  theme,
  onPress,
}: {
  theme: AppTheme;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go back"
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: 28,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.58 : 1,
        paddingRight: 6,
      })}
    >
      <Text
        style={{
          color: theme.colors.text,
          fontSize: 34,
          lineHeight: 34,
          fontWeight: '500',
        }}
      >
        ‹
      </Text>
    </Pressable>
  );
}
