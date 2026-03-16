import * as SecureStore from 'expo-secure-store';

const ONBOARDING_STORAGE_KEY = 'lectrai.onboarding.completed';

export async function getHasCompletedOnboarding() {
  const value = await SecureStore.getItemAsync(ONBOARDING_STORAGE_KEY);
  return value === 'true';
}

export async function setHasCompletedOnboarding(value: boolean) {
  if (value) {
    await SecureStore.setItemAsync(ONBOARDING_STORAGE_KEY, 'true');
    return;
  }

  await SecureStore.deleteItemAsync(ONBOARDING_STORAGE_KEY);
}
