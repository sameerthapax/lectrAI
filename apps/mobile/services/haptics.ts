import * as Haptics from 'expo-haptics';

async function runHaptic(task: () => Promise<void>) {
  try {
    await task();
  } catch {
    // Ignore unsupported-device errors so UI interactions still complete.
  }
}

export function triggerTalkHoldStartHaptic() {
  void runHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

export function triggerTalkHoldReleaseHaptic() {
  void runHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export function triggerRecordPressHaptic() {
  void runHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

export function triggerCompletionHaptic() {
  void runHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

export function triggerSoftNavigationHaptic() {
  void runHaptic(() => Haptics.selectionAsync());
}
