import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { AuthScreen } from '../../components/auth/auth-screen';
import { useAuth } from '../../providers/auth-provider';

export default function LoginRoute() {
  const auth = useAuth();
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
      await auth.signIn(email.trim(), password);
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

  return (
    <AuthScreen
      mode="login"
      email={email}
      password={password}
      confirmPassword=""
      fullName=""
      universityName=""
      major=""
      timezone=""
      loading={loading}
      error={error}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onFullNameChange={undefined}
      onUniversityNameChange={undefined}
      onMajorChange={undefined}
      onTimezoneChange={undefined}
      onSubmit={onSubmit}
    />
  );
}
