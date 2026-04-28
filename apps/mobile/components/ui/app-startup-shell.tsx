import { ActivityIndicator, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useAppTheme } from '../../providers/settings-provider';
const appLogo = require('../../assets/images/icon.png');

export function AppStartupShell() {
  const theme = useAppTheme();

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        backgroundColor: theme.colors.screen,
        paddingHorizontal: 24,
      }}
    >
      <View
        style={{
          width: 144,
          height: 144,
          borderRadius: 36,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.resolvedMode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.52)',
          borderWidth: 1,
          borderColor: theme.resolvedMode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(234, 223, 206, 0.92)',
        }}
      >
        <Image
          source={appLogo}
          contentFit="contain"
          style={{ width: 104, height: 104 }}
        />
      </View>

      <View style={{ alignItems: 'center', gap: 8 }}>
        <Text
          style={{
            color: theme.colors.text,
            fontSize: 28,
            lineHeight: 32,
            fontWeight: '900',
          }}
        >
          LectrAI
        </Text>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: 14,
            lineHeight: 20,
            textAlign: 'center',
          }}
        >
          Restoring your study workspace
        </Text>
      </View>

      <ActivityIndicator
        size="small"
        color={theme.colors.accent}
      />
    </View>
  );
}
