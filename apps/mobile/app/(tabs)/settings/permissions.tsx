import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Alert } from 'react-native';
import {
  Divider,
  SectionCard,
  SettingsLoadingState,
  SettingsScreen,
  ToggleRow,
} from '../../../components/settings/settings-ui';
import { useSettings } from '../../../providers/settings-provider';

export default function SettingsPermissionsRoute() {
  const { loading, settings, updatePermissionSetting } = useSettings();

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const syncMicrophonePermission = async () => {
        try {
          const permission = await getRecordingPermissionsAsync();

          if (!cancelled && settings?.permissions.microphone && !permission.granted) {
            updatePermissionSetting('microphone', false);
          }
        } catch {
          // Keep the current toggle state if the platform cannot resolve permission status.
        }
      };

      void syncMicrophonePermission();

      return () => {
        cancelled = true;
      };
    }, [settings?.permissions.microphone, updatePermissionSetting])
  );

  if (loading || !settings) {
    return <SettingsLoadingState />;
  }

  const onMicrophoneToggle = async (value: boolean) => {
    if (!value) {
      updatePermissionSetting('microphone', false);
      return;
    }

    try {
      const currentPermission = await getRecordingPermissionsAsync();

      if (currentPermission.granted) {
        updatePermissionSetting('microphone', true);
        return;
      }

      const requestedPermission = await requestRecordingPermissionsAsync();

      if (requestedPermission.granted) {
        updatePermissionSetting('microphone', true);
        return;
      }

      updatePermissionSetting('microphone', false);
      Alert.alert(
        'Microphone permission denied',
        requestedPermission.canAskAgain
          ? 'LectrAI needs microphone access to record lectures.'
          : 'Microphone access is blocked on this device. Enable it in system settings to record lectures.'
      );
    } catch (error) {
      updatePermissionSetting('microphone', false);
      Alert.alert(
        'Permission check failed',
        error instanceof Error
          ? error.message
          : 'Unable to verify microphone access right now.'
      );
    }
  };

  return (
    <SettingsScreen
      title="Permissions"
      subtitle="Control the app access used for recording, files, and alerts."
    >
      <SectionCard
        title="Permission Controls"
      >
        <ToggleRow
          title="Microphone access"
          description="Required when recording lectures directly in LectrAI."
          value={settings.permissions.microphone}
          onValueChange={(value) => {
            void onMicrophoneToggle(value);
          }}
        />
        <Divider />
        <ToggleRow
          title="Storage access"
          description="Required for managing lecture audio files stored on your device."
          value={settings.permissions.storage}
          onValueChange={(value) => updatePermissionSetting('storage', value)}
        />
        <Divider />
        <ToggleRow
          title="Notification permission"
          description="Allows LectrAI to surface reminders and lecture updates immediately."
          value={settings.permissions.notifications}
          onValueChange={(value) => updatePermissionSetting('notifications', value)}
        />
      </SectionCard>
    </SettingsScreen>
  );
}
