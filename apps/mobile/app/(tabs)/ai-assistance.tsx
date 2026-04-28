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
  buildLokiAudioSource,
  buildLokiSpeechSource,
  createLokiReplyJob,
  getLokiReplyJobEvents,
  getLokiSession,
  getLokiReplyJobResult,
  listLokiSessions,
  streamLokiReplyJob,
  type RemoteLokiMessage,
  type RemoteLokiReplyJobCompletedMetadata,
  type RemoteLokiReplyJobEvent,
  transcribeLokiAudio,
} from '../../services/ai-chat-api';
import { logMobileError } from '../../services/error-monitor';

const LokiNativeVoiceVisualizer = require('../../components/ai/loki-native-voice-visualizer').default;
const HOLD_TO_RECORD_DELAY_MS = 90;
const TALK_EXPAND_DURATION_MS = 240;
const TALK_RESET_DURATION_MS = 180;
const TALK_BUTTON_FLEX = 1.2;
const TYPE_BUTTON_FLEX = 1;
const TALK_BUTTON_EXPANDED_FLEX = TALK_BUTTON_FLEX + TYPE_BUTTON_FLEX;
const SPEECH_METER_FLOOR_DB = -55;
const SPEECH_METER_CEILING_DB = -35;
const PROGRESS_MESSAGE_DELAY_MS = 2000;
const PROGRESS_MESSAGE_MIN_VISIBLE_MS = 2400;
const PROGRESS_TRANSITION_MS = 380;
const ENABLE_LOKI_ATTACHMENT_DEBUG = true;
const TALK_EXPAND_EASING = Easing.bezier(0.22, 1, 0.36, 1);
const TALK_RESET_EASING = Easing.bezier(0.4, 0, 0.2, 1);

export default function AiAssistanceRoute() {
  const theme = useAppTheme();
  const auth = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isCompact = width < 390;
  const conversationScrollRef = useRef<ScrollView | null>(null);
  const [messages, setMessages] = useState<RemoteLokiMessage[]>([]);
  const [transientProgressMessage, setTransientProgressMessage] = useState<RemoteLokiMessage | null>(null);
  const [transitioningFinalMessage, setTransitioningFinalMessage] = useState<RemoteLokiMessage | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [talkHoldActive, setTalkHoldActive] = useState(false);
  const [voiceRecordingActive, setVoiceRecordingActive] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [assistantReplyInFlight, setAssistantReplyInFlight] = useState(false);
  const [assistantWaiting, setAssistantWaiting] = useState(false);
  const [assistantStageLabel, setAssistantStageLabel] = useState<string | null>(null);
  const [assistantSpeechLevel, setAssistantSpeechLevel] = useState(0);
  const [audioMuted, setAudioMuted] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [composerBusy, setComposerBusy] = useState(false);
  const [visualizerCollapsed, setVisualizerCollapsed] = useState(false);
  const [typingMode, setTypingMode] = useState(false);
  const holdToRecordTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const talkExpandProgress = useRef(new Animated.Value(0)).current;
  const talkGlowOpacity = useRef(new Animated.Value(0)).current;
  const talkLoadingOrbit = useRef(new Animated.Value(0)).current;
  const visualizerCardHeight = useRef(new Animated.Value(isCompact ? 232 : 256)).current;
  const conversationBodyHeight = useRef(new Animated.Value(isCompact ? 300 : 360)).current;
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const composerOpacity = useRef(new Animated.Value(0)).current;
  const assistantSpeechLevelRef = useRef(0);
  const activeReplyJobAbortRef = useRef<AbortController | null>(null);
  const transientProgressMessageRef = useRef<RemoteLokiMessage | null>(null);
  const progressShownAtRef = useRef<number | null>(null);
  const progressGatePromiseRef = useRef<Promise<void> | null>(null);
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
    }).catch((error) => {
      logMobileError(error, {
        source: 'ai-assistance.configure-audio-mode',
      });
    });
  }, []);

  useEffect(() => {
    return () => {
      activeReplyJobAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!assistantWaiting) {
      setTransientProgressMessage(null);
      setTransitioningFinalMessage(null);
      setAssistantStageLabel(null);
      transientProgressMessageRef.current = null;
      progressShownAtRef.current = null;
      progressGatePromiseRef.current = null;
    }
  }, [assistantWaiting]);

  const shouldExpandTalkButton = talkHoldActive || assistantReplyInFlight || assistantWaiting;

  useEffect(() => {
    Animated.timing(talkGlowOpacity, {
      toValue: talkHoldActive ? 0.82 : 0,
      duration: talkHoldActive ? 160 : TALK_RESET_DURATION_MS,
      easing: talkHoldActive ? TALK_EXPAND_EASING : TALK_RESET_EASING,
      useNativeDriver: false,
    }).start();
  }, [talkGlowOpacity, talkHoldActive]);

  useEffect(() => {
    const shouldAnimateLoading = assistantReplyInFlight || assistantWaiting;

    if (!shouldAnimateLoading) {
      talkLoadingOrbit.stopAnimation();
      talkLoadingOrbit.setValue(0);
      return;
    }

    const orbitLoop = Animated.loop(
      Animated.timing(talkLoadingOrbit, {
        toValue: 1,
        duration: 1600,
        easing: Easing.linear,
        useNativeDriver: false,
      })
    );

    orbitLoop.start();

    return () => {
      orbitLoop.stop();
    };
  }, [assistantReplyInFlight, assistantWaiting, talkLoadingOrbit]);

  useEffect(() => {
    Animated.timing(talkExpandProgress, {
      toValue: shouldExpandTalkButton ? 1 : 0,
      duration: shouldExpandTalkButton ? TALK_EXPAND_DURATION_MS : TALK_RESET_DURATION_MS,
      easing: shouldExpandTalkButton ? TALK_EXPAND_EASING : TALK_RESET_EASING,
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
          ? assistantReplyInFlight || assistantWaiting
            ? 288
            : 232
          : assistantReplyInFlight || assistantWaiting
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
    assistantReplyInFlight,
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
          logMobileError(error, {
            source: 'ai-assistance.load-bootstrap',
            extra: { authStatus: auth.status },
          });
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

        setMessages((current) => {
          logLokiAttachmentDebug('session-detail-before-merge', {
            sessionId: activeSessionId,
            remoteMessages: detail.messages,
            currentMessages: current,
          });
          const mergedMessages = mergeSessionMessagesWithHydratedLocalMessages(detail.messages, current);
          logLokiAttachmentDebug('session-detail-after-merge', {
            sessionId: activeSessionId,
            mergedMessages,
          });
          return mergedMessages;
        });
      } catch (error) {
        logMobileError(error, {
          source: 'ai-assistance.load-session',
          extra: { sessionId: activeSessionId },
        });
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
      } catch (error) {
        logMobileError(error, {
          source: 'ai-assistance.stop-recorder-during-reset',
        });
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
    }).catch((error) => {
      logMobileError(error, {
        source: 'ai-assistance.reset-audio-mode',
      });
    });

    return recordingUri;
  }, [recorder, recorderState.isRecording]);

  const runReplyJob = useCallback(
    async (input: {
      accessToken: string;
      sessionId: string | null;
      messageText: string;
      optimisticUserMessageId: string;
      muteAudioResponse: boolean;
    }) => {
      activeReplyJobAbortRef.current?.abort();
      const abortController = new AbortController();
      activeReplyJobAbortRef.current = abortController;

      try {
        const created = await createLokiReplyJob(input.accessToken, {
          sessionId: input.sessionId,
          message: input.messageText,
          muteAudioResponse: input.muteAudioResponse,
        });

        setActiveSessionId(created.session.id);
        setMessages((current) => {
          const optimisticUserMessage = current.find((message) => message.id === input.optimisticUserMessageId);
          const withoutPendingUser = current.filter((message) => message.id !== input.optimisticUserMessageId);
          return [...withoutPendingUser, mergeCreatedUserMessage(created.userMessage, optimisticUserMessage)];
        });

        const completedMetadata = await streamLokiReplyJob(
          input.accessToken,
          created.job.id,
          {
            onEvent: (event) => {
              if (event.eventType === 'completed') {
                return;
              }

              if (event.eventType !== 'retrieving_lecture' && event.eventType !== 'research_searching') {
                return;
              }
              setAssistantWaiting(true);
              setAssistantStageLabel(event.eventType === 'research_searching' ? 'Searching' : 'Retrieving');
              if (progressGatePromiseRef.current) {
                return;
              }

              progressGatePromiseRef.current = (async () => {
                await waitForDuration(PROGRESS_MESSAGE_DELAY_MS, abortController.signal);
                const progressMessage = createProgressMessage(created.job.id, event);
                progressShownAtRef.current = Date.now();
                transientProgressMessageRef.current = progressMessage;
                setTransientProgressMessage(progressMessage);

                if (!input.muteAudioResponse) {
                  player.replace(buildLokiSpeechSource(input.accessToken, event.message));
                  player.play();
                }

                setAssistantStageLabel('Creating');
                await waitForDuration(PROGRESS_MESSAGE_MIN_VISIBLE_MS, abortController.signal);
              })().catch(() => undefined);
            },
          },
          {
            abortSignal: abortController.signal,
          }
        );

        const finalResult = await getLokiReplyJobResult(input.accessToken, created.job.id);
        const finalEvents = await getLokiReplyJobEvents(input.accessToken, created.job.id);
        logLokiAttachmentDebug('reply-job-result', {
          jobId: created.job.id,
          assistantMessage: finalResult.assistantMessage,
          completedMetadata,
          events: finalEvents.events,
        });
        const assistantMessage = mergeFinalAssistantMessage(
          finalResult.assistantMessage,
          completedMetadata,
          finalEvents.events
        );
        logLokiAttachmentDebug('reply-job-merged-assistant-message', {
          jobId: created.job.id,
          assistantMessage,
        });
        const finalAudioMessageId =
          finalResult.audioMessageId ??
          completedMetadata.audioMessageId ??
          assistantMessage.id;

        await progressGatePromiseRef.current;

        if (transientProgressMessageRef.current) {
          setTransitioningFinalMessage(assistantMessage);
          await waitForDuration(PROGRESS_TRANSITION_MS);
        }

        setActiveSessionId(finalResult.session.id);
        setMessages((current) => {
          const existingIndex = current.findIndex((message) => message.id === assistantMessage.id);

          if (existingIndex >= 0) {
            const nextMessages = [...current];
            nextMessages[existingIndex] = assistantMessage;
            logLokiAttachmentDebug('reply-job-set-messages-replace', {
              jobId: created.job.id,
              assistantMessageId: assistantMessage.id,
              messages: nextMessages,
            });
            return nextMessages;
          }

          const nextMessages = [...current, assistantMessage];
          logLokiAttachmentDebug('reply-job-set-messages-append', {
            jobId: created.job.id,
            assistantMessageId: assistantMessage.id,
            messages: nextMessages,
          });
          return nextMessages;
        });
        setTransientProgressMessage(null);
        setTransitioningFinalMessage(null);
        transientProgressMessageRef.current = null;
        progressShownAtRef.current = null;
        progressGatePromiseRef.current = null;

        if ((finalResult.shouldAutoPlayAudio || completedMetadata.shouldAutoPlayAudio) && finalAudioMessageId) {
          await setAudioModeAsync({
            allowsRecording: false,
            playsInSilentMode: true,
            interruptionMode: 'doNotMix',
            shouldPlayInBackground: false,
            shouldRouteThroughEarpiece: false,
          });

          player.replace(buildLokiAudioSource(input.accessToken, finalAudioMessageId));
          player.play();
        }
      } finally {
        setAssistantWaiting(false);
        activeReplyJobAbortRef.current = null;
      }
    },
    [player]
  );

  const processVoiceInput = useCallback(
    async (recordingUri: string) => {
      if (auth.status !== 'authenticated') {
        throw new Error('Sign in again before talking with Loki.');
      }

      setVoiceBusy(true);
      setAssistantReplyInFlight(true);
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

        await runReplyJob({
          accessToken,
          sessionId: activeSessionId,
          messageText: transcriptText,
          optimisticUserMessageId: optimisticUserMessage.id,
          muteAudioResponse: visualizerCollapsed || typingMode || audioMuted,
        });
      } finally {
        setAssistantReplyInFlight(false);
        setVoiceBusy(false);
      }
    },
    [activeSessionId, audioMuted, auth, runReplyJob, typingMode, visualizerCollapsed]
  );

  const handleSendText = useCallback(async () => {
    const messageText = composerText.trim();

    if (!messageText || composerBusy || auth.status !== 'authenticated') {
      return;
    }

    setComposerBusy(true);
    setAssistantReplyInFlight(true);
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

      await runReplyJob({
        accessToken,
        sessionId: activeSessionId,
        messageText,
        optimisticUserMessageId: optimisticUserMessage.id,
        muteAudioResponse: visualizerCollapsed || typingMode || audioMuted,
      });
    } catch (error) {
      logMobileError(error, {
        source: 'ai-assistance.send-text',
        extra: { sessionId: activeSessionId },
      });
      setErrorMessage(error instanceof Error ? error.message : 'Unable to send your message right now.');
    } finally {
      setAssistantReplyInFlight(false);
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
    runReplyJob,
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
      logMobileError(error, {
        source: 'ai-assistance.start-voice-recording',
      });
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
    if (voiceBusy || talkHoldActive || assistantReplyInFlight) {
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
  }, [assistantReplyInFlight, startVoiceRecording, talkHoldActive, voiceBusy]);

  const handleTalkPressOut = useCallback(() => {
    void (async () => {
      const recordingUri = await resetVoiceHoldState();

      if (recordingUri) {
        try {
          await processVoiceInput(recordingUri);
        } catch (error) {
          logMobileError(error, {
            source: 'ai-assistance.process-voice-input',
            extra: { sessionId: activeSessionId },
          });
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
  const talkOrbitRotation = talkLoadingOrbit.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const visualizerBarHeights = [
    8 + liveVoiceLevel * 10,
    12 + liveVoiceLevel * 14,
    9 + liveVoiceLevel * 23,
    11 + liveVoiceLevel * 11,
  ];
  const visualizerBarOpacity = 0.48 + liveVoiceLevel * 0.52;
  const assistantLoadingStage = assistantWaiting
    ? assistantStageLabel ?? 'Thinking'
    : assistantReplyInFlight
      ? 'Thinking'
      : null;
  const talkButtonLabel = voiceRecordingActive
    ? 'Listening'
    : assistantLoadingStage
      ? assistantLoadingStage
      : talkHoldActive
        ? 'Keep Holding'
        : 'Hold To Talk';
  const visualizerMode = playerStatus.playing
    ? 'speaking'
    : assistantReplyInFlight || assistantWaiting
      ? 'waiting'
      : 'idle';
  const visualizerPlaybackTimeSeconds = playerStatus.currentTime;

  return (
    <>
      <Stack.Screen options={{ title: 'AI Assist' }} />

      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
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
            <Text
              selectable
              style={{
                color: theme.colors.textMuted,
                fontSize: 13,
                fontWeight: '700',
              }}
            >
              AI assistant
            </Text>
            <Text
              selectable
              style={{
                color: theme.colors.text,
                fontSize: 30,
                fontWeight: '800',
              }}
            >
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
              backgroundColor: pressed
                ? theme.colors.cardMuted
                : theme.colors.overlay,
              borderWidth: 1,
              borderColor: theme.colors.border,
              boxShadow: '0 10px 20px rgba(15, 23, 42, 0.06)',
            })}
          >
            <Text
              selectable
              style={{
                color: theme.colors.textMuted,
                fontSize: 12,
                fontWeight: '700',
              }}
            >
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
            statusLabel={assistantLoadingStage ?? undefined}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              visualizerCollapsed
                ? 'Expand Loki visualizer'
                : 'Minimize Loki visualizer'
            }
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
              backgroundColor: pressed
                ? 'rgba(17, 12, 8, 0.92)'
                : 'rgba(17, 12, 8, 0.78)',
              borderWidth: 1,
              borderColor: 'rgba(255, 237, 213, 0.10)',
            })}
          >
            <VisualizerToggleBadge collapsed={visualizerCollapsed} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              visualizerCollapsed || audioMuted
                ? 'Unmute Loki audio'
                : 'Mute Loki audio'
            }
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
              backgroundColor: pressed
                ? 'rgba(17, 12, 8, 0.92)'
                : 'rgba(17, 12, 8, 0.78)',
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
          transientProgressMessage={transientProgressMessage}
          transitioningFinalMessage={transitioningFinalMessage}
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
                backgroundColor: pressed
                  ? theme.colors.cardMuted
                  : theme.colors.neutralSoft,
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
          <Animated.View
            style={{
              flex: talkButtonFlex,
              minHeight: 64,
              }}
          >
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
              disabled={voiceBusy || assistantReplyInFlight}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 64,
                borderRadius: 22,
                borderCurve: 'continuous',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                backgroundColor:
                  talkHoldActive ||
                  voiceRecordingActive ||
                  assistantReplyInFlight
                    ? '#b91c1c'
                    : pressed
                      ? theme.colors.accentMuted
                      : theme.colors.accent,
                boxShadow:
                  talkHoldActive ||
                  voiceRecordingActive ||
                  assistantReplyInFlight
                    ? '0 18px 34px rgba(220, 38, 38, 0.26)'
                    : '0 16px 28px rgba(234, 88, 12, 0.18)',
                opacity: assistantReplyInFlight ? 0.88 : 1,
              })}
            >
              {assistantReplyInFlight || assistantWaiting ? (
                <View
                  style={{
                    minHeight: 32,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                />
              ) : (
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
              )}
              <Text
                style={{
                  color: theme.colors.accentContrast,
                  fontSize: 15,
                  fontWeight: '700',
                }}
              >
                {talkButtonLabel}
              </Text>
            </Pressable>
            {assistantReplyInFlight || assistantWaiting ? (
              <Animated.View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: 12,
                  alignSelf: 'center',
                  width: 28,
                  height: 28,
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: [{ rotate: talkOrbitRotation }],
                }}
              >
                <View
                  style={{
                    position: 'absolute',
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    borderWidth: 5,
                    borderColor: 'rgb(0 0 0)',
                  }}
                />
                <View
                  style={{
                    position: 'absolute',
                    top: -1,
                    width: 5,
                    height: 5,
                    borderRadius: 999,
                    backgroundColor: '#000000',
                  }}
                />
              </Animated.View>
            ) : null}
          </Animated.View>

          <Animated.View
            pointerEvents={
              talkHoldActive || assistantReplyInFlight ? 'none' : 'auto'
            }
            style={{
              flex: typeButtonFlex,
              minHeight: 64,
              opacity: typeButtonOpacity,
            }}
          >
            {talkHoldActive || assistantReplyInFlight ? (
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
                  backgroundColor: pressed
                    ? theme.colors.neutralBorder
                    : theme.colors.neutralSoft,
                  borderWidth: 1,
                  borderColor: theme.colors.neutralBorder,
                  boxShadow: '0 16px 28px rgba(15, 23, 42, 0.16)',
                })}
              >
                <Text style={{ fontSize: 20 }}>⌨️</Text>
                <Text
                  style={{
                    color: theme.colors.text,
                    fontSize: 15,
                    fontWeight: '700',
                  }}
                >
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
              editable={!composerBusy && !assistantReplyInFlight}
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
              accessibilityLabel={
                typingMode ? 'Close typing mode' : 'Restore full Loki view'
              }
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
                backgroundColor: pressed
                  ? theme.colors.cardMuted
                  : theme.colors.neutralSoft,
                borderWidth: 1,
                borderColor: theme.colors.neutralBorder,
              })}
            >
              <Text
                style={{
                  color: theme.colors.text,
                  fontSize: 20,
                  fontWeight: '700',
                }}
              >
                ×
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send message to Loki"
              disabled={
                composerBusy ||
                assistantReplyInFlight ||
                composerText.trim().length === 0
              }
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
                  composerBusy ||
                  assistantReplyInFlight ||
                  composerText.trim().length === 0
                    ? theme.colors.neutralBorder
                    : pressed
                      ? theme.colors.accentMuted
                      : theme.colors.accent,
              })}
            >
              <Text
                style={{
                  color:
                    composerBusy ||
                    assistantReplyInFlight ||
                    composerText.trim().length === 0
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
  const isVoiceTranscript = role === 'user' && options.source === 'voice';

  return {
    id: `pending-${role}-${Date.now()}`,
    role,
    messageText,
    modelName: isVoiceTranscript ? 'transcribing' : null,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    retrievalMetadata: isVoiceTranscript ? { inputSource: 'voice' } : null,
    hasQuiz: false,
    quizId: null,
    quizTitle: null,
    hasFlashcards: false,
    flashcardSetId: null,
    flashcardTitle: null,
    createdAt: new Date().toISOString(),
    citations: [],
  };
}

function createProgressMessage(jobId: string, event: RemoteLokiReplyJobEvent): RemoteLokiMessage {
  return {
    id: `progress-${jobId}-${event.sequenceNumber}`,
    role: 'assistant',
    messageText: event.message,
    modelName: 'progress',
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    retrievalMetadata: {
      kind: 'reply_job_progress',
      jobId,
      eventType: event.eventType,
      sequenceNumber: event.sequenceNumber,
    },
    hasQuiz: false,
    quizId: null,
    quizTitle: null,
    hasFlashcards: false,
    flashcardSetId: null,
    flashcardTitle: null,
    createdAt: event.createdAt,
    citations: [],
  };
}

function mergeFinalAssistantMessage(
  message: RemoteLokiMessage,
  completedMetadata: RemoteLokiReplyJobCompletedMetadata,
  events: RemoteLokiReplyJobEvent[]
): RemoteLokiMessage {
  const eventAttachments = readAttachmentMetadataFromEvents(events);
  const hasQuiz = message.hasQuiz || completedMetadata.hasQuiz || eventAttachments.hasQuiz;
  const quizId = message.quizId ?? completedMetadata.quizId ?? eventAttachments.quizId ?? null;
  const quizTitle = message.quizTitle ?? completedMetadata.quizTitle ?? eventAttachments.quizTitle ?? null;
  const hasFlashcards =
    message.hasFlashcards || completedMetadata.hasFlashcards || eventAttachments.hasFlashcards;
  const flashcardSetId =
    message.flashcardSetId ?? completedMetadata.flashcardSetId ?? eventAttachments.flashcardSetId ?? null;
  const flashcardTitle =
    message.flashcardTitle ?? completedMetadata.flashcardTitle ?? eventAttachments.flashcardTitle ?? null;

  return {
    ...message,
    retrievalMetadata: mergeAttachmentDataIntoRetrievalMetadata(message.retrievalMetadata, {
      hasQuiz,
      quizId,
      quizTitle,
      hasFlashcards,
      flashcardSetId,
      flashcardTitle,
    }),
    hasQuiz,
    quizId,
    quizTitle,
    hasFlashcards,
    flashcardSetId,
    flashcardTitle,
  };
}

function mergeSessionMessagesWithHydratedLocalMessages(
  remoteMessages: RemoteLokiMessage[],
  currentMessages: RemoteLokiMessage[]
) {
  const currentById = new Map(currentMessages.map((message) => [message.id, message]));
  const remoteMessageIds = new Set(remoteMessages.map((message) => message.id));

  const mergedRemoteMessages = remoteMessages.map((remoteMessage) => {
    const currentMessage = currentById.get(remoteMessage.id);

    if (!currentMessage) {
      return remoteMessage;
    }

    return {
      ...remoteMessage,
      modelName:
        remoteMessage.modelName ??
        (isVoiceTranscriptMessage(currentMessage) && remoteMessage.role === 'user' ? 'transcribing' : null),
      retrievalMetadata: mergeAttachmentDataIntoRetrievalMetadata(
        remoteMessage.retrievalMetadata ?? currentMessage.retrievalMetadata,
        {
          hasQuiz: remoteMessage.hasQuiz || currentMessage.hasQuiz,
          quizId: remoteMessage.quizId ?? currentMessage.quizId ?? null,
          quizTitle: remoteMessage.quizTitle ?? currentMessage.quizTitle ?? null,
          hasFlashcards: remoteMessage.hasFlashcards || currentMessage.hasFlashcards,
          flashcardSetId: remoteMessage.flashcardSetId ?? currentMessage.flashcardSetId ?? null,
          flashcardTitle: remoteMessage.flashcardTitle ?? currentMessage.flashcardTitle ?? null,
        }
      ),
      hasQuiz: remoteMessage.hasQuiz || currentMessage.hasQuiz,
      quizId: remoteMessage.quizId ?? currentMessage.quizId ?? null,
      quizTitle: remoteMessage.quizTitle ?? currentMessage.quizTitle ?? null,
      hasFlashcards: remoteMessage.hasFlashcards || currentMessage.hasFlashcards,
      flashcardSetId: remoteMessage.flashcardSetId ?? currentMessage.flashcardSetId ?? null,
      flashcardTitle: remoteMessage.flashcardTitle ?? currentMessage.flashcardTitle ?? null,
    };
  });

  const localOnlyMessages = currentMessages.filter((message) => !remoteMessageIds.has(message.id));

  if (localOnlyMessages.length === 0) {
    return mergedRemoteMessages;
  }

  return [...mergedRemoteMessages, ...localOnlyMessages].sort(compareMessagesByCreatedAt);
}

function mergeCreatedUserMessage(
  createdUserMessage: RemoteLokiMessage,
  optimisticUserMessage: RemoteLokiMessage | undefined
) {
  if (!optimisticUserMessage || !isVoiceTranscriptMessage(optimisticUserMessage) || createdUserMessage.role !== 'user') {
    return createdUserMessage;
  }

  return {
    ...createdUserMessage,
    modelName: 'transcribing' as const,
    retrievalMetadata: {
      ...(createdUserMessage.retrievalMetadata &&
      typeof createdUserMessage.retrievalMetadata === 'object' &&
      !Array.isArray(createdUserMessage.retrievalMetadata)
        ? (createdUserMessage.retrievalMetadata as Record<string, unknown>)
        : {}),
      inputSource: 'voice',
    },
  };
}

function compareMessagesByCreatedAt(left: RemoteLokiMessage, right: RemoteLokiMessage) {
  const leftTime = Date.parse(left.createdAt);
  const rightTime = Date.parse(right.createdAt);

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return left.id.localeCompare(right.id);
}

function logLokiAttachmentDebug(label: string, payload: unknown) {
  if (!ENABLE_LOKI_ATTACHMENT_DEBUG) {
    return;
  }

  try {
    console.log(`[loki-attachment-debug] ${label}`, JSON.stringify(payload, null, 2));
  } catch (error) {
    console.log(`[loki-attachment-debug] ${label}`, payload, error);
  }
}

function mergeAttachmentDataIntoRetrievalMetadata(
  retrievalMetadata: RemoteLokiMessage['retrievalMetadata'],
  attachments: {
    hasQuiz: boolean;
    quizId: string | null;
    quizTitle: string | null;
    hasFlashcards: boolean;
    flashcardSetId: string | null;
    flashcardTitle: string | null;
  }
) {
  const metadata =
    retrievalMetadata && typeof retrievalMetadata === 'object' && !Array.isArray(retrievalMetadata)
      ? { ...(retrievalMetadata as Record<string, unknown>) }
      : {};

  if (attachments.hasQuiz && attachments.quizId) {
    metadata.quiz = {
      hasQuiz: true,
      quizId: attachments.quizId,
      quizTitle: attachments.quizTitle,
    };
  }

  if (attachments.hasFlashcards && attachments.flashcardSetId) {
    metadata.flashcards = {
      hasFlashcards: true,
      flashcardSetId: attachments.flashcardSetId,
      flashcardTitle: attachments.flashcardTitle,
    };
  }

  return metadata;
}

function isVoiceTranscriptMessage(message: RemoteLokiMessage) {
  if (message.modelName === 'transcribing') {
    return true;
  }

  if (!message.retrievalMetadata || typeof message.retrievalMetadata !== 'object' || Array.isArray(message.retrievalMetadata)) {
    return false;
  }

  return (message.retrievalMetadata as Record<string, unknown>).inputSource === 'voice';
}

function readAttachmentMetadataFromEvents(events: RemoteLokiReplyJobEvent[]) {
  let quizId: string | null = null;
  let quizTitle: string | null = null;
  let flashcardSetId: string | null = null;
  let flashcardTitle: string | null = null;

  for (const event of events) {
    if (!event.metadata || typeof event.metadata !== 'object' || Array.isArray(event.metadata)) {
      continue;
    }

    const metadata = event.metadata as Record<string, unknown>;

    if (event.eventType === 'quiz_generation_completed') {
      if (typeof metadata.quizId === 'string' && metadata.quizId.length > 0) {
        quizId = metadata.quizId;
      }

      if (typeof metadata.quizTitle === 'string' && metadata.quizTitle.trim().length > 0) {
        quizTitle = metadata.quizTitle.trim();
      }
    }

    if (event.eventType === 'flashcards_generation_completed') {
      if (typeof metadata.flashcardSetId === 'string' && metadata.flashcardSetId.length > 0) {
        flashcardSetId = metadata.flashcardSetId;
      }

      if (typeof metadata.flashcardTitle === 'string' && metadata.flashcardTitle.trim().length > 0) {
        flashcardTitle = metadata.flashcardTitle.trim();
      }
    }
  }

  return {
    hasQuiz: Boolean(quizId),
    quizId,
    quizTitle,
    hasFlashcards: Boolean(flashcardSetId),
    flashcardSetId,
    flashcardTitle,
  };
}

function waitForDuration(milliseconds: number, abortSignal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, milliseconds);

    const handleAbort = () => {
      cleanup();
      reject(new Error('The request was cancelled.'));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      abortSignal?.removeEventListener('abort', handleAbort);
    };

    if (abortSignal) {
      abortSignal.addEventListener('abort', handleAbort, { once: true });
    }
  });
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
