import { BlurView } from 'expo-blur';
import { setAudioModeAsync } from 'expo-audio';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useAppTheme } from '../../providers/settings-provider';
import { useAuth } from '../../providers/auth-provider';
import {
  getLokiSession,
  listLokiSessions,
  type RemoteLokiMessage,
  type RemoteLokiRetrievedChunk,
  type RemoteLokiSession,
} from '../../services/ai-chat-api';

const LokiNativeVoiceVisualizer = require('../../components/ai/loki-native-voice-visualizer').default;

export default function AiAssistanceRoute() {
  const theme = useAppTheme();
  const auth = useAuth();
  const { width } = useWindowDimensions();
  const isCompact = width < 390;
  const conversationScrollRef = useRef<ScrollView | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [sessions, setSessions] = useState<RemoteLokiSession[]>([]);
  const [messages, setMessages] = useState<RemoteLokiMessage[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrievedChunks, setRetrievedChunks] = useState<RemoteLokiRetrievedChunk[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    void setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const scrollTimer = setTimeout(() => {
        conversationScrollRef.current?.scrollToEnd({ animated: false });
      }, 0);

      const loadBootstrap = async () => {
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

          if (cancelled) {
            return;
          }

          setSessions(nextSessions);
          setActiveSessionId((current) => current ?? nextSessions[0]?.id ?? null);
        } catch (error) {
          if (!cancelled) {
            setErrorMessage(error instanceof Error ? error.message : 'Could not load Loki.');
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      };

      void loadBootstrap();

      return () => {
        cancelled = true;
        clearTimeout(scrollTimer);
      };
    }, [auth])
  );

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      if (!activeSessionId || auth.status !== 'authenticated') {
        setMessages([]);
        setRetrievedChunks([]);
        return;
      }

      try {
        const accessToken = await auth.getValidAccessToken();

        if (!accessToken) {
          return;
        }

        const detail = await getLokiSession(accessToken, activeSessionId);

        if (cancelled) {
          return;
        }

        setMessages(detail.messages);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Could not load conversation.');
        }
      }
    };

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [activeSessionId, auth]);

  const handleSelectSession = (session: RemoteLokiSession) => {
    setActiveSessionId(session.id);
    setRetrievedChunks([]);
    setHistoryVisible(false);
  };

  useEffect(() => {
    const scrollTimer = setTimeout(() => {
      conversationScrollRef.current?.scrollToEnd({ animated: true });
    }, 0);

    return () => {
      clearTimeout(scrollTimer);
    };
  }, [activeSessionId, messages.length]);

  return (
    <>
      <Stack.Screen options={{ title: 'AI Assist' }} />

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: theme.colors.screen }}
        contentContainerStyle={{
          flexGrow: 1,
          padding: 16,
          gap: 12,
          paddingBottom: 18,
          backgroundColor: theme.colors.screen,
        }}
      >
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 24,
            right: -34,
            width: 210,
            height: 210,
            borderRadius: 999,
            backgroundColor: 'rgba(251, 146, 60, 0.10)',
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 144,
            left: -44,
            width: 170,
            height: 170,
            borderRadius: 999,
            backgroundColor: 'rgba(30, 41, 59, 0.06)',
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: 96,
            right: 26,
            width: 160,
            height: 160,
            borderRadius: 999,
            backgroundColor: 'rgba(251, 191, 36, 0.06)',
          }}
        />

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <View style={{ gap: 2 }}>
            <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13, fontWeight: '700' }}>
              AI assistant
            </Text>
            <Text selectable style={{ color: theme.colors.text, fontSize: 30, fontWeight: '800' }}>
              Meet <Text style={{ color: theme.colors.accent }}>Loki</Text>
            </Text>
          </View>

          <Pressable
            onPress={() => setHistoryVisible((current) => !current)}
            style={({ pressed }) => ({
              borderRadius: 999,
              borderCurve: 'continuous',
              paddingHorizontal: 12,
              paddingVertical: 8,
              backgroundColor: pressed ? theme.colors.cardMuted : theme.colors.overlay,
              borderWidth: 1,
              borderColor: theme.colors.border,
              boxShadow: '0 10px 20px rgba(15, 23, 42, 0.06)',
            })}
          >
            <Text selectable style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' }}>
              History
            </Text>
          </Pressable>
        </View>

        <View
          style={{
            minHeight: isCompact ? 232 : 256,
            borderRadius: 34,
            borderCurve: 'continuous',
            overflow: 'hidden',
            backgroundColor: '#110f0f',
            boxShadow: '0 20px 44px rgba(15, 23, 42, 0.14)',
          }}
        >
          <LokiNativeVoiceVisualizer />
        </View>

        {historyVisible ? (
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
              <Text selectable style={{ color: theme.colors.text, fontSize: 17, fontWeight: '700' }}>
                Conversation history
              </Text>

              {sessions.length === 0 ? (
                <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13 }}>
                  No Loki conversations yet.
                </Text>
              ) : (
                sessions.map((session) => {
                  const active = session.id === activeSessionId;
                  return (
                    <Pressable
                      key={session.id}
                      onPress={() => handleSelectSession(session)}
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
                        {session.sessionType.replace('_', ' ')}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </View>
          </BlurView>
        ) : null}

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
            <Text selectable style={{ color: theme.colors.text, fontSize: 17, fontWeight: '700' }}>
              Conversation
            </Text>
            <View
              style={{
                height: isCompact ? 220 : 300,
                borderRadius: 18,
                backgroundColor: theme.colors.neutralSoft,
                borderWidth: 1,
                borderColor: theme.colors.neutralBorder,
              }}
            >
              <ScrollView
                ref={conversationScrollRef}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
                onContentSizeChange={() => {
                  conversationScrollRef.current?.scrollToEnd({ animated: true });
                }}
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
                    Start a conversation and Loki will decide when to search your class material before answering.
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

                        {message.citations.length > 0 ? (
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            {message.citations.map((citation) => (
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

                {retrievedChunks.length > 0 ? (
                  <View style={{ gap: 8 }}>
                    <Text selectable style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' }}>
                      Injected knowledge
                    </Text>
                    {retrievedChunks.slice(0, 3).map((chunk) => (
                      <View
                        key={chunk.chunkId}
                        style={{
                          borderRadius: 16,
                          padding: 10,
                          backgroundColor: theme.colors.overlay,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                        }}
                      >
                        <Text selectable style={{ color: theme.colors.text, fontSize: 12.5, fontWeight: '700' }}>
                          {chunk.lectureTitle}
                        </Text>
                        <Text selectable style={{ color: theme.colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 }}>
                          {chunk.content}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {errorMessage ? (
                  <Text selectable style={{ color: '#dc2626', fontSize: 12.5, lineHeight: 18 }}>
                    {errorMessage}
                  </Text>
                ) : null}
              </ScrollView>
            </View>
          </View>
        </BlurView>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable
            style={({ pressed }) => ({
              flex: 1.2,
              minHeight: 64,
              borderRadius: 22,
              borderCurve: 'continuous',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              backgroundColor: pressed ? theme.colors.accentMuted : theme.colors.accent,
              boxShadow: '0 16px 28px rgba(234, 88, 12, 0.18)',
            })}
          >
            <Text selectable style={{ fontSize: 20 }}>🎙️</Text>
            <Text selectable style={{ color: theme.colors.accentContrast, fontSize: 15, fontWeight: '700' }}>
              Hold To Talk
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 64,
              borderRadius: 22,
              borderCurve: 'continuous',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              backgroundColor: pressed ? theme.colors.neutralBorder : theme.colors.neutralSoft,
              borderWidth: 1,
              borderColor: theme.colors.neutralBorder,
              boxShadow: '0 16px 28px rgba(15, 23, 42, 0.16)',
            })}
          >
            <Text selectable style={{ fontSize: 20 }}>⌨️</Text>
            <Text selectable style={{ color: theme.colors.text, fontSize: 15, fontWeight: '700' }}>
              Type
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </>
  );
}
