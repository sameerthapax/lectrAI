import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import LottieView from 'lottie-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import flashcardAnimation from '../../../../assets/animations/flashcard_animation.json';
import flashcardFinalPopAnimation from '../../../../assets/animations/flashcard_final_pop.json';
import nextButtonPressFlashCardSoundFx from '../../../../assets/animations/soundfx/next_button_press_flashCard.mp3';
import poppingAnimationSoundFx from '../../../../assets/animations/soundfx/popping-animation-soundfx.mp3';
import whooshFlashCardSoundFx from '../../../../assets/animations/soundfx/whoosh_flash_card.mp3';
import { NativeBackButton } from '../../../../components/ui/native-back-button';
import { useAppTheme, useSettings } from '../../../../providers/settings-provider';

type MockFlashcard = {
  id: string;
  topic: string;
  prompt: string;
  answer: string;
  cue: string;
};

const MOCK_FLASHCARDS: MockFlashcard[] = [
  {
    id: 'flashcard-1',
    topic: 'Transport Layer',
    prompt: 'What does the transport layer handle in the OSI model?',
    answer: 'It manages end-to-end delivery, segmentation, flow control, and reliability between hosts.',
    cue: 'Think TCP responsibilities.',
  },
  {
    id: 'flashcard-2',
    topic: 'Binary Search',
    prompt: 'What is the time complexity of binary search on a sorted array?',
    answer: 'O(log n), because the search space is cut in half on each comparison.',
    cue: 'Halving the range is the key idea.',
  },
  {
    id: 'flashcard-3',
    topic: 'SQL Aggregation',
    prompt: 'Which clause filters grouped rows after aggregation?',
    answer: 'HAVING filters grouped results after GROUP BY has been applied.',
    cue: 'WHERE is before aggregation, HAVING is after.',
  },
  {
    id: 'flashcard-4',
    topic: 'React State',
    prompt: 'Why does React prefer immutable state updates?',
    answer: 'They make changes easier to detect and reduce bugs from shared mutable data.',
    cue: 'Predictable comparisons help rendering.',
  },
  {
    id: 'flashcard-5',
    topic: 'HTTP Semantics',
    prompt: 'Which status code is commonly returned when a resource is created successfully?',
    answer: '201 Created.',
    cue: 'Creation gets its own success code.',
  },
  {
    id: 'flashcard-6',
    topic: 'Database Design',
    prompt: 'What is the main purpose of normalization?',
    answer: 'To reduce redundancy and prevent update anomalies by structuring related data cleanly.',
    cue: 'Less duplication, cleaner updates.',
  },
];

const CARD_SHIFT = 34;

export default function FlashcardsRoute() {
  const { courseName } = useLocalSearchParams<{
    courseName?: string;
  }>();
  const theme = useAppTheme();
  const settingsState = useSettings();
  const [cardIndex, setCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showCompletionOverlay, setShowCompletionOverlay] = useState(false);
  const flipProgress = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const flipSoundPlayer = useAudioPlayer(whooshFlashCardSoundFx);
  const navSoundPlayer = useAudioPlayer(nextButtonPressFlashCardSoundFx);
  const completionPlayer = useAudioPlayer(poppingAnimationSoundFx);

  const displayCourseName =
    typeof courseName === 'string' && courseName.trim().length > 0 ? courseName : 'Selected course';
  const currentCard = MOCK_FLASHCARDS[cardIndex] ?? MOCK_FLASHCARDS[0];
  const progressLabel = `${cardIndex + 1} / ${MOCK_FLASHCARDS.length}`;
  const isOnLastCard = cardIndex === MOCK_FLASHCARDS.length - 1;

  useEffect(() => {
    void setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    });
  }, []);

  const frontRotation = flipProgress.interpolate({
    inputRange: [0, 180],
    outputRange: ['0deg', '180deg'],
  });
  const backRotation = flipProgress.interpolate({
    inputRange: [0, 180],
    outputRange: ['180deg', '360deg'],
  });

  const playSound = async (player: ReturnType<typeof useAudioPlayer>) => {
    if (!settingsState.settings?.permissions.soundFx) {
      return;
    }

    try {
      await player.seekTo(0);
    } catch {
      // Ignore seek failures and still attempt playback if the player is alive.
    }

    try {
      await player.play();
    } catch {
      // The screen can transition while a sound is requested; ignore stale player errors.
    }
  };

  const flipCard = (nextValue: boolean) => {
    setIsFlipped(nextValue);
    void playSound(flipSoundPlayer);
    Animated.spring(flipProgress, {
      toValue: nextValue ? 180 : 0,
      friction: 8,
      tension: 42,
      useNativeDriver: true,
    }).start();
  };

  const animateToCard = (nextIndex: number, direction: 1 | -1) => {
    if (
      nextIndex < 0 ||
      nextIndex >= MOCK_FLASHCARDS.length ||
      nextIndex === cardIndex ||
      isTransitioning
    ) {
      return;
    }

    setIsTransitioning(true);
    void playSound(navSoundPlayer);

    Animated.parallel([
      Animated.timing(translateX, {
        toValue: -direction * CARD_SHIFT,
        duration: 140,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 120,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.97,
        duration: 140,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setCardIndex(nextIndex);
      setIsFlipped(false);
      flipProgress.setValue(0);
      translateX.setValue(direction * CARD_SHIFT);
      opacity.setValue(0);
      scale.setValue(0.97);

      Animated.parallel([
        Animated.spring(translateX, {
          toValue: 0,
          damping: 16,
          stiffness: 170,
          mass: 0.9,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          damping: 15,
          stiffness: 180,
          mass: 0.9,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setIsTransitioning(false);
      });
    });
  };

  const handleFinish = () => {
    if (showCompletionOverlay || isTransitioning) {
      return;
    }

    void playSound(completionPlayer);
    setShowCompletionOverlay(true);
  };

  const handleRestart = () => {
    setShowCompletionOverlay(false);
    setCardIndex(0);
    setIsFlipped(false);
    setIsTransitioning(false);
    flipProgress.setValue(0);
    translateX.setValue(0);
    opacity.setValue(1);
    scale.setValue(1);
  };

  const cardShadow = useMemo(
    () =>
      theme.resolvedMode === 'dark'
        ? '0 18px 36px rgba(0, 0, 0, 0.34)'
        : '0 18px 36px rgba(15, 23, 42, 0.10)',
    [theme.resolvedMode]
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={{ flex: 1, backgroundColor: theme.colors.screen }}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          style={{ backgroundColor: theme.colors.screen }}
          contentContainerStyle={{
            flexGrow: 1,
            padding: 16,
            paddingBottom: 32,
            gap: 18,
            backgroundColor: theme.colors.screen,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              paddingTop: 4,
            }}
          >
            <NativeBackButton
              theme={theme}
              onPress={() => {
                void playSound(completionPlayer);
                router.back();
              }}
            />

            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                color: theme.colors.text,
                fontSize: 28,
                lineHeight: 32,
                fontWeight: '900',
              }}
            >
              Flashcards
            </Text>
          </View>

          <View
            style={{
              borderRadius: 28,
              borderCurve: 'continuous',
              padding: 20,
              gap: 14,
              backgroundColor: theme.colors.card,
              borderWidth: 1,
              borderColor: theme.colors.border,
              boxShadow: cardShadow,
            }}
          >
            <View
              style={{
                alignSelf: 'flex-start',
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 6,
                backgroundColor: theme.colors.accentSoft,
                borderWidth: 1,
                borderColor: theme.colors.accentBorder,
              }}
            >
              <Text style={{ color: theme.colors.accentMuted, fontSize: 12, fontWeight: '800' }}>
                Mock study set
              </Text>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ color: theme.colors.text, fontSize: 28, lineHeight: 34, fontWeight: '900' }}>
                {displayCourseName}
              </Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 }}>
                Interactive flashcards with tap-to-flip answers and animated carousel transitions.
              </Text>
            </View>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <View
                style={{
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  backgroundColor: theme.colors.pill,
                }}
              >
                <Text style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '800' }}>
                  Topic: {currentCard.topic}
                </Text>
              </View>

              <Text style={{ color: theme.colors.textSubtle, fontSize: 13, fontWeight: '700' }}>
                {progressLabel}
              </Text>
            </View>
          </View>

          <View style={{ flex: 1, gap: 16, justifyContent: 'center' }}>
            <Animated.View
              style={{
                transform: [{ translateX }, { scale }],
                opacity,
              }}
            >
              <Pressable
                onPress={() => {
                  if (isTransitioning) {
                    return;
                  }
                  flipCard(!isFlipped);
                }}
                style={({ pressed }) => ({
                  minHeight: 430,
                  borderRadius: 32,
                  borderCurve: 'continuous',
                  backgroundColor: theme.colors.card,
                  borderWidth: 1,
                  borderColor: pressed ? theme.colors.accentBorder : theme.colors.border,
                  boxShadow: cardShadow,
                  transform: [{ scale: pressed ? 0.992 : 1 }],
                })}
              >
                <View style={{ flex: 1, padding: 18 }}>
                  <Animated.View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: 18,
                      right: 18,
                      left: 18,
                      bottom: 18,
                      borderRadius: 28,
                      borderCurve: 'continuous',
                      backfaceVisibility: 'hidden',
                      backgroundColor: theme.colors.card,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      padding: 24,
                      justifyContent: 'space-between',
                      transform: [{ perspective: 1400 }, { rotateY: frontRotation }],
                    }}
                  >
                    <View style={{ gap: 12 }}>
                      <Text style={{ color: theme.colors.textSubtle, fontSize: 12, fontWeight: '800' }}>
                        FRONT
                      </Text>
                      <Text style={{ color: theme.colors.text, fontSize: 30, lineHeight: 38, fontWeight: '900' }}>
                        {currentCard.prompt}
                      </Text>
                    </View>

                    <View
                      style={{
                        borderRadius: 22,
                        borderCurve: 'continuous',
                        padding: 16,
                        gap: 6,
                        backgroundColor: theme.colors.cardMuted,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                      }}
                    >
                      <Text style={{ color: theme.colors.textMuted, fontSize: 13, fontWeight: '800' }}>
                        Cue
                      </Text>
                      <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 22 }}>
                        {currentCard.cue}
                      </Text>
                    </View>
                  </Animated.View>

                  <Animated.View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: 18,
                      right: 18,
                      left: 18,
                      bottom: 18,
                      borderRadius: 28,
                      borderCurve: 'continuous',
                      backfaceVisibility: 'hidden',
                      backgroundColor: theme.colors.accentSoft,
                      borderWidth: 1,
                      borderColor: theme.colors.accentBorder,
                      padding: 24,
                      justifyContent: 'space-between',
                      transform: [{ perspective: 1400 }, { rotateY: backRotation }],
                    }}
                  >
                    <View style={{ gap: 12 }}>
                      <Text style={{ color: theme.colors.accentMuted, fontSize: 12, fontWeight: '800' }}>
                        BACK
                      </Text>
                      <Text style={{ color: theme.colors.text, fontSize: 28, lineHeight: 36, fontWeight: '900' }}>
                        {currentCard.answer}
                      </Text>
                    </View>

                    <View
                      style={{
                        borderRadius: 22,
                        borderCurve: 'continuous',
                        padding: 16,
                        gap: 6,
                        backgroundColor: theme.colors.card,
                        borderWidth: 1,
                        borderColor: theme.colors.accentBorder,
                      }}
                    >
                      <Text style={{ color: theme.colors.textMuted, fontSize: 13, fontWeight: '800' }}>
                        Topic
                      </Text>
                      <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 22 }}>
                        {currentCard.topic}
                      </Text>
                    </View>
                  </Animated.View>
                </View>
              </Pressable>
            </Animated.View>

            <View
              style={{
                borderRadius: 24,
                borderCurve: 'continuous',
                padding: 18,
                gap: 16,
                backgroundColor: theme.colors.card,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text style={{ color: theme.colors.textMuted, fontSize: 14, textAlign: 'center' }}>
                Tap the card to flip between prompt and answer.
              </Text>

              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
                {MOCK_FLASHCARDS.map((card, index) => {
                  const selected = index === cardIndex;

                  return (
                    <Pressable
                      key={card.id}
                      onPress={() => animateToCard(index, index > cardIndex ? 1 : -1)}
                      style={{
                        height: 10,
                        width: selected ? 28 : 10,
                        borderRadius: 999,
                        backgroundColor: selected ? theme.colors.accent : theme.colors.border,
                      }}
                    />
                  );
                })}
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <NavButton
                  label="Previous"
                  disabled={cardIndex === 0 || isTransitioning}
                  onPress={() => animateToCard(cardIndex - 1, -1)}
                  theme={theme}
                  variant="secondary"
                />
                <NavButton
                  label={isOnLastCard ? 'Done' : 'Next'}
                  disabled={isTransitioning}
                  onPress={() => {
                    if (isOnLastCard) {
                      handleFinish();
                      return;
                    }

                    animateToCard(cardIndex + 1, 1);
                  }}
                  theme={theme}
                  variant="primary"
                />
              </View>
            </View>
          </View>
        </ScrollView>

        {showCompletionOverlay ? (
          <View
            style={[
              StyleSheet.absoluteFillObject,
              {
                backgroundColor: theme.colors.modalBackdrop,
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
              },
            ]}
          >
            <View
              style={{
                width: '100%',
                maxWidth: 420,
                borderRadius: 32,
                borderCurve: 'continuous',
                padding: 22,
                gap: 16,
                alignItems: 'center',
                backgroundColor: theme.colors.card,
                borderWidth: 1,
                borderColor: theme.colors.border,
                boxShadow: cardShadow,
              }}
            >
              <View
                style={{
                  width: '100%',
                  height: 200,
                  borderRadius: 28,
                  borderCurve: 'continuous',
                  overflow: 'hidden',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.cardMuted,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <LottieView
                  autoPlay
                  loop
                  source={flashcardAnimation}
                  style={{ width: 220, height: 220 }}
                />

                <LottieView
                  autoPlay
                  loop={false}
                  source={flashcardFinalPopAnimation}
                  style={{
                    position: 'absolute',
                    width: '124%',
                    height: '124%',
                  }}
                />
              </View>

              <View
                style={{
                  alignSelf: 'stretch',
                  borderRadius: 20,
                  borderCurve: 'continuous',
                  padding: 16,
                  gap: 8,
                  backgroundColor: theme.colors.accentSoft,
                  borderWidth: 1,
                  borderColor: theme.colors.accentBorder,
                }}
              >
                <Text style={{ color: theme.colors.accentMuted, fontSize: 12, fontWeight: '800' }}>
                  Study set finished
                </Text>
                <Text style={{ color: theme.colors.text, fontSize: 16, lineHeight: 22, fontWeight: '700' }}>
                  {MOCK_FLASHCARDS.length} cards reviewed in this mock deck.
                </Text>
              </View>

              <View style={{ gap: 8, alignItems: 'center' }}>
                <Text style={{ color: theme.colors.text, fontSize: 28, lineHeight: 32, fontWeight: '900' }}>
                  Flashcards complete
                </Text>
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontSize: 15,
                    lineHeight: 22,
                    textAlign: 'center',
                  }}
                >
                  You finished the mock flashcard set for {displayCourseName}.
                </Text>
              </View>

              <View style={{ width: '100%', gap: 12 }}>
                <NavButton
                  label="Study again"
                  disabled={false}
                  onPress={handleRestart}
                  theme={theme}
                  variant="primary"
                />
                <NavButton
                  label="Back to course"
                  disabled={false}
                  onPress={() => {
                    void playSound(completionPlayer);
                    router.back();
                  }}
                  theme={theme}
                  variant="secondary"
                />
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </>
  );
}

function NavButton({
  disabled,
  label,
  onPress,
  theme,
  variant,
}: {
  disabled: boolean;
  label: string;
  onPress: () => void;
  theme: ReturnType<typeof useAppTheme>;
  variant: 'primary' | 'secondary';
}) {
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 54,
        borderRadius: 18,
        borderCurve: 'continuous',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: disabled
          ? theme.colors.pill
          : isPrimary
            ? pressed
              ? theme.colors.accentMuted
              : theme.colors.accent
            : pressed
              ? theme.colors.cardMuted
              : theme.colors.card,
        borderWidth: 1,
        borderColor: disabled
          ? theme.colors.border
          : isPrimary
            ? theme.colors.accent
            : theme.colors.border,
      })}
    >
      <Text
        style={{
          color: disabled
            ? theme.colors.textSubtle
            : isPrimary
              ? theme.colors.accentContrast
              : theme.colors.text,
          fontSize: 15,
          fontWeight: '900',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
