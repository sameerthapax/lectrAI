import { BlurView } from 'expo-blur';
import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioSampleListener,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useAppTheme } from '../../providers/settings-provider';
import { useAuth } from '../../providers/auth-provider';
import {
  getLokiSession,
  listLokiSessions,
  sendLokiReply,
  type RemoteLokiMessage,
  type RemoteLokiRetrievedChunk,
  type RemoteLokiSession,
  transcribeLokiAudio,
  writeLokiAudioToFile,
} from '../../services/ai-chat-api';

const LokiNativeVoiceVisualizer = require('../../components/ai/loki-native-voice-visualizer').default;
const HOLD_TO_RECORD_DELAY_MS = 150;
const TALK_EXPAND_DURATION_MS = 1500;
const TALK_RESET_DURATION_MS = 220;
const TALK_BUTTON_FLEX = 1.2;
const TYPE_BUTTON_FLEX = 1;
const TALK_BUTTON_EXPANDED_FLEX = TALK_BUTTON_FLEX + TYPE_BUTTON_FLEX;
const SPEECH_METER_FLOOR_DB = -55;
const SPEECH_METER_CEILING_DB = -35;

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
  const [talkHoldActive, setTalkHoldActive] = useState(false);
  const [voiceRecordingActive, setVoiceRecordingActive] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [assistantWaiting, setAssistantWaiting] = useState(false);
  const [audioResponseUri, setAudioResponseUri] = useState<string | null>(null);
  const [assistantSpeechLevel, setAssistantSpeechLevel] = useState(0);
  const holdToRecordTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const talkExpandProgress = useRef(new Animated.Value(0)).current;
  const talkGlowOpacity = useRef(new Animated.Value(0)).current;
  const visualizerHeightProgress = useRef(new Animated.Value(0)).current;
  const assistantSpeechLevelRef = useRef(0);
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const recorderState = useAudioRecorderState(recorder, 120);
  const player = useAudioPlayer(audioResponseUri, { updateInterval: 100, keepAudioSessionActive: true });
  const playerStatus = useAudioPlayerStatus(player);

  useAudioSampleListener(player, (sample) => {
    const channels = sample.channels ?? [];
    let peak = 0;

    for (const channel of channels) {
      const frames = channel.frames ?? [];

      for (const frame of frames) {
        const amplitude = Math.abs(frame);

        if (amplitude > peak) {
          peak = amplitude;
        }
      }
    }

    const boostedLevel = Math.min(1, Math.pow(peak, 0.42) * 1.9);
    const nextLevel = Math.max(boostedLevel, assistantSpeechLevelRef.current * 0.42);

    assistantSpeechLevelRef.current = nextLevel;
    setAssistantSpeechLevel(nextLevel);
  });

  useEffect(() => {
    void setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    });
  }, []);

  useEffect(() => {
    Animated.timing(talkGlowOpacity, {
      toValue: talkHoldActive ? 0.82 : 0,
      duration: talkHoldActive ? 220 : TALK_RESET_DURATION_MS,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [talkGlowOpacity, talkHoldActive]);

  useEffect(() => {
    Animated.timing(talkExpandProgress, {
      toValue: talkHoldActive ? 1 : 0,
      duration: talkHoldActive ? TALK_EXPAND_DURATION_MS : TALK_RESET_DURATION_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [talkExpandProgress, talkHoldActive]);

  useEffect(() => {
    Animated.timing(visualizerHeightProgress, {
      toValue: assistantWaiting ? 1 : 0,
      duration: assistantWaiting ? 260 : 220,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [assistantWaiting, visualizerHeightProgress]);

  useEffect(() => {
    if (playerStatus.playing) {
      return;
    }

    assistantSpeechLevelRef.current = 0;
    setAssistantSpeechLevel(0);
  }, [playerStatus.playing]);

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

  useEffect(() => {
    return () => {
      if (holdToRecordTimeoutRef.current) {
        clearTimeout(holdToRecordTimeoutRef.current);
      }

      if (recorderState.isRecording) {
        void recorder.stop();
      }
    };
  }, [recorder, recorderState.isRecording]);

  const resetVoiceHoldState = useCallback(async () => {
    let recordingUri: string | null = null;

    if (holdToRecordTimeoutRef.current) {
      clearTimeout(holdToRecordTimeoutRef.current);
      holdToRecordTimeoutRef.current = null;
    }

    if (recorderState.isRecording) {
      try {
        await recorder.stop();
        recordingUri = recorder.uri ?? recorderState.url;
      } catch {
        // Reset the UI even if the recorder has already transitioned.
      }
    }

    setVoiceRecordingActive(false);
    setTalkHoldActive(false);

    void setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    });

    return recordingUri;
  }, [recorder, recorderState.isRecording]);

  const processVoiceInput = useCallback(
    async (recordingUri: string) => {
      if (auth.status !== 'authenticated') {
        throw new Error('Sign in again before talking with Loki.');
      }

      setVoiceBusy(true);
      setAssistantWaiting(true);
      setErrorMessage(null);
      setRetrievedChunks([]);

      try {
        const accessToken = await auth.getValidAccessToken();

        if (!accessToken) {
          throw new Error('Your session expired. Please sign in again.');
        }

        const localFile = new File(recordingUri);
        const transcription = await transcribeLokiAudio(accessToken, {
          audioBase64: await localFile.base64(),
          mimeType: inferAudioMimeType(recordingUri),
          fileName: inferAudioFilename(recordingUri),
        });

        const transcriptText = transcription.text.trim();

        if (!transcriptText) {
          throw new Error('Loki could not hear anything clearly enough to transcribe.');
        }

        const optimisticUserMessage = createPendingMessage('user', transcriptText);

        setMessages((current) => {
          if (activeSessionId) {
            return [...current, optimisticUserMessage];
          }

          return [optimisticUserMessage];
        });

        const reply = await sendLokiReply(accessToken, {
          sessionId: activeSessionId,
          message: transcriptText,
        });

        setActiveSessionId(reply.session.id);
        setSessions((current) => {
          const remaining = current.filter((session) => session.id !== reply.session.id);
          return [reply.session, ...remaining];
        });
        setRetrievedChunks(reply.retrieval.chunks);
        setMessages((current) => {
          const withoutPendingUser = current.filter((message) => message.id !== optimisticUserMessage.id);
          return [...withoutPendingUser, reply.userMessage, reply.assistantMessage];
        });

        if (reply.audio) {
          await setAudioModeAsync({
            allowsRecording: false,
            playsInSilentMode: true,
            interruptionMode: 'doNotMix',
            shouldPlayInBackground: false,
            shouldRouteThroughEarpiece: false,
          });

          const nextAudioUri = await writeLokiAudioToFile(reply.audio, reply.assistantMessage.id);
          setAudioResponseUri(nextAudioUri);
          player.replace(nextAudioUri);
          player.play();
        }
      } finally {
        setAssistantWaiting(false);
        setVoiceBusy(false);
      }
    },
    [activeSessionId, auth, player]
  );

  const startVoiceRecording = useCallback(async () => {
    try {
      setVoiceBusy(true);

      if (playerStatus.playing) {
        player.pause();
      }

      const currentPermission = await getRecordingPermissionsAsync();
      const permission = currentPermission.granted
        ? currentPermission
        : await requestRecordingPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'Microphone access needed',
          permission.canAskAgain
            ? 'Please allow microphone access to talk with Loki.'
            : 'Microphone access is blocked on this device. Enable it in system settings to use hold to talk.'
        );
        await resetVoiceHoldState();
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();
      setVoiceRecordingActive(true);
    } catch (error) {
      Alert.alert(
        'Voice capture failed',
        error instanceof Error ? error.message : 'Unable to start voice capture right now.'
      );
      await resetVoiceHoldState();
    } finally {
      setVoiceBusy(false);
    }
  }, [player, playerStatus.playing, recorder, resetVoiceHoldState]);

  const handleTalkPressIn = useCallback(() => {
    if (voiceBusy || talkHoldActive || assistantWaiting) {
      return;
    }

    setTalkHoldActive(true);
    setVoiceRecordingActive(false);

    if (holdToRecordTimeoutRef.current) {
      clearTimeout(holdToRecordTimeoutRef.current);
    }

    holdToRecordTimeoutRef.current = setTimeout(() => {
      holdToRecordTimeoutRef.current = null;
      void startVoiceRecording();
    }, HOLD_TO_RECORD_DELAY_MS);
  }, [assistantWaiting, startVoiceRecording, talkHoldActive, voiceBusy]);

  const handleTalkPressOut = useCallback(() => {
    void (async () => {
      const recordingUri = await resetVoiceHoldState();

      if (recordingUri) {
        try {
          await processVoiceInput(recordingUri);
        } catch (error) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Unable to process voice input right now.'
          );
        }
      }
    })();
  }, [processVoiceInput, resetVoiceHoldState]);

  const liveMetering = typeof recorderState.metering === 'number' ? recorderState.metering : -60;
  const normalizedMeter = voiceRecordingActive
    ? Math.min(
        1,
        Math.max(
          0,
          (liveMetering - SPEECH_METER_FLOOR_DB) / (SPEECH_METER_CEILING_DB - SPEECH_METER_FLOOR_DB)
        )
      )
    : 0;
  const liveVoiceLevel =
    voiceRecordingActive ? Math.max(0.12, normalizedMeter) : talkHoldActive ? 0.08 : 0;

  const talkButtonFlex = talkExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [TALK_BUTTON_FLEX, TALK_BUTTON_EXPANDED_FLEX],
  });
  const typeButtonFlex = talkExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [TYPE_BUTTON_FLEX, 0.0001],
  });
  const typeButtonOpacity = talkExpandProgress.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [1, 0.12, 0],
  });
  const talkGlowStrength = Animated.multiply(
    talkGlowOpacity,
    0.18 + liveVoiceLevel * 0.54
  );
  const talkGlowScale = 1.02 + liveVoiceLevel * 0.22;
  const visualizerBarHeights = [
    8 + liveVoiceLevel * 10,
    12 + liveVoiceLevel * 14,
    9 + liveVoiceLevel * 23,
    11 + liveVoiceLevel * 11,
  ];
  const visualizerBarOpacity = 0.48 + liveVoiceLevel * 0.52;
  const talkButtonLabel = voiceRecordingActive
    ? 'Listening'
    : assistantWaiting
      ? 'Thinking...'
    : talkHoldActive
      ? 'Keep Holding'
      : 'Hold To Talk';
  const visualizerMode = assistantWaiting
    ? 'waiting'
    : playerStatus.playing
      ? 'speaking'
      : 'idle';
  const visualizerPlaybackTimeSeconds = playerStatus.currentTime;
  const visualizerMinHeight = visualizerHeightProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [isCompact ? 232 : 256, isCompact ? 288 : 332],
  });

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

        <Animated.View
          style={{
            minHeight: visualizerMinHeight,
            borderRadius: 34,
            borderCurve: 'continuous',
            overflow: 'hidden',
            backgroundColor: '#110f0f',
            boxShadow: '0 20px 44px rgba(15, 23, 42, 0.14)',
          }}
        >
          <LokiNativeVoiceVisualizer
            mode={visualizerMode}
            speechLevel={assistantSpeechLevel}
            playbackTimeSeconds={visualizerPlaybackTimeSeconds}
          />
        </Animated.View>

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

                        {message.modelName === 'transcribing' ? (
                          <Text selectable style={{ color: theme.colors.textMuted, fontSize: 11.5, fontWeight: '700' }}>
                            Voice transcript
                          </Text>
                        ) : null}

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
          <Animated.View style={{ flex: talkButtonFlex, minHeight: 64 }}>
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 22,
                borderCurve: 'continuous',
                backgroundColor: '#ef4444',
                boxShadow: '0 0 42px rgba(239, 68, 68, 0.55)',
                opacity: talkGlowStrength,
                transform: [{ scale: talkGlowScale }],
              }}
            />
            <Pressable
            onPressIn={handleTalkPressIn}
            onPressOut={handleTalkPressOut}
            disabled={voiceBusy || assistantWaiting}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 64,
              borderRadius: 22,
              borderCurve: 'continuous',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              backgroundColor:
                  talkHoldActive || voiceRecordingActive || assistantWaiting
                    ? '#b91c1c'
                    : pressed
                      ? theme.colors.accentMuted
                      : theme.colors.accent,
                boxShadow:
                  talkHoldActive || voiceRecordingActive || assistantWaiting
                    ? '0 18px 34px rgba(220, 38, 38, 0.26)'
                    : '0 16px 28px rgba(234, 88, 12, 0.18)',
                opacity: assistantWaiting ? 0.88 : 1,
              })}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  gap: 4,
                  minHeight: 32,
                }}
              >
                {visualizerBarHeights.map((height, index) => (
                  <Animated.View
                    key={`talk-bar-${index}`}
                    style={{
                      width: 6,
                      height,
                      borderRadius: 999,
                      backgroundColor: 'rgba(255,255,255,0.92)',
                      opacity: visualizerBarOpacity,
                    }}
                  />
                ))}
              </View>
              <Text style={{ color: theme.colors.accentContrast, fontSize: 15, fontWeight: '700' }}>
                {talkButtonLabel}
              </Text>
            </Pressable>
          </Animated.View>

          <Animated.View
            pointerEvents={talkHoldActive || assistantWaiting ? 'none' : 'auto'}
            style={{ flex: typeButtonFlex, minHeight: 64, opacity: typeButtonOpacity }}
          >
            {talkHoldActive || assistantWaiting ? (
              <View style={{ flex: 1 }} />
            ) : (
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
                <Text style={{ fontSize: 20 }}>⌨️</Text>
                <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '700' }}>
                  Type
                </Text>
              </Pressable>
            )}
          </Animated.View>
        </View>
      </ScrollView>
    </>
  );
}

function createPendingMessage(role: RemoteLokiMessage['role'], messageText: string): RemoteLokiMessage {
  return {
    id: `pending-${role}-${Date.now()}`,
    role,
    messageText,
    modelName: role === 'user' ? 'transcribing' : null,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    retrievalMetadata: null,
    createdAt: new Date().toISOString(),
    citations: [],
  };
}

function inferAudioFilename(recordingUri: string) {
  const trimmedUri = recordingUri.split('?')[0] ?? recordingUri;
  const lastSegment = trimmedUri.split('/').pop()?.trim();
  return lastSegment && lastSegment.length > 0 ? lastSegment : 'loki-input.m4a';
}

function inferAudioMimeType(recordingUri: string) {
  const normalized = recordingUri.toLowerCase();

  if (normalized.endsWith('.wav')) {
    return 'audio/wav';
  }

  if (normalized.endsWith('.mp3')) {
    return 'audio/mpeg';
  }

  if (normalized.endsWith('.aac')) {
    return 'audio/aac';
  }

  if (normalized.endsWith('.webm')) {
    return 'audio/webm';
  }

  return 'audio/mp4';
}
