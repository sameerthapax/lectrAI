import { BlurView } from 'expo-blur';
import { Animated, ScrollView, Text, View } from 'react-native';
import type { MutableRefObject, ReactNode } from 'react';
import type { AppTheme } from '../../services/app-theme';
import type { RemoteLokiMessage } from '../../services/ai-chat-api';

type LokiConversationPanelProps = {
  theme: AppTheme;
  isCompact?: boolean;
  title?: string;
  messages: RemoteLokiMessage[];
  loading?: boolean;
  errorMessage?: string | null;
  emptyMessage: string;
  action?: ReactNode;
  scrollRef?: MutableRefObject<ScrollView | null>;
  onContentSizeChange?: () => void;
  bodyHeight?: number | Animated.Value | Animated.AnimatedInterpolation<number>;
};

export function LokiConversationPanel({
  theme,
  isCompact = false,
  title = 'Conversation',
  messages,
  loading = false,
  errorMessage = null,
  emptyMessage,
  action,
  scrollRef,
  onContentSizeChange,
  bodyHeight,
}: LokiConversationPanelProps) {
  return (
    <BlurView
      intensity={24}
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
      <View style={{ padding: 14, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Text selectable style={{ color: theme.colors.text, fontSize: 17, fontWeight: '700' }}>
            {title}
          </Text>
          {action}
        </View>

        <Animated.View
          style={{
            height: bodyHeight ?? (isCompact ? 220 : 300),
            borderRadius: 18,
            backgroundColor: theme.colors.neutralSoft,
            borderWidth: 1,
            borderColor: theme.colors.neutralBorder,
          }}
        >
          <ScrollView
            ref={scrollRef}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            onContentSizeChange={onContentSizeChange}
            contentContainerStyle={{
              padding: 12,
              gap: 12,
              minHeight: '100%',
            }}
          >
            {loading ? (
              <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13 }}>
                Loading Loki…
              </Text>
            ) : messages.length === 0 ? (
              <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13, lineHeight: 19 }}>
                {emptyMessage}
              </Text>
            ) : (
              messages.map((message) => {
                const isAssistant = message.role === 'assistant';
                return (
                  <View
                    key={message.id}
                    style={{
                      alignSelf: isAssistant ? 'stretch' : 'flex-end',
                      borderRadius: 18,
                      padding: 12,
                      gap: 8,
                      backgroundColor: isAssistant ? theme.colors.overlay : theme.colors.accentSoft,
                      borderWidth: 1,
                      borderColor: isAssistant ? theme.colors.border : theme.colors.accentBorder,
                    }}
                  >
                    <Text
                      selectable
                      style={{
                        color: theme.colors.text,
                        fontSize: 14,
                        lineHeight: 20,
                        fontWeight: isAssistant ? '500' : '600',
                      }}
                    >
                      {message.messageText}
                    </Text>

                    {message.modelName === 'transcribing' ? (
                      <Text selectable style={{ color: theme.colors.textMuted, fontSize: 11.5, fontWeight: '700' }}>
                        Voice transcript
                      </Text>
                    ) : null}

                    {getUniqueLectureCitations(message.citations).length > 0 ? (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {getUniqueLectureCitations(message.citations).map((citation) => (
                          <View
                            key={citation.id}
                            style={{
                              borderRadius: 999,
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              backgroundColor: theme.colors.neutralSoft,
                              borderWidth: 1,
                              borderColor: theme.colors.border,
                            }}
                          >
                            <Text selectable style={{ color: theme.colors.textMuted, fontSize: 11.5, fontWeight: '700' }}>
                              {citation.lectureTitle}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}

            {errorMessage ? (
              <Text selectable style={{ color: '#dc2626', fontSize: 12.5, lineHeight: 18 }}>
                {errorMessage}
              </Text>
            ) : null}
          </ScrollView>
        </Animated.View>
      </View>
    </BlurView>
  );
}

function getUniqueLectureCitations(citations: RemoteLokiMessage['citations']) {
  const seenLectureIds = new Set<string>();

  return citations.filter((citation) => {
    if (seenLectureIds.has(citation.lectureId)) {
      return false;
    }

    seenLectureIds.add(citation.lectureId);
    return true;
  });
}
