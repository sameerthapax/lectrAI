import { registerRootComponent } from 'expo';
import { ExpoRoot } from 'expo-router';

// Must be exported so Fast Refresh can update the context
export function App() {
  // Manually define the app directory path here
  const ctx = require.context('./app');
  return <ExpoRoot context={ctx} />;
}

registerRootComponent(App);
