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
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { LokiConversationPanel } from '../../components/ai/loki-conversation-panel';
import { useAppTheme } from '../../providers/settings-provider';
import { useAuth } from '../../providers/auth-provider';
import {
  getLokiSession,
  listLokiSessions,
  sendLokiReply,
  type RemoteLokiMessage,
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
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isCompact = width < 390;
  const conversationScrollRef = useRef<ScrollView | null>(null);
  const [messages, setMessages] = useState<RemoteLokiMessage[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [talkHoldActive, setTalkHoldActive] = useState(false);
  const [voiceRecordingActive, setVoiceRecordingActive] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [assistantWaiting, setAssistantWaiting] = useState(false);
  const [assistantSpeechLevel, setAssistantSpeechLevel] = useState(0);
  const [audioMuted, setAudioMuted] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [composerBusy, setComposerBusy] = useState(false);
  const [visualizerCollapsed, setVisualizerCollapsed] = useState(false);
  const [typingMode, setTypingMode] = useState(false);
  const holdToRecordTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const talkExpandProgress = useRef(new Animated.Value(0)).current;
  const talkGlowOpacity = useRef(new Animated.Value(0)).current;
  const visualizerCardHeight = useRef(new Animated.Value(isCompact ? 232 : 256)).current;
  const conversationBodyHeight = useRef(new Animated.Value(isCompact ? 300 : 360)).current;
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const composerOpacity = useRef(new Animated.Value(0)).current;
  const assistantSpeechLevelRef = useRef(0);
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const recorderState = useAudioRecorderState(recorder, 120);
  const player = useAudioPlayer(null, { updateInterval: 100, keepAudioSessionActive: true });
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

  const shouldExpandTalkButton = talkHoldActive || assistantWaiting;

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
      toValue: shouldExpandTalkButton ? 1 : 0,
      duration: shouldExpandTalkButton ? TALK_EXPAND_DURATION_MS : TALK_RESET_DURATION_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [shouldExpandTalkButton, talkExpandProgress]);

  useEffect(() => {
    if (playerStatus.playing) {
      return;
    }

    assistantSpeechLevelRef.current = 0;
    setAssistantSpeechLevel(0);
  }, [playerStatus.playing]);

  useEffect(() => {
    const nextVisualizerHeight = typingMode
      ? 0
      : visualizerCollapsed
        ? 88
        : isCompact
          ? assistantWaiting
            ? 288
            : 232
          : assistantWaiting
            ? 332
            : 256;
    const nextConversationHeight = visualizerCollapsed
      || typingMode
        ? isCompact
          ? 470
          : 560
        : isCompact
          ? 300
          : 360;

    Animated.parallel([
      Animated.timing(visualizerCardHeight, {
        toValue: nextVisualizerHeight,
        duration: visualizerCollapsed ? 320 : 360,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(conversationBodyHeight, {
        toValue: nextConversationHeight,
        duration: visualizerCollapsed ? 320 : 360,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(controlsOpacity, {
        toValue: visualizerCollapsed || typingMode ? 0 : 1,
        duration: visualizerCollapsed || typingMode ? 180 : 240,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false,
      }),
      Animated.timing(composerOpacity, {
        toValue: visualizerCollapsed || typingMode ? 1 : 0,
        duration: visualizerCollapsed || typingMode ? 260 : 180,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false,
      }),
    ]).start();
  }, [
    assistantWaiting,
    composerOpacity,
    controlsOpacity,
    conversationBodyHeight,
    isCompact,
    typingMode,
    visualizerCardHeight,
    visualizerCollapsed,
  ]);

  useEffect(() => {
    player.muted = visualizerCollapsed || typingMode || audioMuted;
  }, [audioMuted, player, typingMode, visualizerCollapsed]);

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

        const optimisticUserMessage = createPendingMessage('user', transcriptText, {
          source: 'voice',
        });

        setMessages((current) => {
          if (activeSessionId) {
            return [...current, optimisticUserMessage];
          }

          return [optimisticUserMessage];
        });

      const reply = await sendLokiReply(accessToken, {
        sessionId: activeSessionId,
        message: transcriptText,
        muteAudioResponse: visualizerCollapsed || typingMode || audioMuted,
      });
      const assistantMessage = withReplyQuizMetadata(reply);

      setActiveSessionId(reply.session.id);
      setMessages((current) => {
        const withoutPendingUser = current.filter((message) => message.id !== optimisticUserMessage.id);
          return [...withoutPendingUser, reply.userMessage, assistantMessage];
      });

      if (reply.audio) {
          await setAudioModeAsync({
            allowsRecording: false,
            playsInSilentMode: true,
            interruptionMode: 'doNotMix',
            shouldPlayInBackground: false,
            shouldRouteThroughEarpiece: false,
          });

          const nextAudioUri = await writeLokiAudioToFile(reply.audio, assistantMessage.id);
          player.replace(nextAudioUri);
          player.play();
        }
      } finally {
        setAssistantWaiting(false);
        setVoiceBusy(false);
      }
    },
    [activeSessionId, audioMuted, auth, player, typingMode, visualizerCollapsed]
  );

  const handleSendText = useCallback(async () => {
    const messageText = composerText.trim();

    if (!messageText || composerBusy || auth.status !== 'authenticated') {
      return;
    }

    setComposerBusy(true);
    setAssistantWaiting(true);
    setErrorMessage(null);

    try {
      if (playerStatus.playing) {
        player.pause();
      }

      const accessToken = await auth.getValidAccessToken();

      if (!accessToken) {
        throw new Error('Your session expired. Please sign in again.');
      }

      const optimisticUserMessage = createPendingMessage('user', messageText, {
        source: 'typed',
      });
      setComposerText('');
      setMessages((current) => (activeSessionId ? [...current, optimisticUserMessage] : [optimisticUserMessage]));

      const reply = await sendLokiReply(accessToken, {
        sessionId: activeSessionId,
        message: messageText,
        muteAudioResponse: visualizerCollapsed || typingMode || audioMuted,
      });
      const assistantMessage = withReplyQuizMetadata(reply);

      setActiveSessionId(reply.session.id);
      setMessages((current) => {
        const withoutPendingUser = current.filter((message) => message.id !== optimisticUserMessage.id);
        return [...withoutPendingUser, reply.userMessage, assistantMessage];
      });

      if (reply.audio) {
        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
          interruptionMode: 'doNotMix',
          shouldPlayInBackground: false,
          shouldRouteThroughEarpiece: false,
        });

        const nextAudioUri = await writeLokiAudioToFile(reply.audio, assistantMessage.id);
        player.replace(nextAudioUri);
        player.play();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to send your message right now.');
    } finally {
      setAssistantWaiting(false);
      setComposerBusy(false);
    }
  }, [
    activeSessionId,
    audioMuted,
    auth,
    composerBusy,
    composerText,
    player,
    playerStatus.playing,
    typingMode,
    visualizerCollapsed,
  ]);

  const handleStartNewSession = useCallback(() => {
    if (playerStatus.playing) {
      player.pause();
    }

    setAssistantSpeechLevel(0);
    assistantSpeechLevelRef.current = 0;
    setActiveSessionId(null);
    setMessages([]);
    setErrorMessage(null);
    setComposerText('');
    setTypingMode(false);
    setVisualizerCollapsed(false);
  }, [player, playerStatus.playing]);

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
            onPress={() => router.push('/(pages)/loki-history')}
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
            height: visualizerCardHeight,
            marginBottom: typingMode ? 0 : undefined,
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
            collapsed={visualizerCollapsed}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visualizerCollapsed ? 'Expand Loki visualizer' : 'Minimize Loki visualizer'}
            onPress={() => {
              setTypingMode(false);
              setVisualizerCollapsed((current) => !current);
            }}
            style={({ pressed }) => ({
              position: 'absolute',
              top: 14,
              left: 14,
              minHeight: 34,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: visualizerCollapsed ? 10 : 12,
              paddingVertical: visualizerCollapsed ? 7 : 8,
              backgroundColor: pressed ? 'rgba(17, 12, 8, 0.92)' : 'rgba(17, 12, 8, 0.78)',
              borderWidth: 1,
              borderColor: 'rgba(255, 237, 213, 0.10)',
            })}
          >
            <VisualizerToggleBadge collapsed={visualizerCollapsed} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visualizerCollapsed || audioMuted ? 'Unmute Loki audio' : 'Mute Loki audio'}
            onPress={() => setAudioMuted((current) => !current)}
            style={({ pressed }) => ({
              position: 'absolute',
              top: 14,
              right: 14,
              width: 42,
              height: 42,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? 'rgba(17, 12, 8, 0.92)' : 'rgba(17, 12, 8, 0.78)',
              borderWidth: 1,
              borderColor:
                visualizerCollapsed || audioMuted
                  ? 'rgba(248, 113, 113, 0.55)'
                  : 'rgba(255, 237, 213, 0.10)',
            })}
          >
            <SpeakerToggleIcon muted={visualizerCollapsed || audioMuted} />
          </Pressable>
        </Animated.View>

        <LokiConversationPanel
          theme={theme}
          isCompact={isCompact}
          messages={messages}
          loading={loading}
          errorMessage={errorMessage}
          emptyMessage="Start a conversation and Loki will decide when to search your class material before answering."
          bodyHeight={conversationBodyHeight}
          scrollRef={conversationScrollRef}
          onContentSizeChange={() => {
            conversationScrollRef.current?.scrollToEnd({ animated: true });
          }}
          action={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Start a new Loki session"
              onPress={handleStartNewSession}
              style={({ pressed }) => ({
                width: 38,
                height: 38,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? theme.colors.cardMuted : theme.colors.neutralSoft,
                borderWidth: 1,
                borderColor: theme.colors.neutralBorder,
              })}
            >
              <BoxPlusIcon color={theme.colors.text} />
            </Pressable>
          }
        />

        <Animated.View
          pointerEvents={visualizerCollapsed || typingMode ? 'none' : 'auto'}
          style={{
            flexDirection: 'row',
            gap: 12,
            opacity: controlsOpacity,
            height: visualizerCollapsed || typingMode ? 0 : undefined,
          }}
        >
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
                onPress={() => {
                  setVisualizerCollapsed(false);
                  setTypingMode(true);
                }}
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
        </Animated.View>

        <Animated.View
          pointerEvents={visualizerCollapsed || typingMode ? 'auto' : 'none'}
          style={{
            opacity: composerOpacity,
            height: visualizerCollapsed || typingMode ? undefined : 0,
            transform: [
              {
                translateY: composerOpacity.interpolate({
                  inputRange: [0, 1],
                  outputRange: [12, 0],
                }),
              },
            ],
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: 10,
              borderRadius: 24,
              borderCurve: 'continuous',
              padding: 10,
              backgroundColor: theme.colors.overlay,
              borderWidth: 1,
              borderColor: theme.colors.border,
              boxShadow: '0 16px 28px rgba(15, 23, 42, 0.12)',
            }}
          >
            <TextInput
              value={composerText}
              onChangeText={setComposerText}
              placeholder="Type to Loki..."
              placeholderTextColor={theme.colors.inputPlaceholder}
              editable={!composerBusy && !assistantWaiting}
              multiline
              style={{
                flex: 1,
                minHeight: 46,
                maxHeight: 120,
                borderRadius: 18,
                paddingHorizontal: 14,
                paddingVertical: 12,
                backgroundColor: theme.colors.inputBackground,
                borderWidth: 1,
                borderColor: theme.colors.inputBorder,
                color: theme.colors.text,
                fontSize: 15,
                textAlignVertical: 'top',
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={typingMode ? 'Close typing mode' : 'Restore full Loki view'}
              onPress={() => {
                setTypingMode(false);
                setVisualizerCollapsed(false);
              }}
              style={({ pressed }) => ({
                width: 46,
                height: 46,
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? theme.colors.cardMuted : theme.colors.neutralSoft,
                borderWidth: 1,
                borderColor: theme.colors.neutralBorder,
              })}
            >
              <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '700' }}>×</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send message to Loki"
              disabled={composerBusy || assistantWaiting || composerText.trim().length === 0}
              onPress={() => {
                void handleSendText();
              }}
              style={({ pressed }) => ({
                minWidth: 72,
                minHeight: 46,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 16,
                backgroundColor:
                  composerBusy || assistantWaiting || composerText.trim().length === 0
                    ? theme.colors.neutralBorder
                    : pressed
                      ? theme.colors.accentMuted
                      : theme.colors.accent,
              })}
            >
              <Text
                style={{
                  color:
                    composerBusy || assistantWaiting || composerText.trim().length === 0
                      ? theme.colors.textMuted
                      : theme.colors.accentContrast,
                  fontSize: 15,
                  fontWeight: '700',
                }}
              >
                Send
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </ScrollView>
    </>
  );
}

function createPendingMessage(
  role: RemoteLokiMessage['role'],
  messageText: string,
  options: { source?: 'typed' | 'voice' } = {}
): RemoteLokiMessage {
  return {
    id: `pending-${role}-${Date.now()}`,
    role,
    messageText,
    modelName: role === 'user' && options.source === 'voice' ? 'transcribing' : null,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    retrievalMetadata: null,
    hasQuiz: false,
    quizId: null,
    quizTitle: null,
    createdAt: new Date().toISOString(),
    citations: [],
  };
}

function withReplyQuizMetadata(reply: Awaited<ReturnType<typeof sendLokiReply>>) {
  return {
    ...reply.assistantMessage,
    hasQuiz: reply.assistantMessage.hasQuiz || reply.hasQuiz,
    quizId: reply.assistantMessage.quizId ?? reply.quizId ?? null,
    quizTitle: reply.assistantMessage.quizTitle ?? reply.quizTitle ?? null,
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

function BoxPlusIcon({ color }: { color: string }) {
  return (
    <View
      style={{
        width: 18,
        height: 18,
        borderRadius: 4,
        borderWidth: 1.7,
        borderColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          position: 'absolute',
          width: 8,
          height: 1.7,
          borderRadius: 999,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: 1.7,
          height: 8,
          borderRadius: 999,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

function VisualizerToggleBadge({ collapsed }: { collapsed: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          backgroundColor: '#fb923c',
        }}
      />
      <View>
        <View
          style={{
            width: 40,
            height: 6,
            borderRadius: 999,
            backgroundColor: 'rgba(255, 237, 213, 0.74)',
          }}
        />
        <View
          style={{
            width: 24,
            height: 4,
            borderRadius: 999,
            marginTop: 4,
            backgroundColor: 'rgba(255, 237, 213, 0.24)',
          }}
        />
      </View>
      <ExpandCollapseIcon collapsed={collapsed} />
    </View>
  );
}

function ExpandCollapseIcon({ collapsed }: { collapsed: boolean }) {
  const color = '#fdba74';

  if (collapsed) {
    return (
      <View style={{ width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            position: 'absolute',
            top: 2,
            left: 2,
            width: 4,
            height: 4,
            borderTopWidth: 1.6,
            borderLeftWidth: 1.6,
            borderColor: color,
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            width: 4,
            height: 4,
            borderTopWidth: 1.6,
            borderRightWidth: 1.6,
            borderColor: color,
          }}
        />
        <View
          style={{
            position: 'absolute',
            bottom: 2,
            left: 2,
            width: 4,
            height: 4,
            borderBottomWidth: 1.6,
            borderLeftWidth: 1.6,
            borderColor: color,
          }}
        />
        <View
          style={{
            position: 'absolute',
            bottom: 2,
            right: 2,
            width: 4,
            height: 4,
            borderBottomWidth: 1.6,
            borderRightWidth: 1.6,
            borderColor: color,
          }}
        />
      </View>
    );
  }

  return (
    <View style={{ width: 16, height: 16 }}>
      <View
        style={{
          position: 'absolute',
          top: 4,
          left: 4,
          width: 5,
          height: 5,
          borderTopWidth: 1.6,
          borderLeftWidth: 1.6,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
          width: 5,
          height: 5,
          borderTopWidth: 1.6,
          borderRightWidth: 1.6,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: 4,
          left: 4,
          width: 5,
          height: 5,
          borderBottomWidth: 1.6,
          borderLeftWidth: 1.6,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: 4,
          right: 4,
          width: 5,
          height: 5,
          borderBottomWidth: 1.6,
          borderRightWidth: 1.6,
          borderColor: color,
        }}
      />
    </View>
  );
}

function SpeakerToggleIcon({ muted }: { muted: boolean }) {
  return (
    <View style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          left: 1,
          width: 5,
          height: 8,
          borderTopLeftRadius: 2,
          borderBottomLeftRadius: 2,
          backgroundColor: muted ? '#fca5a5' : '#fb923c',
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 5,
          width: 0,
          height: 0,
          borderTopWidth: 5,
          borderBottomWidth: 5,
          borderLeftWidth: 8,
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
          borderLeftColor: muted ? '#fca5a5' : '#fb923c',
        }}
      />
      {muted ? (
        <>
          <View
            style={{
              position: 'absolute',
              right: 1,
              width: 10,
              height: 1.8,
              borderRadius: 999,
              backgroundColor: '#fca5a5',
              transform: [{ rotate: '45deg' }],
            }}
          />
          <View
            style={{
              position: 'absolute',
              right: 1,
              width: 10,
              height: 1.8,
              borderRadius: 999,
              backgroundColor: '#fca5a5',
              transform: [{ rotate: '-45deg' }],
            }}
          />
        </>
      ) : (
        <>
          <View
            style={{
              position: 'absolute',
              right: 2,
              width: 4,
              height: 4,
              borderTopWidth: 1.6,
              borderRightWidth: 1.6,
              borderColor: '#fdba74',
              borderLeftWidth: 0,
              borderBottomWidth: 0,
              borderTopRightRadius: 6,
              transform: [{ rotate: '45deg' }],
            }}
          />
          <View
            style={{
              position: 'absolute',
              right: -1,
              width: 8,
              height: 8,
              borderTopWidth: 1.6,
              borderRightWidth: 1.6,
              borderColor: '#fdba74',
              borderLeftWidth: 0,
              borderBottomWidth: 0,
              borderTopRightRadius: 8,
              transform: [{ rotate: '45deg' }],
            }}
          />
        </>
      )}
    </View>
  );
}
