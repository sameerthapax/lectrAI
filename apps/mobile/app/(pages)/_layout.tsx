import { Stack } from 'expo-router';

export default function PagesLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }} initialRouteName="welcome">
      <Stack.Screen name="welcome" />
      <Stack.Screen name="course/[courseId]" />
      <Stack.Screen name="course-file/[courseFileId]" />
      <Stack.Screen name="recording-results-page" />
    </Stack>
  );
}
