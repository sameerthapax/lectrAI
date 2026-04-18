import { BlurView } from 'expo-blur';
import { Pressable, Text, View } from 'react-native';
import type { AppTheme } from '../../services/app-theme';
import type { RemoteLokiSession } from '../../services/ai-chat-api';

type LokiSessionListProps = {
  theme: AppTheme;
  sessions: RemoteLokiSession[];
  emptyMessage?: string;
  activeSessionId?: string | null;
  onSelectSession: (session: RemoteLokiSession) => void;
};

export function LokiSessionList({
  theme,
  sessions,
  emptyMessage = 'No Loki conversations yet.',
  activeSessionId = null,
  onSelectSession,
}: LokiSessionListProps) {
  return (
    <BlurView
      intensity={18}
      tint={theme.resolvedMode === 'dark' ? 'dark' : 'light'}
      style={{
        borderRadius: 24,
        overflow: 'hidden',
        borderCurve: 'continuous',
        backgroundColor: theme.colors.overlay,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <View style={{ padding: 14, gap: 8 }}>
        {sessions.length === 0 ? (
          <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13 }}>
            {emptyMessage}
          </Text>
        ) : (
          sessions.map((session) => {
            const active = session.id === activeSessionId;

            return (
              <Pressable
                key={session.id}
                onPress={() => onSelectSession(session)}
                style={({ pressed }) => ({
                  borderRadius: 16,
                  padding: 12,
                  backgroundColor: active ? theme.colors.accentSoft : theme.colors.neutralSoft,
                  borderWidth: 1,
                  borderColor: active ? theme.colors.accentBorder : theme.colors.neutralBorder,
                  opacity: pressed ? 0.88 : 1,
                })}
              >
                <Text selectable style={{ color: theme.colors.text, fontSize: 13.5, fontWeight: '700' }}>
                  {session.title ?? 'Untitled conversation'}
                </Text>
                <Text selectable style={{ color: theme.colors.textMuted, fontSize: 12, marginTop: 4 }}>
                  {formatSessionLabel(session)}
                </Text>
              </Pressable>
            );
          })
        )}
      </View>
    </BlurView>
  );
}

function formatSessionLabel(session: RemoteLokiSession) {
  const label = session.sessionType.replace(/_/g, ' ');
  return `${label} • ${formatSessionDate(session.updatedAt)}`;
}

function formatSessionDate(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown date';
  }

  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
