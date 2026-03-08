import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { AuthScreen } from '../../components/auth/auth-screen';
import { signInWithEmailAndPassword, signInWithGoogle } from '../../services/auth-api';

export default function LoginRoute() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await signInWithEmailAndPassword(email.trim(), password);
      Alert.alert('Signed in', 'Your account has been signed in successfully.');
      router.replace('/(tabs)/home');
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : 'Unable to sign in. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const onGooglePress = async () => {
    try {
      setLoading(true);
      setError(null);
      await signInWithGoogle();
    } catch (googleError) {
      setError(
        googleError instanceof Error
          ? googleError.message
          : 'Google sign-in is currently unavailable.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen
      mode="login"
      email={email}
      password={password}
      confirmPassword=""
      loading={loading}
      error={error}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onSubmit={onSubmit}
      onGooglePress={onGooglePress}
      onBypassPress={() => router.replace('/(tabs)/home')}
    />
  );
}
