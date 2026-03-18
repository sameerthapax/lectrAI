import { useEffect, useState } from 'react';
import { Alert, Pressable, Text } from 'react-native';
import {
  ORANGE,
  ProfileField,
  SectionCard,
  SettingsLoadingState,
  SettingsScreen,
} from '../../../components/settings/settings-ui';
import { useSettings } from '../../../providers/settings-provider';
import type { ProfileSettings } from '../../../services/settings-storage';

export default function SettingsProfileRoute() {
  const { loading, settings, saveProfile } = useSettings();
  const [draftProfile, setDraftProfile] = useState<ProfileSettings | null>(null);

  useEffect(() => {
    if (!settings) {
      return;
    }

    setDraftProfile(settings.profile);
  }, [settings]);

  if (loading || !settings || !draftProfile) {
    return <SettingsLoadingState />;
  }

  const onDraftChange = (field: keyof ProfileSettings, value: string) => {
    setDraftProfile((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        [field]: value,
      };
    });
  };

  const onSave = () => {
    saveProfile(draftProfile);
    Alert.alert('Profile saved', 'Your profile changes have been saved.');
  };

  return (
    <SettingsScreen
      title="Profile"
      subtitle="Edit the profile details stored locally for your LectrAI experience."
    >
      <SectionCard title="Profile Details">
        <ProfileField
          label="Name"
          value={draftProfile.name}
          placeholder="Your full name"
          onChangeText={(value) => onDraftChange('name', value)}
        />
        <ProfileField
          label="Email"
          value={draftProfile.email}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          onChangeText={(value) => onDraftChange('email', value)}
        />
        <ProfileField
          label="University"
          value={draftProfile.university}
          placeholder="Your university"
          onChangeText={(value) => onDraftChange('university', value)}
        />
        <ProfileField
          label="Age"
          value={draftProfile.age}
          placeholder="Your age"
          keyboardType="number-pad"
          onChangeText={(value) => onDraftChange('age', value)}
        />
        <ProfileField
          label="Gender"
          value={draftProfile.gender}
          placeholder="Your gender"
          onChangeText={(value) => onDraftChange('gender', value)}
        />

        <Pressable
          onPress={onSave}
          style={({ pressed }) => ({
            minHeight: 54,
            borderRadius: 18,
            borderCurve: 'continuous',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: ORANGE,
            opacity: pressed ? 0.92 : 1,
          })}
        >
          <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '900' }}>
            Save Changes
          </Text>
        </Pressable>
      </SectionCard>
    </SettingsScreen>
  );
}
