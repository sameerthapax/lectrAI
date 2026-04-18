import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { LokiSessionList } from '../../components/ai/loki-session-list';
import { useAuth } from '../../providers/auth-provider';
import { useAppTheme } from '../../providers/settings-provider';
import { listLokiSessions, type RemoteLokiSession } from '../../services/ai-chat-api';

export default function LokiHistoryRoute() {
  const theme = useAppTheme();
  const auth = useAuth();
  const router = useRouter();
  const [sessions, setSessions] = useState<RemoteLokiSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const loadSessions = async () => {
        if (auth.status !== 'authenticated') {
          if (!cancelled) {
            setLoading(false);
          }
          return;
        }

        try {
          setLoading(true);
          setErrorMessage(null);
          const accessToken = await auth.getValidAccessToken();

          if (!accessToken) {
            throw new Error('Your session expired. Please sign in again.');
          }

          const nextSessions = await listLokiSessions(accessToken);

          if (!cancelled) {
            setSessions(nextSessions);
          }
        } catch (error) {
          if (!cancelled) {
            setErrorMessage(error instanceof Error ? error.message : 'Could not load conversation history.');
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      };

      void loadSessions();

      return () => {
        cancelled = true;
      };
    }, [auth])
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Conversation history',
          headerLeft: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => router.back()}
              style={{ paddingVertical: 6, paddingRight: 10 }}
            >
              <Text style={{ color: theme.colors.accent, fontSize: 22, fontWeight: '700' }}>{'<'}</Text>
            </Pressable>
          ),
        }}
      />

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1, backgroundColor: theme.colors.screen }}
        contentContainerStyle={{ padding: 16, gap: 12, backgroundColor: theme.colors.screen }}
      >
        <View style={{ gap: 4 }}>
          <Text selectable style={{ color: theme.colors.text, fontSize: 28, fontWeight: '800' }}>
            Loki history
          </Text>
          <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13, lineHeight: 19 }}>
            Open any previous session to review the chat in readonly mode.
          </Text>
        </View>

        {loading ? (
          <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13 }}>
            Loading Loki history…
          </Text>
        ) : null}

        {errorMessage ? (
          <Text selectable style={{ color: theme.colors.danger, fontSize: 12.5, lineHeight: 18 }}>
            {errorMessage}
          </Text>
        ) : null}

        {!loading ? (
          <LokiSessionList
            theme={theme}
            sessions={sessions}
            onSelectSession={(session) => {
              router.push({
                pathname: '/(pages)/loki-session/[sessionId]',
                params: { sessionId: session.id },
              });
            }}
          />
        ) : null}
      </ScrollView>
    </>
  );
}
