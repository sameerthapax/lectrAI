import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { LokiConversationPanel } from '../../../components/ai/loki-conversation-panel';
import { useAuth } from '../../../providers/auth-provider';
import { useAppTheme } from '../../../providers/settings-provider';
import {
  getLokiSession,
  type RemoteLokiMessage,
  type RemoteLokiSession,
} from '../../../services/ai-chat-api';

export default function LokiSessionDetailRoute() {
  const theme = useAppTheme();
  const auth = useAuth();
  const params = useLocalSearchParams<{ sessionId?: string | string[] }>();
  const sessionId = Array.isArray(params.sessionId) ? params.sessionId[0] : params.sessionId;
  const [session, setSession] = useState<RemoteLokiSession | null>(null);
  const [messages, setMessages] = useState<RemoteLokiMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      if (!sessionId || auth.status !== 'authenticated') {
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

        const detail = await getLokiSession(accessToken, sessionId);

        if (!cancelled) {
          setSession(detail.session);
          setMessages(detail.messages);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Could not load conversation.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [auth, sessionId]);

  return (
      <View
        style={{
          flex: 1,
          paddingTop: 16,
          backgroundColor: theme.colors.screen,
        }}
      >
        <View
          style={{
            paddingHorizontal: 16,
            paddingBottom: 8,
            gap: 8,
          }}
        >
          <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13, lineHeight: 19 }}>
            Readonly Loki session
            {session ? ` • ${session.sessionType.replace(/_/g, ' ')}` : ''}
          </Text>
        </View>

        <LokiConversationPanel
          theme={theme}
          messages={messages}
          loading={loading}
          errorMessage={errorMessage}
          emptyMessage="This session does not have any messages yet."
          showOuterCard={false}
          fillBody
          bodyStyle={{
            marginHorizontal: 16,
            marginTop: 4,
            marginBottom: 14,
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            borderBottomLeftRadius: 48,
            borderBottomRightRadius: 48,
          }}
        />
      </View>
  );
}
