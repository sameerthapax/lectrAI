import { Link } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

type AuthMode = 'login' | 'signup';

type AuthScreenProps = {
  mode: AuthMode;
  email: string;
  password: string;
  confirmPassword: string;
  loading: boolean;
  error: string | null;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange?: (value: string) => void;
  onSubmit: () => void;
  onGooglePress: () => void;
  onBypassPress?: () => void;
};

const ORANGE = '#ff6a00';
const BLACK = '#0b0b0b';
const WHITE = '#ffffff';

export function AuthScreen({
  mode,
  email,
  password,
  confirmPassword,
  loading,
  error,
  onEmailChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onSubmit,
  onGooglePress,
  onBypassPress,
}: AuthScreenProps) {
  const isSignUp = mode === 'signup';

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        minHeight: '100%',
        padding: 16,
        justifyContent: 'center',
        gap: 20,
        backgroundColor: WHITE,
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
            ? 'Sign up with email and password, or continue with Google.'
            : 'Sign in with email and password, or continue with Google.'}
        </Text>
      </View>

      <View
        style={{
          borderRadius: 24,
          borderCurve: 'continuous',
          padding: 18,
          gap: 12,
          backgroundColor: WHITE,
          borderWidth: 1,
          borderColor: '#ececec',
          boxShadow: '0 10px 30px rgba(17, 17, 17, 0.08)',
        }}
      >
        <Text selectable style={{ fontSize: 13, fontWeight: '600', color: '#222' }}>
          Email
        </Text>
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={onEmailChange}
          placeholder="you@example.com"
          placeholderTextColor="#8f8f8f"
          style={{
            borderWidth: 1,
            borderColor: '#e5e5e5',
            borderRadius: 14,
            borderCurve: 'continuous',
            backgroundColor: '#fffdfb',
            paddingHorizontal: 14,
            paddingVertical: 12,
            color: BLACK,
            fontSize: 16,
          }}
        />

        <Text selectable style={{ fontSize: 13, fontWeight: '600', color: '#222' }}>
          Password
        </Text>
        <TextInput
          secureTextEntry
          textContentType={isSignUp ? 'newPassword' : 'password'}
          value={password}
          onChangeText={onPasswordChange}
          placeholder="••••••••"
          placeholderTextColor="#8f8f8f"
          style={{
            borderWidth: 1,
            borderColor: '#e5e5e5',
            borderRadius: 14,
            borderCurve: 'continuous',
            backgroundColor: '#fffdfb',
            paddingHorizontal: 14,
            paddingVertical: 12,
            color: BLACK,
            fontSize: 16,
          }}
        />

        {isSignUp ? (
          <>
            <Text selectable style={{ fontSize: 13, fontWeight: '600', color: '#222' }}>
              Confirm password
            </Text>
            <TextInput
              secureTextEntry
              textContentType="newPassword"
              value={confirmPassword}
              onChangeText={onConfirmPasswordChange}
              placeholder="••••••••"
              placeholderTextColor="#8f8f8f"
              style={{
                borderWidth: 1,
                borderColor: '#e5e5e5',
                borderRadius: 14,
                borderCurve: 'continuous',
                backgroundColor: '#fffdfb',
                paddingHorizontal: 14,
                paddingVertical: 12,
                color: BLACK,
                fontSize: 16,
              }}
            />
          </>
        ) : null}

        {error ? (
          <Text selectable style={{ color: '#b42318', fontSize: 13, fontWeight: '600' }}>
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
            backgroundColor: loading ? '#ffb480' : ORANGE,
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

        <Pressable
          disabled={loading}
          onPress={onGooglePress}
          style={({ pressed }) => ({
            borderRadius: 14,
            borderCurve: 'continuous',
            minHeight: 50,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: '#d8d8d8',
            backgroundColor: WHITE,
            opacity: pressed ? 0.95 : 1,
          })}
        >
          <Text selectable style={{ color: BLACK, fontSize: 16, fontWeight: '700' }}>
            Continue with Google
          </Text>
        </Pressable>

        {onBypassPress ? (
          <Pressable
            disabled={loading}
            onPress={onBypassPress}
            style={({ pressed }) => ({
              borderRadius: 14,
              borderCurve: 'continuous',
              minHeight: 46,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: '#e7e7e7',
              backgroundColor: '#fffdfb',
              opacity: pressed ? 0.95 : 1,
            })}
          >
            <Text selectable style={{ color: '#4d4d4d', fontSize: 14, fontWeight: '700' }}>
              Bypass for now
            </Text>
          </Pressable>
        ) : null}

        <Text selectable style={{ textAlign: 'center', fontSize: 14, color: '#4a4a4a' }}>
          {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          <Link href={isSignUp ? '/login' : '/sign-up'} style={{ color: ORANGE, fontWeight: '700' }}>
            {isSignUp ? 'Sign in' : 'Create one'}
          </Link>
        </Text>
      </View>
    </ScrollView>
  );
}
