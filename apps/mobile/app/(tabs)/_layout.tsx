import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useAppTheme } from '../../providers/settings-provider';
import { triggerSoftNavigationHaptic } from '../../services/haptics';

export default function TabsLayout() {
  const theme = useAppTheme();

  return (
    <NativeTabs
      minimizeBehavior="onScrollDown"
      backgroundColor={theme.colors.card}
      iconColor={{ default: theme.colors.textMuted, selected: theme.colors.accent }}
      labelStyle={{ default: { color: theme.colors.textMuted }, selected: { color: theme.colors.accent } }}
      tintColor={theme.colors.accent}
    >
      <NativeTabs.Trigger
        name="home"
        listeners={{
          tabPress: () => {
            triggerSoftNavigationHaptic();
          },
        }}
      >
        <NativeTabs.Trigger.Icon
          sf={{ default: 'house', selected: 'house.fill' }}
          md="home"
        />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger
        name="courses"
        listeners={{
          tabPress: () => {
            triggerSoftNavigationHaptic();
          },
        }}
      >
        <NativeTabs.Trigger.Icon
          sf={{ default: 'books.vertical', selected: 'books.vertical.fill' }}
          md="school"
        />
        <NativeTabs.Trigger.Label>Courses</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger
        name="ai-assistance"
        listeners={{
          tabPress: () => {
            triggerSoftNavigationHaptic();
          },
        }}
      >
        <NativeTabs.Trigger.Icon
          sf={{ default: 'sparkles.rectangle.stack', selected: 'sparkles.rectangle.stack.fill' }}
          md="auto_awesome"
        />
        <NativeTabs.Trigger.Label>AI Assist</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger
        name="settings"
        listeners={{
          tabPress: () => {
            triggerSoftNavigationHaptic();
          },
        }}
      >
        <NativeTabs.Trigger.Icon
          sf={{ default: 'gearshape', selected: 'gearshape.fill' }}
          md="settings"
        />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
