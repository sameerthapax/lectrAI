import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { Linking, Animated, Easing, Pressable, ScrollView, Text, View } from 'react-native';
import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import type { AppTheme } from '../../services/app-theme';
import type { RemoteLokiMessage, RemoteLokiResearchAttachment, RemoteLokiResearchPaper } from '../../services/ai-chat-api';

const ENABLE_LOKI_ATTACHMENT_DEBUG = true;

type LokiConversationPanelProps = {
  theme: AppTheme;
  isCompact?: boolean;
  title?: string;
  messages: RemoteLokiMessage[];
  loading?: boolean;
  errorMessage?: string | null;
  emptyMessage: string;
  action?: ReactNode;
  showOuterCard?: boolean;
  scrollRef?: MutableRefObject<ScrollView | null>;
  onContentSizeChange?: () => void;
  bodyHeight?: number | Animated.Value | Animated.AnimatedInterpolation<number>;
  fillBody?: boolean;
  bodyStyle?: ViewStyle;
  transientProgressMessage?: RemoteLokiMessage | null;
  transitioningFinalMessage?: RemoteLokiMessage | null;
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
  showOuterCard = true,
  scrollRef,
  onContentSizeChange,
  bodyHeight,
  fillBody = false,
  bodyStyle,
  transientProgressMessage = null,
  transitioningFinalMessage = null,
}: LokiConversationPanelProps) {
  const conversationSurface = theme.resolvedMode === 'dark' ? '#171c21' : 'rgba(248, 250, 252, 0.96)';
  const assistantBubble = theme.resolvedMode === 'dark' ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.88)';
  const userBubble = theme.resolvedMode === 'dark' ? 'rgba(255, 138, 61, 0.22)' : 'rgba(255, 237, 220, 0.98)';
  const citationChip = theme.resolvedMode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.88)';
  const quizCardBackground = theme.resolvedMode === 'dark' ? 'rgba(96, 165, 250, 0.18)' : '#eaf4ff';
  const quizCardLabel = theme.resolvedMode === 'dark' ? '#bfdbfe' : '#2563eb';
  const quizCardHint = theme.resolvedMode === 'dark' ? '#dbeafe' : '#1d4ed8';
  const flashcardCardBackground = theme.resolvedMode === 'dark' ? 'rgba(168, 85, 247, 0.22)' : '#f4e8ff';
  const flashcardCardLabel = theme.resolvedMode === 'dark' ? '#e9d5ff' : '#7c3aed';
  const flashcardCardHint = theme.resolvedMode === 'dark' ? '#f3e8ff' : '#6d28d9';
  const researchCardBackground = theme.resolvedMode === 'dark' ? 'rgba(245, 158, 11, 0.24)' : '#fef3c7';
  const researchCardLabel = theme.resolvedMode === 'dark' ? '#fde68a' : '#92400e';
  const researchCardHint = theme.resolvedMode === 'dark' ? '#fef3c7' : '#a16207';
  const loadingPulse = useRef(new Animated.Value(0)).current;
  const transitionProgress = useRef(new Animated.Value(0)).current;
  const [transitionHeight, setTransitionHeight] = useState(0);

  useEffect(() => {
    if (!transientProgressMessage || transitioningFinalMessage) {
      loadingPulse.stopAnimation();
      loadingPulse.setValue(0);
      return;
    }

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(loadingPulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(loadingPulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    );

    pulseLoop.start();

    return () => {
      pulseLoop.stop();
      loadingPulse.setValue(0);
    };
  }, [loadingPulse, transientProgressMessage, transitioningFinalMessage]);

  useEffect(() => {
    if (!transientProgressMessage || !transitioningFinalMessage) {
      transitionProgress.stopAnimation();
      transitionProgress.setValue(0);
      setTransitionHeight(0);
      return;
    }

    Animated.timing(transitionProgress, {
      toValue: 1,
      duration: 380,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [transitionProgress, transientProgressMessage, transitioningFinalMessage]);

  const loadingBubbleOpacity = loadingPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.58, 1],
  });
  const loadingBubbleScale = loadingPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.988, 1.008],
  });
  const outgoingTranslateX = transitionProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -84],
  });
  const outgoingOpacity = transitionProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const incomingTranslateX = transitionProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [84, 0],
  });
  const incomingOpacity = transitionProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const body = (
    <Animated.View
      style={{
        flex: fillBody ? 1 : undefined,
        minHeight: fillBody ? 0 : undefined,
        height: fillBody ? undefined : (bodyHeight ?? (isCompact ? 220 : 300)),
        borderRadius: 18,
        overflow: 'hidden',
        backgroundColor: conversationSurface,
        ...bodyStyle,
      }}
    >
      <ScrollView
        ref={scrollRef}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        onContentSizeChange={onContentSizeChange}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 12,
          paddingTop: 14,
          paddingBottom: 18,
          gap: 12,
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
          messages.map((message) => (
            <ConversationMessageBubble
              key={message.id}
              message={message}
              theme={theme}
              assistantBubble={assistantBubble}
              userBubble={userBubble}
              citationChip={citationChip}
              quizCardBackground={quizCardBackground}
              quizCardLabel={quizCardLabel}
              quizCardHint={quizCardHint}
              flashcardCardBackground={flashcardCardBackground}
              flashcardCardLabel={flashcardCardLabel}
              flashcardCardHint={flashcardCardHint}
              researchCardBackground={researchCardBackground}
              researchCardLabel={researchCardLabel}
              researchCardHint={researchCardHint}
            />
          ))
        )}

        {transientProgressMessage && !transitioningFinalMessage ? (
          <Animated.View
            style={{
              opacity: loadingBubbleOpacity,
              transform: [{ scale: loadingBubbleScale }],
            }}
          >
            <ConversationMessageBubble
              message={transientProgressMessage}
              theme={theme}
              assistantBubble={assistantBubble}
              userBubble={userBubble}
              citationChip={citationChip}
              quizCardBackground={quizCardBackground}
              quizCardLabel={quizCardLabel}
              quizCardHint={quizCardHint}
              flashcardCardBackground={flashcardCardBackground}
              flashcardCardLabel={flashcardCardLabel}
              flashcardCardHint={flashcardCardHint}
              researchCardBackground={researchCardBackground}
              researchCardLabel={researchCardLabel}
              researchCardHint={researchCardHint}
            />
          </Animated.View>
        ) : null}

        {transientProgressMessage && transitioningFinalMessage ? (
          <View
            style={{
              position: 'relative',
              minHeight: transitionHeight || undefined,
            }}
          >
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                inset: 0,
                opacity: outgoingOpacity,
                transform: [{ translateX: outgoingTranslateX }],
              }}
              onLayout={(event) => {
                const nextHeight = event.nativeEvent.layout.height;
                setTransitionHeight((current) => Math.max(current, nextHeight));
              }}
            >
              <ConversationMessageBubble
                message={transientProgressMessage}
                theme={theme}
                assistantBubble={assistantBubble}
                userBubble={userBubble}
                citationChip={citationChip}
                quizCardBackground={quizCardBackground}
                quizCardLabel={quizCardLabel}
                quizCardHint={quizCardHint}
                flashcardCardBackground={flashcardCardBackground}
                flashcardCardLabel={flashcardCardLabel}
                flashcardCardHint={flashcardCardHint}
                researchCardBackground={researchCardBackground}
                researchCardLabel={researchCardLabel}
                researchCardHint={researchCardHint}
              />
            </Animated.View>
            <Animated.View
              style={{
                opacity: incomingOpacity,
                transform: [{ translateX: incomingTranslateX }],
              }}
              onLayout={(event) => {
                const nextHeight = event.nativeEvent.layout.height;
                setTransitionHeight((current) => Math.max(current, nextHeight));
              }}
            >
              <ConversationMessageBubble
                message={transitioningFinalMessage}
                theme={theme}
                assistantBubble={assistantBubble}
                userBubble={userBubble}
                citationChip={citationChip}
                quizCardBackground={quizCardBackground}
                quizCardLabel={quizCardLabel}
                quizCardHint={quizCardHint}
                flashcardCardBackground={flashcardCardBackground}
                flashcardCardLabel={flashcardCardLabel}
                flashcardCardHint={flashcardCardHint}
                researchCardBackground={researchCardBackground}
                researchCardLabel={researchCardLabel}
                researchCardHint={researchCardHint}
              />
            </Animated.View>
          </View>
        ) : null}

        {errorMessage ? (
          <Text selectable style={{ color: '#dc2626', fontSize: 12.5, lineHeight: 18 }}>
            {errorMessage}
          </Text>
        ) : null}
      </ScrollView>
    </Animated.View>
  );

  if (!showOuterCard) {
    return body;
  }

  return (
    <BlurView
      intensity={24}
      tint={theme.resolvedMode === 'dark' ? 'dark' : 'light'}
      style={{
        borderRadius: 24,
        overflow: 'hidden',
        borderCurve: 'continuous',
        backgroundColor: theme.colors.overlay,
      }}
    >
      <View style={{ padding: 14, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Text selectable style={{ color: theme.colors.text, fontSize: 17, fontWeight: '700' }}>
            {title}
          </Text>
          {action}
        </View>
        {body}
      </View>
    </BlurView>
  );
}

type ConversationMessageBubbleProps = {
  message: RemoteLokiMessage;
  theme: AppTheme;
  assistantBubble: string;
  userBubble: string;
  citationChip: string;
  quizCardBackground: string;
  quizCardLabel: string;
  quizCardHint: string;
  flashcardCardBackground: string;
  flashcardCardLabel: string;
  flashcardCardHint: string;
  researchCardBackground: string;
  researchCardLabel: string;
  researchCardHint: string;
};

function ConversationMessageBubble({
  message,
  theme,
  assistantBubble,
  userBubble,
  citationChip,
  quizCardBackground,
  quizCardLabel,
  quizCardHint,
  flashcardCardBackground,
  flashcardCardLabel,
  flashcardCardHint,
  researchCardBackground,
  researchCardLabel,
  researchCardHint,
}: ConversationMessageBubbleProps) {
  const isAssistant = message.role === 'assistant';
  const quizAttachment = getQuizAttachment(message);
  const flashcardAttachment = getFlashcardAttachment(message);
  const researchAttachment = getResearchAttachment(message);

  if (ENABLE_LOKI_ATTACHMENT_DEBUG && isAssistant) {
    const looksLikeGeneratedMaterialReply =
      /quiz|flashcard|flash card|open it|open them|ready/i.test(message.messageText);

    if (looksLikeGeneratedMaterialReply) {
      console.log(
        '[loki-attachment-debug] conversation-bubble-render',
        JSON.stringify(
          {
            messageId: message.id,
            messageText: message.messageText,
            hasQuiz: message.hasQuiz,
            quizId: message.quizId,
            quizTitle: message.quizTitle,
            hasFlashcards: message.hasFlashcards,
            flashcardSetId: message.flashcardSetId,
            flashcardTitle: message.flashcardTitle,
            retrievalMetadata: message.retrievalMetadata,
            derivedQuizAttachment: quizAttachment,
            derivedFlashcardAttachment: flashcardAttachment,
            derivedResearchAttachment: researchAttachment,
          },
          null,
          2
        )
      );
    }
  }

  return (
    <View
      style={{
        alignSelf: isAssistant ? 'stretch' : 'flex-end',
        borderRadius: 18,
        padding: 12,
        gap: 8,
        backgroundColor: isAssistant ? assistantBubble : userBubble,
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
      ) : message.modelName === 'progress' ? (
        <Text selectable style={{ color: theme.colors.textMuted, fontSize: 11.5, fontWeight: '700' }}>
          Loki progress
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
                backgroundColor: citationChip,
              }}
            >
              <Text selectable style={{ color: theme.colors.textMuted, fontSize: 11.5, fontWeight: '700' }}>
                {citation.lectureTitle}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {message.role === 'assistant' && quizAttachment.hasQuiz && quizAttachment.quizId ? (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: '/quiz/[quizId]',
              params: { quizId: quizAttachment.quizId },
            })
          }
          style={({ pressed }) => ({
            borderRadius: 16,
            padding: 12,
            gap: 6,
            backgroundColor: quizCardBackground,
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <Text selectable style={{ color: quizCardLabel, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.3 }}>
            QUIZ GENERATED
          </Text>
          <Text selectable style={{ color: theme.colors.text, fontSize: 14, fontWeight: '700' }}>
            {quizAttachment.quizTitle?.trim() || 'Generated quiz'}
          </Text>
          <Text selectable style={{ color: quizCardHint, fontSize: 12.5, lineHeight: 18, fontWeight: '700' }}>
            Navigate to quiz
          </Text>
        </Pressable>
      ) : null}

      {message.role === 'assistant' && flashcardAttachment.hasFlashcards && flashcardAttachment.flashcardSetId ? (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: '/flashcards/[flashcardSetId]',
              params: { flashcardSetId: flashcardAttachment.flashcardSetId },
            })
          }
          style={({ pressed }) => ({
            borderRadius: 16,
            padding: 12,
            gap: 6,
            backgroundColor: flashcardCardBackground,
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <Text
            selectable
            style={{ color: flashcardCardLabel, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.3 }}
          >
            FLASHCARDS GENERATED
          </Text>
          <Text selectable style={{ color: theme.colors.text, fontSize: 14, fontWeight: '700' }}>
            {flashcardAttachment.flashcardTitle?.trim() || 'Generated flashcards'}
          </Text>
          <Text selectable style={{ color: flashcardCardHint, fontSize: 12.5, lineHeight: 18, fontWeight: '700' }}>
            Navigate to flashcards
          </Text>
        </Pressable>
      ) : null}

      {message.role === 'assistant' && researchAttachment.hasResearch ? (
        <View style={{ gap: 8 }}>
          {researchAttachment.papers.map((paper, index) => (
            <Pressable
              key={`${paper.url}-${index}`}
              accessibilityRole="button"
              onPress={() => void Linking.openURL(paper.url)}
              style={({ pressed }) => ({
                borderRadius: 16,
                paddingHorizontal: 12,
                paddingVertical: 10,
                backgroundColor: researchCardBackground,
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <Text selectable style={{ color: researchCardLabel, fontSize: 13, lineHeight: 18, fontWeight: '800' }}>
                {paper.title}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function getResearchAttachment(message: RemoteLokiMessage): RemoteLokiResearchAttachment {
  if (!message.retrievalMetadata || typeof message.retrievalMetadata !== 'object' || Array.isArray(message.retrievalMetadata)) {
    return {
      hasResearch: false,
      topic: null,
      papers: [],
    };
  }

  const metadata = message.retrievalMetadata as Record<string, unknown>;
  const research =
    metadata.research && typeof metadata.research === 'object' && !Array.isArray(metadata.research)
      ? (metadata.research as Record<string, unknown>)
      : null;
  const topic = typeof research?.topic === 'string' && research.topic.trim().length > 0 ? research.topic.trim() : null;
  const papers = Array.isArray(research?.papers)
    ? research.papers
        .map(readResearchPaper)
        .filter((paper): paper is RemoteLokiResearchPaper => paper != null)
        .slice(0, 5)
    : [];

  return {
    hasResearch: research?.hasResearch === true && papers.length > 0,
    topic,
    papers,
  };
}

function readResearchPaper(value: unknown): RemoteLokiResearchPaper | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const url = typeof record.url === 'string' ? record.url.trim() : '';
  const source = typeof record.source === 'string' && record.source.trim().length > 0 ? record.source.trim() : null;
  const summary =
    typeof record.summary === 'string' && record.summary.trim().length > 0 ? record.summary.trim() : null;

  if (!title || !url) {
    return null;
  }

  return {
    title,
    url,
    source,
    summary,
  };
}

function getFlashcardAttachment(message: RemoteLokiMessage) {
  if (message.hasFlashcards && message.flashcardSetId) {
    return {
      hasFlashcards: true,
      flashcardSetId: message.flashcardSetId,
      flashcardTitle: message.flashcardTitle,
    };
  }

  if (!message.retrievalMetadata || typeof message.retrievalMetadata !== 'object' || Array.isArray(message.retrievalMetadata)) {
    return {
      hasFlashcards: false,
      flashcardSetId: null,
      flashcardTitle: null,
    };
  }

  const metadata = message.retrievalMetadata as Record<string, unknown>;
  const flashcards =
    metadata.flashcards && typeof metadata.flashcards === 'object' && !Array.isArray(metadata.flashcards)
      ? (metadata.flashcards as Record<string, unknown>)
      : null;
  const flashcardSetId = typeof flashcards?.flashcardSetId === 'string' ? flashcards.flashcardSetId : null;
  const flashcardTitle = typeof flashcards?.flashcardTitle === 'string' ? flashcards.flashcardTitle : null;
  const hasFlashcards = flashcards?.hasFlashcards === true && Boolean(flashcardSetId);

  return {
    hasFlashcards,
    flashcardSetId: hasFlashcards ? flashcardSetId : null,
    flashcardTitle: hasFlashcards ? flashcardTitle : null,
  };
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

function getQuizAttachment(message: RemoteLokiMessage) {
  if (message.hasQuiz && message.quizId) {
    return {
      hasQuiz: true,
      quizId: message.quizId,
      quizTitle: message.quizTitle,
    };
  }

  if (!message.retrievalMetadata || typeof message.retrievalMetadata !== 'object' || Array.isArray(message.retrievalMetadata)) {
    return {
      hasQuiz: false,
      quizId: null,
      quizTitle: null,
    };
  }

  const metadata = message.retrievalMetadata as Record<string, unknown>;
  const quiz =
    metadata.quiz && typeof metadata.quiz === 'object' && !Array.isArray(metadata.quiz)
      ? (metadata.quiz as Record<string, unknown>)
      : null;
  const quizId = typeof quiz?.quizId === 'string' ? quiz.quizId : null;
  const quizTitle = typeof quiz?.quizTitle === 'string' ? quiz.quizTitle : null;
  const hasQuiz = quiz?.hasQuiz === true && Boolean(quizId);

  return {
    hasQuiz,
    quizId: hasQuiz ? quizId : null,
    quizTitle: hasQuiz ? quizTitle : null,
  };
}
