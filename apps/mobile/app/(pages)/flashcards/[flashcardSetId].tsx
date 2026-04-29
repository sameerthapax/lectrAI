import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import LottieView from 'lottie-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import flashcardAnimation from '../../../assets/animations/flashcard_animation.json';
import flashcardFinalPopAnimation from '../../../assets/animations/flashcard_final_pop.json';
import nextButtonPressFlashCardSoundFx from '../../../assets/animations/soundfx/next_button_press_flashCard.mp3';
import poppingAnimationSoundFx from '../../../assets/animations/soundfx/popping-animation-soundfx.mp3';
import whooshFlashCardSoundFx from '../../../assets/animations/soundfx/whoosh_flash_card.mp3';
import { getResponsiveStudyLayout } from '../../../components/study/responsive-study-layout';
import { useAuth } from '../../../providers/auth-provider';
import { useAppTheme, useSettings } from '../../../providers/settings-provider';
import {
  fetchFlashcardSetById,
  type RemoteStoredFlashcardSetRecord,
} from '../../../services/flashcards-api';
import {
  getCachedFlashcardSet,
  upsertFlashcardSet,
  type LocalFlashcardSetRecord,
} from '../../../services/flashcards-repository';
import { triggerCompletionHaptic } from '../../../services/haptics';

const CARD_SHIFT = 34;
type ScreenFlashcardSet = RemoteStoredFlashcardSetRecord | LocalFlashcardSetRecord;

export default function FlashcardSetDetailRoute() {
  const { flashcardSetId } = useLocalSearchParams<{ flashcardSetId?: string }>();
  const router = useRouter();
  const theme = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  const settingsState = useSettings();
  const auth = useAuth();
  const [flashcardSet, setFlashcardSet] = useState<ScreenFlashcardSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
    let cancelled = false;

    const loadFlashcardSet = async () => {
      if (auth.status !== 'authenticated') {
        setLoading(false);
        setErrorMessage('Sign in again to open these flashcards.');
        return;
      }

      if (!flashcardSetId || typeof flashcardSetId !== 'string') {
        setLoading(false);
        setErrorMessage('Flashcard set id is missing.');
        return;
      }

      const cachedBundle = await getCachedFlashcardSet(flashcardSetId);

      if (!cancelled && cachedBundle?.flashcardSet) {
        setFlashcardSet(cachedBundle.flashcardSet);
        setLoading(false);
      }

      try {
        if (!cachedBundle) {
          setLoading(true);
        }
        setErrorMessage(null);
        const accessToken = await auth.getValidAccessToken();

        if (!accessToken) {
          throw new Error('Your session expired. Please sign in again.');
        }

        const bundle = await fetchFlashcardSetById(accessToken, flashcardSetId);
        await upsertFlashcardSet(bundle);

        if (cancelled) {
          return;
        }

        setFlashcardSet(bundle.flashcardSet);
        setCardIndex(0);
        setIsFlipped(false);
        setIsTransitioning(false);
        setShowCompletionOverlay(false);
        flipProgress.setValue(0);
        translateX.setValue(0);
        opacity.setValue(1);
        scale.setValue(1);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Could not load this flashcard set.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadFlashcardSet();

    return () => {
      cancelled = true;
    };
  }, [auth, flashcardSetId, flipProgress, opacity, scale, translateX]);

  const cards = flashcardSet?.cards ?? [];
  const currentCard = cards[cardIndex] ?? null;
  const displayTitle = flashcardSet?.title?.trim() || 'Generated flashcards';
  const displayDescription =
    flashcardSet?.description?.trim() || 'Interactive flashcards with tap-to-flip answers and animated carousel transitions.';
  const currentSupportingText = currentCard?.explanation?.trim() || null;
  const currentSourceExcerpt = currentCard?.sourceExcerpt?.trim() || null;
  const progressLabel = cards.length > 0 ? `${cardIndex + 1} / ${cards.length}` : '0 / 0';
  const isOnLastCard = cards.length > 0 && cardIndex === cards.length - 1;
  const summaryTitleLayout = getResponsiveStudyLayout(displayTitle, {
    screenWidth,
    baseFontSize: 28,
    minFontSize: 22,
    baseLineHeight: 34,
    minLineHeight: 28,
    shrinkStartWords: 5,
    shrinkWordsPerStep: 2,
  });
  const summaryTopicLayout = getResponsiveStudyLayout(currentCard?.sourceTitle?.trim() || 'Study concept', {
    screenWidth,
    baseFontSize: 12,
    minFontSize: 11,
    baseLineHeight: 16,
    minLineHeight: 14,
    shrinkStartWords: 4,
    shrinkWordsPerStep: 3,
    baseMinHeight: 36,
    expandStartWords: 8,
    expandWordsPerStep: 4,
    expandHeightStep: 8,
    maxExtraHeight: 24,
  });
  const frontLayout = getResponsiveStudyLayout(currentCard?.frontText, {
    screenWidth,
    baseFontSize: 30,
    minFontSize: 21,
    baseLineHeight: 38,
    minLineHeight: 28,
    shrinkStartWords: 12,
    shrinkWordsPerStep: 4,
    baseMinHeight: 430,
    expandStartWords: 28,
    expandWordsPerStep: 8,
    expandHeightStep: 34,
    maxExtraHeight: 204,
  });
  const backLayout = getResponsiveStudyLayout(currentCard?.backText, {
    screenWidth,
    baseFontSize: 28,
    minFontSize: 18,
    baseLineHeight: 36,
    minLineHeight: 25,
    shrinkStartWords: 12,
    shrinkWordsPerStep: 4,
    baseMinHeight: 430,
    expandStartWords: 26,
    expandWordsPerStep: 8,
    expandHeightStep: 42,
    maxExtraHeight: 252,
  });
  const cueLayout = getResponsiveStudyLayout(
    currentCard?.hintText?.trim() || currentCard?.explanation?.trim() || 'Tap to reveal the answer.',
    {
      screenWidth,
      baseFontSize: 15,
      minFontSize: 13,
      baseLineHeight: 22,
      minLineHeight: 19,
      shrinkStartWords: 14,
      shrinkWordsPerStep: 8,
      baseMinHeight: 72,
      expandStartWords: 22,
      expandWordsPerStep: 10,
      expandHeightStep: 16,
      maxExtraHeight: 56,
    }
  );
  const backTopicLayout = getResponsiveStudyLayout(currentCard?.sourceTitle?.trim() || displayTitle, {
    screenWidth,
    baseFontSize: 12,
    minFontSize: 10,
    baseLineHeight: 16,
    minLineHeight: 13,
    shrinkStartWords: 4,
    shrinkWordsPerStep: 2,
  });
  const backTopicBadgeHeight = 44;
  const backFaceBottomInset = backTopicBadgeHeight + 18;
  const flashcardMinHeight = Math.max(frontLayout.minHeight ?? 430, backLayout.minHeight ?? 430);
  const [measuredFrontFaceHeight, setMeasuredFrontFaceHeight] = useState(0);
  const [measuredBackFaceHeight, setMeasuredBackFaceHeight] = useState(0);
  const flashcardHeight = Math.max(flashcardMinHeight, measuredFrontFaceHeight, measuredBackFaceHeight);

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
      // Ignore stale audio errors during screen transitions.
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
    if (nextIndex < 0 || nextIndex >= cards.length || nextIndex === cardIndex || isTransitioning) {
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

    triggerCompletionHaptic();
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
          {loading ? (
            <StateCard theme={theme} message="Loading flashcards..." />
          ) : errorMessage ? (
            <StateCard theme={theme} message={errorMessage} tone="error" />
          ) : !flashcardSet || !currentCard ? (
            <StateCard theme={theme} message="This flashcard set is empty." />
          ) : (
            <>
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
                    Loki study set
                  </Text>
                </View>

                <View style={{ gap: 6 }}>
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontSize: summaryTitleLayout.fontSize,
                      lineHeight: summaryTitleLayout.lineHeight,
                      fontWeight: '900',
                    }}
                  >
                    {displayTitle}
                  </Text>
                  <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 }}>
                    {displayDescription}
                  </Text>
                </View>

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      flex: 1,
                      borderRadius: 999,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      backgroundColor: theme.colors.pill,
                      minHeight: summaryTopicLayout.minHeight,
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        color: theme.colors.textMuted,
                        fontSize: summaryTopicLayout.fontSize,
                        lineHeight: summaryTopicLayout.lineHeight,
                        fontWeight: '800',
                      }}
                    >
                      Topic: {currentCard.sourceTitle?.trim() || 'Study concept'}
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
                    position: 'relative',
                  }}
                >
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      opacity: 0,
                      zIndex: -1,
                    }}
                  >
                    <View
                      onLayout={(event) => {
                        const nextHeight = Math.ceil(event.nativeEvent.layout.height + 36);
                        setMeasuredFrontFaceHeight((currentHeight) =>
                          Math.abs(currentHeight - nextHeight) < 1 ? currentHeight : nextHeight
                        );
                      }}
                      style={{
                        margin: 18,
                        borderRadius: 28,
                        borderCurve: 'continuous',
                        padding: 24,
                        gap: 24,
                      }}
                    >
                      <View style={{ gap: 12 }}>
                        <Text style={{ color: theme.colors.textSubtle, fontSize: 12, fontWeight: '800' }}>FRONT</Text>
                        <Text
                          style={{
                            color: theme.colors.text,
                            fontSize: frontLayout.fontSize,
                            lineHeight: frontLayout.lineHeight,
                            fontWeight: '900',
                          }}
                        >
                          {currentCard.frontText}
                        </Text>
                      </View>

                      <View
                        style={{
                          borderRadius: 22,
                          borderCurve: 'continuous',
                          padding: 16,
                          gap: 6,
                          minHeight: cueLayout.minHeight,
                        }}
                      >
                        <Text style={{ color: theme.colors.textMuted, fontSize: 13, fontWeight: '800' }}>Cue</Text>
                        <Text
                          style={{
                            color: theme.colors.text,
                            fontSize: cueLayout.fontSize,
                            lineHeight: cueLayout.lineHeight,
                          }}
                        >
                          {currentCard.hintText?.trim() || currentCard.explanation?.trim() || 'Tap to reveal the answer.'}
                        </Text>
                      </View>
                    </View>

                    <View
                      onLayout={(event) => {
                        const nextHeight = Math.ceil(event.nativeEvent.layout.height + 36);
                        setMeasuredBackFaceHeight((currentHeight) =>
                          Math.abs(currentHeight - nextHeight) < 1 ? currentHeight : nextHeight
                        );
                      }}
                      style={{
                        margin: 18,
                        borderRadius: 28,
                        borderCurve: 'continuous',
                        padding: 24,
                        gap: 18,
                      }}
                    >
                      <View style={{ gap: 12 }}>
                        <Text style={{ color: theme.colors.accentMuted, fontSize: 12, fontWeight: '800' }}>BACK</Text>
                        <Text
                          style={{
                            color: theme.colors.text,
                            fontSize: backLayout.fontSize,
                            lineHeight: backLayout.lineHeight,
                            fontWeight: '900',
                          }}
                        >
                          {currentCard.backText}
                        </Text>
                      </View>

                      <View
                        style={{
                          alignSelf: 'flex-start',
                          maxWidth: '72%',
                          minHeight: backTopicBadgeHeight,
                          borderRadius: 999,
                          borderCurve: 'continuous',
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          justifyContent: 'center',
                        }}
                      >
                        <Text
                          style={{
                            color: theme.colors.text,
                            fontSize: backTopicLayout.fontSize,
                            lineHeight: backTopicLayout.lineHeight,
                            fontWeight: '700',
                          }}
                        >
                          Topic: {currentCard.sourceTitle?.trim() || displayTitle}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <Pressable
                    onPress={() => {
                      if (isTransitioning) {
                        return;
                      }
                      flipCard(!isFlipped);
                    }}
                    style={({ pressed }) => ({
                      height: flashcardHeight,
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
                          <Text
                            style={{
                              color: theme.colors.text,
                              fontSize: frontLayout.fontSize,
                              lineHeight: frontLayout.lineHeight,
                              fontWeight: '900',
                            }}
                          >
                            {currentCard.frontText}
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
                            minHeight: cueLayout.minHeight,
                          }}
                        >
                          <Text style={{ color: theme.colors.textMuted, fontSize: 13, fontWeight: '800' }}>
                            Cue
                          </Text>
                          <Text
                            style={{
                              color: theme.colors.text,
                              fontSize: cueLayout.fontSize,
                              lineHeight: cueLayout.lineHeight,
                            }}
                          >
                            {currentCard.hintText?.trim() || currentCard.explanation?.trim() || 'Tap to reveal the answer.'}
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
                          transform: [{ perspective: 1400 }, { rotateY: backRotation }],
                        }}
                      >
                        <View style={{ gap: 12 }}>
                          <Text style={{ color: theme.colors.accentMuted, fontSize: 12, fontWeight: '800' }}>
                            BACK
                          </Text>
                          <Text
                            style={{
                              color: theme.colors.text,
                              fontSize: backLayout.fontSize,
                              lineHeight: backLayout.lineHeight,
                              fontWeight: '900',
                              paddingBottom: backFaceBottomInset,
                            }}
                          >
                            {currentCard.backText}
                          </Text>
                        </View>

                        <View
                        style={{
                          position: 'absolute',
                          left: 20,
                          bottom: 20,
                          maxWidth: '72%',
                          minHeight: backTopicBadgeHeight,
                          borderRadius: 999,
                          borderCurve: 'continuous',
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          backgroundColor: theme.colors.card,
                          borderWidth: 1,
                          borderColor: theme.colors.accentBorder,
                          justifyContent: 'center',
                        }}
                      >
                        <Text
                          style={{
                            color: theme.colors.text,
                            fontSize: backTopicLayout.fontSize,
                              lineHeight: backTopicLayout.lineHeight,
                              fontWeight: '700',
                            }}
                          >
                            Topic: {currentCard.sourceTitle?.trim() || displayTitle}
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
                    {cards.map((card, index) => {
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

                {currentSupportingText || currentSourceExcerpt ? (
                  <View
                    style={{
                      borderRadius: 24,
                      borderCurve: 'continuous',
                      padding: 18,
                      gap: 14,
                      backgroundColor: theme.colors.card,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                    }}
                  >
                    {currentSupportingText ? (
                      <View style={{ gap: 6 }}>
                        <Text style={{ color: theme.colors.textSubtle, fontSize: 12, fontWeight: '800' }}>
                          EXTRA CONTEXT
                        </Text>
                        <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 22 }}>
                          {currentSupportingText}
                        </Text>
                      </View>
                    ) : null}

                    {currentSourceExcerpt ? (
                      <View
                        style={{
                          borderRadius: 18,
                          borderCurve: 'continuous',
                          padding: 14,
                          gap: 6,
                          backgroundColor: theme.colors.cardMuted,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                        }}
                      >
                        <Text style={{ color: theme.colors.textSubtle, fontSize: 12, fontWeight: '800' }}>
                          SOURCE CONTEXT
                        </Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 21 }}>
                          {currentSourceExcerpt}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </>
          )}
        </ScrollView>

        {showCompletionOverlay && flashcardSet ? (
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
                <LottieView autoPlay loop source={flashcardAnimation} style={{ width: 220, height: 220 }} />
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
                  {cards.length} cards reviewed in this study deck.
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
                  You finished the flashcard set for {displayTitle}.
                </Text>
              </View>

              <View style={{ width: '100%', gap: 12 }}>
                <NavButton label="Study again" disabled={false} onPress={handleRestart} theme={theme} variant="primary" />
                <NavButton
                  label="Back"
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

function StateCard({
  theme,
  message,
  tone = 'default',
}: {
  theme: ReturnType<typeof useAppTheme>;
  message: string;
  tone?: 'default' | 'error';
}) {
  return (
    <View
      style={{
        borderRadius: 24,
        borderCurve: 'continuous',
        padding: 20,
        backgroundColor: theme.colors.card,
        borderWidth: 1,
        borderColor: tone === 'error' ? theme.colors.danger : theme.colors.border,
      }}
    >
      <Text
        style={{
          color: tone === 'error' ? theme.colors.danger : theme.colors.textMuted,
          fontSize: 15,
          lineHeight: 22,
          textAlign: 'center',
          fontWeight: '700',
        }}
      >
        {message}
      </Text>
    </View>
  );
}
