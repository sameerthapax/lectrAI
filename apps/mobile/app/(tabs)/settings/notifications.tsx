import {
  Divider,
  SectionCard,
  SettingsLoadingState,
  SettingsScreen,
  ToggleRow,
} from '../../../components/settings/settings-ui';
import { useSettings } from '../../../providers/settings-provider';

export default function SettingsNotificationsRoute() {
  const { loading, settings, updateNotificationSetting } = useSettings();

  if (loading || !settings) {
    return <SettingsLoadingState />;
  }

  return (
    <SettingsScreen
      title="Notifications"
      subtitle="Choose which updates LectrAI should surface while you study."
    >
      <SectionCard
        title="Notification Preferences"
      >
        <ToggleRow
          title="Lecture processing notifications"
          description="Know when transcripts, summaries, and lecture processing are ready."
          value={settings.notifications.lectureProcessing}
          onValueChange={(value) =>
            updateNotificationSetting('lectureProcessing', value)
          }
        />
        <Divider />
        <ToggleRow
          title="Quiz reminders"
          description="Get nudges to revisit lectures and practice before exams."
          value={settings.notifications.quizReminders}
          onValueChange={(value) => updateNotificationSetting('quizReminders', value)}
        />
      </SectionCard>
    </SettingsScreen>
  );
}
