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

  if (loading || !settings) {
    return <SettingsLoadingState />;
  }

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
          onValueChange={(value) => updatePermissionSetting('microphone', value)}
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
