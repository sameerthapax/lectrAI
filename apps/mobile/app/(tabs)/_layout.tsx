import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { SettingsProvider } from '../../providers/settings-provider';

export default function TabsLayout() {
  return (
    <SettingsProvider>
      <NativeTabs minimizeBehavior="onScrollDown">
        <NativeTabs.Trigger name="home">
          <NativeTabs.Trigger.Icon
            sf={{ default: 'house', selected: 'house.fill' }}
            md="home"
          />
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="courses">
          <NativeTabs.Trigger.Icon
            sf={{ default: 'books.vertical', selected: 'books.vertical.fill' }}
            md="school"
          />
          <NativeTabs.Trigger.Label>Courses</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="ai-assistance">
          <NativeTabs.Trigger.Icon
            sf={{ default: 'sparkles.rectangle.stack', selected: 'sparkles.rectangle.stack.fill' }}
            md="auto_awesome"
          />
          <NativeTabs.Trigger.Label>AI Assist</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="settings">
          <NativeTabs.Trigger.Icon
            sf={{ default: 'gearshape', selected: 'gearshape.fill' }}
            md="settings"
          />
          <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </SettingsProvider>
  );
}
