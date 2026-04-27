import { Link } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useAppTheme } from '../../providers/settings-provider';

type AuthMode = 'login' | 'signup';

type AuthScreenProps = {
  mode: AuthMode;
  email: string;
  password: string;
  confirmPassword: string;
  fullName: string;
  universityName: string;
  major: string;
  timezone: string;
  loading: boolean;
  error: string | null;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onFullNameChange?: (value: string) => void;
  onUniversityNameChange?: (value: string) => void;
  onMajorChange?: (value: string) => void;
  onTimezoneChange?: (value: string) => void;
  onConfirmPasswordChange?: (value: string) => void;
  onSubmit: () => void;
};

const ORANGE = '#ff6a00';
const BLACK = '#0b0b0b';
const WHITE = '#ffffff';

export function AuthScreen({
  mode,
  email,
  password,
  confirmPassword,
  fullName,
  universityName,
  major,
  timezone,
  loading,
  error,
  onEmailChange,
  onPasswordChange,
  onFullNameChange,
  onUniversityNameChange,
  onMajorChange,
  onTimezoneChange,
  onConfirmPasswordChange,
  onSubmit,
}: AuthScreenProps) {
  const theme = useAppTheme();
  const isSignUp = mode === 'signup';

  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: theme.colors.screen }}
      contentContainerStyle={{
        minHeight: '100%',
        padding: 16,
        justifyContent: 'center',
        gap: 20,
        backgroundColor: theme.colors.screen,
      }}
    >
      <View
        style={{
          borderRadius: 28,
          borderCurve: 'continuous',
          padding: 24,
          gap: 8,
          backgroundColor: BLACK,
          overflow: 'hidden',
          boxShadow: '0 30px 55px rgba(0, 0, 0, 0.22)',
        }}
      >
        <View
          style={{
            position: 'absolute',
            right: -45,
            top: -55,
            width: 170,
            height: 170,
            borderRadius: 999,
            backgroundColor: 'rgba(255, 106, 0, 0.28)',
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: -35,
            bottom: -75,
            width: 160,
            height: 160,
            borderRadius: 999,
            backgroundColor: 'rgba(255, 106, 0, 0.18)',
          }}
        />

        <Text selectable style={{ fontSize: 14, color: 'rgba(255, 255, 255, 0.75)', fontWeight: '600' }}>
          LectrAI
        </Text>
        <Text selectable style={{ fontSize: 34, lineHeight: 40, color: WHITE, fontWeight: '800' }}>
          {isSignUp ? 'Create your account' : 'Welcome back'}
        </Text>
        <Text selectable style={{ fontSize: 15, color: 'rgba(255, 255, 255, 0.75)', lineHeight: 22 }}>
          {isSignUp
            ? 'Create your account with email verification enabled.'
            : 'Sign in with your verified email and password.'}
        </Text>
      </View>

      <View
        style={{
          borderRadius: 24,
          borderCurve: 'continuous',
          padding: 18,
          gap: 12,
          backgroundColor: theme.colors.card,
          borderWidth: 1,
          borderColor: theme.colors.border,
          boxShadow: '0 10px 30px rgba(17, 17, 17, 0.08)',
        }}
      >
        {isSignUp ? (
          <>
            <Text selectable style={{ fontSize: 13, fontWeight: '600', color: theme.colors.text }}>
              Full name
            </Text>
            <TextInput
              textContentType="name"
              value={fullName}
              onChangeText={onFullNameChange}
              placeholder="Sam Student"
              placeholderTextColor={theme.colors.inputPlaceholder}
              style={{
                borderWidth: 1,
                borderColor: theme.colors.inputBorder,
                borderRadius: 14,
                borderCurve: 'continuous',
                backgroundColor: theme.colors.inputBackground,
                paddingHorizontal: 14,
                paddingVertical: 12,
                color: theme.colors.text,
                fontSize: 16,
              }}
            />
          </>
        ) : null}

        <Text selectable style={{ fontSize: 13, fontWeight: '600', color: theme.colors.text }}>
          Email
        </Text>
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={onEmailChange}
          placeholder="you@example.com"
          placeholderTextColor={theme.colors.inputPlaceholder}
          style={{
            borderWidth: 1,
            borderColor: theme.colors.inputBorder,
            borderRadius: 14,
            borderCurve: 'continuous',
            backgroundColor: theme.colors.inputBackground,
            paddingHorizontal: 14,
            paddingVertical: 12,
            color: theme.colors.text,
            fontSize: 16,
          }}
        />

        <Text selectable style={{ fontSize: 13, fontWeight: '600', color: theme.colors.text }}>
          Password
        </Text>
        <TextInput
          secureTextEntry
          textContentType={isSignUp ? 'newPassword' : 'password'}
          value={password}
          onChangeText={onPasswordChange}
          placeholder="••••••••"
          placeholderTextColor={theme.colors.inputPlaceholder}
          style={{
            borderWidth: 1,
            borderColor: theme.colors.inputBorder,
            borderRadius: 14,
            borderCurve: 'continuous',
            backgroundColor: theme.colors.inputBackground,
            paddingHorizontal: 14,
            paddingVertical: 12,
            color: theme.colors.text,
            fontSize: 16,
          }}
        />

        {isSignUp ? (
          <>
            <Text selectable style={{ fontSize: 13, fontWeight: '600', color: theme.colors.text }}>
              University
            </Text>
            <TextInput
              textContentType="organizationName"
              value={universityName}
              onChangeText={onUniversityNameChange}
              placeholder="Murray State University"
              placeholderTextColor={theme.colors.inputPlaceholder}
              style={{
                borderWidth: 1,
                borderColor: theme.colors.inputBorder,
                borderRadius: 14,
                borderCurve: 'continuous',
                backgroundColor: theme.colors.inputBackground,
                paddingHorizontal: 14,
                paddingVertical: 12,
                color: theme.colors.text,
                fontSize: 16,
              }}
            />

            <Text selectable style={{ fontSize: 13, fontWeight: '600', color: theme.colors.text }}>
              Major
            </Text>
            <TextInput
              value={major}
              onChangeText={onMajorChange}
              placeholder="Computer Science"
              placeholderTextColor={theme.colors.inputPlaceholder}
              style={{
                borderWidth: 1,
                borderColor: theme.colors.inputBorder,
                borderRadius: 14,
                borderCurve: 'continuous',
                backgroundColor: theme.colors.inputBackground,
                paddingHorizontal: 14,
                paddingVertical: 12,
                color: theme.colors.text,
                fontSize: 16,
              }}
            />

            <Text selectable style={{ fontSize: 13, fontWeight: '600', color: theme.colors.text }}>
              Timezone
            </Text>
            <TextInput
              autoCapitalize="none"
              value={timezone}
              onChangeText={onTimezoneChange}
              placeholder="America/Chicago"
              placeholderTextColor={theme.colors.inputPlaceholder}
              style={{
                borderWidth: 1,
                borderColor: theme.colors.inputBorder,
                borderRadius: 14,
                borderCurve: 'continuous',
                backgroundColor: theme.colors.inputBackground,
                paddingHorizontal: 14,
                paddingVertical: 12,
                color: theme.colors.text,
                fontSize: 16,
              }}
            />

            <Text selectable style={{ fontSize: 13, fontWeight: '600', color: theme.colors.text }}>
              Confirm password
            </Text>
            <TextInput
              secureTextEntry
              textContentType="newPassword"
              value={confirmPassword}
              onChangeText={onConfirmPasswordChange}
              placeholder="••••••••"
              placeholderTextColor={theme.colors.inputPlaceholder}
              style={{
                borderWidth: 1,
                borderColor: theme.colors.inputBorder,
                borderRadius: 14,
                borderCurve: 'continuous',
                backgroundColor: theme.colors.inputBackground,
                paddingHorizontal: 14,
                paddingVertical: 12,
                color: theme.colors.text,
                fontSize: 16,
              }}
            />
          </>
        ) : null}

        {error ? (
          <Text selectable style={{ color: theme.colors.danger, fontSize: 13, fontWeight: '600' }}>
            {error}
          </Text>
        ) : null}

        <Pressable
          disabled={loading}
          onPress={onSubmit}
          style={({ pressed }) => ({
            marginTop: 4,
            borderRadius: 14,
            borderCurve: 'continuous',
            minHeight: 50,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: loading ? theme.colors.switchTrackOn : ORANGE,
            opacity: pressed ? 0.9 : 1,
          })}
        >
          {loading ? (
            <ActivityIndicator color={WHITE} />
          ) : (
            <Text selectable style={{ color: WHITE, fontSize: 16, fontWeight: '700' }}>
              {isSignUp ? 'Create account' : 'Sign in'}
            </Text>
          )}
        </Pressable>
        <Text selectable style={{ textAlign: 'center', fontSize: 14, color: theme.colors.textMuted }}>
          {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          <Link href={isSignUp ? '/login' : '/sign-up'} style={{ color: ORANGE, fontWeight: '700' }}>
            {isSignUp ? 'Sign in' : 'Create one'}
          </Link>
        </Text>
      </View>
    </ScrollView>
  );
}
