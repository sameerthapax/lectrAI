import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { AuthScreen } from '../../components/auth/auth-screen';
import { useAuth } from '../../providers/auth-provider';

export default function SignUpRoute() {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [universityName, setUniversityName] = useState('');
  const [major, setMajor] = useState('');
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (
      !email.trim() ||
      !password.trim() ||
      !fullName.trim() ||
      !universityName.trim() ||
      !major.trim() ||
      !timezone.trim()
    ) {
      setError('All fields are required.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const result = await auth.signUp({
        email: email.trim(),
        password,
        fullName: fullName.trim(),
        universityName: universityName.trim(),
        major: major.trim(),
        timezone: timezone.trim(),
        role: 'student',
      });
      Alert.alert(
        'Account created',
        result.emailVerificationRequired
          ? 'Check your email to verify your account, then sign in.'
          : 'Your account has been created successfully.'
      );
      router.replace(result.session ? '/(tabs)/home' : '/login');
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

  return (
    <AuthScreen
      mode="signup"
      email={email}
      password={password}
      confirmPassword={confirmPassword}
      fullName={fullName}
      universityName={universityName}
      major={major}
      timezone={timezone}
      loading={loading}
      error={error}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onFullNameChange={setFullName}
      onUniversityNameChange={setUniversityName}
      onMajorChange={setMajor}
      onTimezoneChange={setTimezone}
      onConfirmPasswordChange={setConfirmPassword}
      onSubmit={onSubmit}
    />
  );
}
