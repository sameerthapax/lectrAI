import { BlurView } from 'expo-blur';
import { Pressable, Text, View } from 'react-native';
import { useAppTheme } from '../../providers/settings-provider';

type GlassButtonVariant = 'accent' | 'neutral' | 'subtle' | 'info' | 'danger';
type GlassButtonSize = 'pill' | 'circle' | 'circle-sm';

export function GlassButton({
  label,
  onPress,
  variant = 'neutral',
  size = 'pill',
  disabled = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: GlassButtonVariant;
  size?: GlassButtonSize;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const theme = useAppTheme();
  const palette = getPalette(theme, variant);
  const isCircle = size === 'circle' || size === 'circle-sm';
  const circleDiameter = size === 'circle-sm' ? 26 : 48;
  const circleFontSize = size === 'circle-sm' ? 12 : 20;
  const circleLineHeight = size === 'circle-sm' ? 14 : 22;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: isCircle ? circleDiameter : undefined,
        width: isCircle ? circleDiameter : undefined,
        height: isCircle ? circleDiameter : 44,
        borderRadius: 999,
        borderCurve: 'continuous',
        overflow: 'hidden',
        opacity: disabled ? 0.5 : pressed ? 0.88 : 1,
        shadowColor: palette.shadowColor,
        shadowOpacity: theme.resolvedMode === 'dark' ? 0.26 : 0.14,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
        elevation: 4,
      })}
    >
      <View
        style={{
          flex: 1,
          borderRadius: 999,
          borderCurve: 'continuous',
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: palette.borderColor,
          backgroundColor: palette.fallbackBackground,
        }}
      >
        <BlurView
          intensity={theme.resolvedMode === 'dark' ? 38 : 55}
          tint={theme.resolvedMode === 'dark' ? 'dark' : 'light'}
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: isCircle ? 0 : 16,
            backgroundColor: palette.overlayColor,
          }}
        >
          <Text
            style={{
              color: palette.textColor,
              fontSize: isCircle ? circleFontSize : 14,
              lineHeight: isCircle ? circleLineHeight : 18,
              fontWeight: '800',
              marginTop: isCircle ? -1 : 0,
            }}
          >
            {label}
          </Text>
        </BlurView>
      </View>
    </Pressable>
  );
}

function getPalette(theme: ReturnType<typeof useAppTheme>, variant: GlassButtonVariant) {
  switch (variant) {
    case 'accent':
      return {
        textColor: theme.colors.accentContrast,
        borderColor: theme.resolvedMode === 'dark' ? 'rgba(255, 180, 128, 0.36)' : 'rgba(255, 140, 66, 0.28)',
        overlayColor: theme.resolvedMode === 'dark' ? 'rgba(255, 138, 61, 0.68)' : 'rgba(255, 106, 0, 0.88)',
        fallbackBackground: theme.colors.accent,
        shadowColor: theme.colors.accent,
      };
    case 'subtle':
      return {
        textColor: theme.colors.text,
        borderColor: theme.resolvedMode === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.72)',
        overlayColor: theme.resolvedMode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.58)',
        fallbackBackground: theme.colors.overlay,
        shadowColor: '#0f172a',
      };
    case 'info':
      return {
        textColor: '#ffffff',
        borderColor: theme.resolvedMode === 'dark' ? 'rgba(147, 197, 253, 0.28)' : 'rgba(96, 165, 250, 0.26)',
        overlayColor: theme.resolvedMode === 'dark' ? 'rgba(59, 130, 246, 0.62)' : 'rgba(37, 99, 235, 0.88)',
        fallbackBackground: '#2563eb',
        shadowColor: '#2563eb',
      };
    case 'danger':
      return {
        textColor: '#ffffff',
        borderColor: theme.resolvedMode === 'dark' ? 'rgba(252, 165, 165, 0.26)' : 'rgba(248, 113, 113, 0.24)',
        overlayColor: theme.resolvedMode === 'dark' ? 'rgba(239, 68, 68, 0.58)' : 'rgba(239, 68, 68, 0.88)',
        fallbackBackground: theme.colors.danger,
        shadowColor: theme.colors.danger,
      };
    case 'neutral':
    default:
      return {
        textColor: theme.colors.text,
        borderColor: theme.resolvedMode === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(226, 232, 240, 0.95)',
        overlayColor: theme.resolvedMode === 'dark' ? 'rgba(32, 38, 43, 0.72)' : 'rgba(255,255,255,0.68)',
        fallbackBackground: theme.colors.neutralSoft,
        shadowColor: '#0f172a',
      };
  }
}
