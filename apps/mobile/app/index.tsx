import { Redirect } from 'expo-router';
import { useAuth } from '../providers/auth-provider';

export default function IndexRoute() {
  const auth = useAuth();

  if (auth.status === 'authenticated') {
    return <Redirect href="/(tabs)/home" />;
  }

  return <Redirect href="/login" />;
}
