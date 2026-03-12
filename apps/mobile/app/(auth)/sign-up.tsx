import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { AuthScreen } from '../../components/auth/auth-screen';
import { signInWithGoogle, signUpWithEmailAndPassword } from '../../services/auth-api';

export default function SignUpRoute() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await signUpWithEmailAndPassword(email.trim(), password);
      Alert.alert('Account created', 'Your account has been created successfully.');
      router.replace('/login');
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : 'Unable to create account. Please try again.'
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
      mode="signup"
      email={email}
      password={password}
      confirmPassword={confirmPassword}
      loading={loading}
      error={error}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onConfirmPasswordChange={setConfirmPassword}
      onSubmit={onSubmit}
      onGooglePress={onGooglePress}
    />
  );
}
