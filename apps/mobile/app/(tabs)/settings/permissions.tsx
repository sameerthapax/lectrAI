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

      const syncPermissions = async () => {
        try {
          const microphonePermission = await getRecordingPermissionsAsync();

          if (!cancelled && settings?.permissions.microphone && !microphonePermission.granted) {
            updatePermissionSetting('microphone', false);
          }

          const notificationsModule = await loadNotificationsModule();
          const notificationPermission = notificationsModule
            ? await notificationsModule.getPermissionsAsync()
            : null;

          if (!cancelled && settings?.permissions.notifications && !notificationPermission?.granted) {
            updatePermissionSetting('notifications', false);
          }
        } catch {
          // Keep the current toggle state if the platform cannot resolve permission status.
        }
      };

      void syncPermissions();

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

  const onFileAccessToggle = (value: boolean) => {
    updatePermissionSetting('storage', value);
  };

  const onNotificationsToggle = async (value: boolean) => {
    if (!value) {
      updatePermissionSetting('notifications', false);
      return;
    }

    try {
      const notificationsModule = await loadNotificationsModule();

      if (!notificationsModule) {
        updatePermissionSetting('notifications', false);
        Alert.alert(
          'Notifications unavailable',
          'expo-notifications is not installed in this build yet.'
        );
        return;
      }

      const currentPermission = await notificationsModule.getPermissionsAsync();

      if (currentPermission.granted) {
        updatePermissionSetting('notifications', true);
        return;
      }

      const requestedPermission = await notificationsModule.requestPermissionsAsync();

      if (requestedPermission.granted) {
        updatePermissionSetting('notifications', true);
        return;
      }

      updatePermissionSetting('notifications', false);
      Alert.alert(
        'Notification permission denied',
        requestedPermission.canAskAgain
          ? 'LectrAI needs notification permission to deliver alerts and reminders.'
          : 'Notification access is blocked on this device. Enable it in system settings to receive alerts and reminders.'
      );
    } catch (error) {
      updatePermissionSetting('notifications', false);
      Alert.alert(
        'Permission check failed',
        error instanceof Error ? error.message : 'Unable to verify notification access right now.'
      );
    }
  };

  return (
    <SettingsScreen
      title="Permissions"
      subtitle="Control device permissions and app features used for recording, uploads, and alerts."
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
          title="Enable file uploads"
          description="Controls whether importing files into LectrAI is available inside the app."
          value={settings.permissions.storage}
          onValueChange={(value) => {
            onFileAccessToggle(value);
          }}
        />
        <Divider />
        <ToggleRow
          title="Notification permission"
          description="Allows LectrAI to surface reminders and lecture updates immediately."
          value={settings.permissions.notifications}
          onValueChange={(value) => {
            void onNotificationsToggle(value);
          }}
        />
        <Divider />
        <ToggleRow
          title="Sound effects"
          description="Controls button taps, celebration sounds, and other sound effects across the app."
          value={settings.permissions.soundFx}
          onValueChange={(value) => updatePermissionSetting('soundFx', value)}
        />
      </SectionCard>
    </SettingsScreen>
  );
}

async function loadNotificationsModule() {
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}
