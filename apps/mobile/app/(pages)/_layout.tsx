import { Stack, useRouter } from 'expo-router';
import { NativeBackButton } from '../../components/ui/native-back-button';
import { useAppTheme } from '../../providers/settings-provider';

export default function PagesLayout() {
  const theme = useAppTheme();
  const router = useRouter();

  return (
    <Stack
      initialRouteName="welcome"
      screenOptions={{
        headerShown: true,
        headerBackButtonDisplayMode: 'minimal',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: theme.colors.screen },
        headerTintColor: theme.colors.text,
        headerTitleStyle: {
          color: theme.colors.text,
          fontSize: 20,
          fontWeight: '800',
        },
        contentStyle: { backgroundColor: theme.colors.screen },
      }}
    >
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen
        name="course/[courseId]"
        options={{
          title: 'Course',
          headerLeft: () => <NativeBackButton theme={theme} onPress={() => router.back()} />,
        }}
      />
      <Stack.Screen name="course-file/[courseFileId]" options={{ title: 'File Review' }} />
      <Stack.Screen
        name="loki-history"
        options={{
          title: 'Conversation History',
          headerLeft: () => <NativeBackButton theme={theme} onPress={() => router.back()} />,
        }}
      />
      <Stack.Screen
        name="loki-session/[sessionId]"
        options={{
          title: 'Chat Session',
          headerLeft: () => <NativeBackButton theme={theme} onPress={() => router.back()} />,
        }}
      />
      <Stack.Screen name="flashcards/[flashcardSetId]" options={{ title: 'Flashcards' }} />
      <Stack.Screen name="quiz/[quizId]" options={{ title: 'Quiz' }} />
      <Stack.Screen name="recording-results-page" options={{ title: 'Lecture Review' }} />
    </Stack>
  );
}
