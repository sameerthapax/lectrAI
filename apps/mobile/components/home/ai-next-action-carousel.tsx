import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIsFocused } from 'expo-router';
import {
  FlatList,
  Pressable,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import LottieView, { type AnimationObject } from 'lottie-react-native';
import breathingSessionAnimation from '../../assets/animations/Meditation.json';
import examReviewAnimation from '../../assets/animations/exam-review.json';
import quickQuizAnimation from '../../assets/animations/quick-quiz.json';
import relaxAnimation from '../../assets/animations/relax.json';
import { useAppTheme } from '../../providers/settings-provider';

type AiNextActionCarouselProps = {
  hasIncompleteQuickQuiz?: boolean;
  width: number;
};

type AiNextActionCard = {
  id: string;
  title: string;
  subtitle: string;
  animation: AnimationObject;
};

const AI_NEXT_ACTION_CARDS: AiNextActionCard[] = [
  {
    id: 'exam-review',
    title: 'AI Next',
    subtitle: 'Review',
    animation: examReviewAnimation,
  },
  {
    id: 'quick-quiz',
    title: 'AI Next',
    subtitle: 'Quiz',
    animation: quickQuizAnimation,
  },
  {
    id: 'breathing-session',
    title: 'AI Next',
    subtitle: 'Breath',
    animation: breathingSessionAnimation,
  },
  {
    id: 'relax',
    title: 'AI Next',
    subtitle: 'Relax',
    animation: relaxAnimation,
  },
];

const QUICK_QUIZ_CARD_ID = 'quick-quiz';
const NON_QUIZ_CARD_IDS = AI_NEXT_ACTION_CARDS
  .filter((card) => card.id !== QUICK_QUIZ_CARD_ID)
  .map((card) => card.id);

export function AiNextActionCarousel({
  hasIncompleteQuickQuiz = false,
  width,
}: AiNextActionCarouselProps) {
  const theme = useAppTheme();
  const isFocused = useIsFocused();
  const flatListRef = useRef<FlatList<AiNextActionCard>>(null);
  const [didMountList, setDidMountList] = useState(false);
  const [randomNonQuizActionId] = useState(() => pickRandomNonQuizActionId());
  const [selectedActionId, setSelectedActionId] = useState(() =>
    hasIncompleteQuickQuiz ? QUICK_QUIZ_CARD_ID : randomNonQuizActionId
  );
  const hasMultipleCards = AI_NEXT_ACTION_CARDS.length > 1;
  const cardWidth = Math.max(140, Math.min(172, width * 0.94));
  const sideInset = Math.max(0, (width - cardWidth) / 2);
  const infiniteCards = useMemo(
    () => buildInfiniteCards(AI_NEXT_ACTION_CARDS),
    []
  );
  const logicalIndex = Math.max(
    0,
    AI_NEXT_ACTION_CARDS.findIndex((card) => card.id === selectedActionId)
  );
  const initialIndex = hasMultipleCards ? logicalIndex + 1 : 0;

  useEffect(() => {
    setSelectedActionId(hasIncompleteQuickQuiz ? QUICK_QUIZ_CARD_ID : randomNonQuizActionId);
  }, [hasIncompleteQuickQuiz, randomNonQuizActionId]);

  useEffect(() => {
    if (!didMountList || !hasMultipleCards) {
      return;
    }

    flatListRef.current?.scrollToIndex({ animated: false, index: logicalIndex + 1 });
  }, [didMountList, hasMultipleCards, logicalIndex]);

  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!hasMultipleCards) {
      return;
    }

    const offsetX = event.nativeEvent.contentOffset.x;
    const rawIndex = Math.round(offsetX / cardWidth);
    const lastCard = AI_NEXT_ACTION_CARDS[AI_NEXT_ACTION_CARDS.length - 1];
    const firstCard = AI_NEXT_ACTION_CARDS[0];

    if (rawIndex <= 0 && lastCard) {
      flatListRef.current?.scrollToIndex({
        animated: false,
        index: AI_NEXT_ACTION_CARDS.length,
      });
      setSelectedActionId(lastCard.id);
      return;
    }

    if (rawIndex >= AI_NEXT_ACTION_CARDS.length + 1 && firstCard) {
      flatListRef.current?.scrollToIndex({ animated: false, index: 1 });
      setSelectedActionId(firstCard.id);
      return;
    }

    const selectedCard = AI_NEXT_ACTION_CARDS[rawIndex - 1];
    if (selectedCard) {
      setSelectedActionId(selectedCard.id);
    }
  };

  const handlePressCard = useCallback((cardId: string) => {
    setSelectedActionId(cardId);
    const nextIndex = AI_NEXT_ACTION_CARDS.findIndex((card) => card.id === cardId);

    if (nextIndex >= 0) {
      flatListRef.current?.scrollToIndex({
        animated: true,
        index: hasMultipleCards ? nextIndex + 1 : nextIndex,
      });
    }
  }, [hasMultipleCards]);

  return (
    <View
      style={{
        borderRadius: 28,
        borderCurve: 'continuous',
        maxWidth: 156,
        minHeight: 154,
        paddingTop: 10,
        paddingBottom: 10,
        backgroundColor: theme.colors.overlay,
        borderWidth: 1,
        borderColor: theme.colors.border,
        boxShadow: '0 18px 36px rgba(15, 23, 42, 0.10)',
        overflow: 'hidden',
      }}
    >
      <FlatList
        ref={flatListRef}
        data={infiniteCards}
        getItemLayout={(_, index) => ({
          index,
          length: cardWidth,
          offset: cardWidth * index,
        })}
        horizontal
        initialScrollIndex={initialIndex}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        onLayout={() => setDidMountList(true)}
        onMomentumScrollEnd={hasMultipleCards ? handleMomentumEnd : undefined}
        snapToInterval={cardWidth}
        snapToAlignment="center"
        scrollEnabled={hasMultipleCards}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: sideInset }}
        renderItem={({ item }) => (
          <AiNextActionCarouselCard
            card={item}
            cardWidth={cardWidth}
            isActive={item.id === selectedActionId}
            isFocused={isFocused}
            onPress={handlePressCard}
          />
        )}
        showsHorizontalScrollIndicator={false}
        style={{ overflow: 'visible' }}
      />

      <View
        style={{
          marginTop: 8,
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        {AI_NEXT_ACTION_CARDS.map((card) => (
          <View
            key={card.id}
            style={{
              width: card.id === selectedActionId ? 16 : 6,
              height: 6,
              borderRadius: 999,
              backgroundColor:
                card.id === selectedActionId
                  ? theme.colors.text
                  : theme.resolvedMode === 'dark'
                    ? 'rgba(183, 176, 167, 0.35)'
                    : 'rgba(148, 163, 184, 0.45)',
            }}
          />
        ))}
      </View>
    </View>
  );
}

type AiNextActionCarouselCardProps = {
  card: AiNextActionCard;
  cardWidth: number;
  isActive: boolean;
  isFocused: boolean;
  onPress: (cardId: string) => void;
};

function AiNextActionCarouselCard({
  card,
  cardWidth,
  isActive,
  isFocused,
  onPress,
}: AiNextActionCarouselCardProps) {
  const theme = useAppTheme();
  const animationRef = useRef<LottieView>(null);

  useEffect(() => {
    if (isActive && isFocused) {
      animationRef.current?.reset();
      animationRef.current?.play();
      return;
    }

    animationRef.current?.reset();
  }, [isActive, isFocused]);

  return (
    <View
      style={{
        width: cardWidth,
        paddingHorizontal: 4,
      }}
    >
      <Pressable
        onPress={() => onPress(card.id)}
        style={({ pressed }) => ({
          minHeight: 80,
            maxHeight: 90,
          borderRadius: 22,
          borderCurve: 'continuous',
          paddingHorizontal: 12,
          paddingVertical: 10,
          justifyContent: 'space-between',
          backgroundColor: pressed ? theme.colors.neutralSoft : theme.colors.card,
          borderWidth: 1,
          borderColor: theme.colors.border,
          boxShadow: pressed
            ? '0 8px 18px rgba(15, 23, 42, 0.08)'
            : '0 12px 22px rgba(15, 23, 42, 0.10)',
        })}
      >
        <View
          style={{
            minHeight: 68,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LottieView
            ref={animationRef}
            autoPlay={false}
            loop={false}
            source={card.animation}
            style={{ width: 70, height: 90 }}
          />
        </View>

        <View style={{ gap: 5 }}>
          <Text
            selectable
            numberOfLines={1}
            style={{
              color: theme.colors.textMuted,
              fontSize: 8,
              lineHeight: 10,
              fontWeight: '600',
            }}
          >
            {card.title}
          </Text>
          <Text
            selectable
            numberOfLines={2}
            style={{
              color: theme.colors.text,
              fontSize: 16,
              lineHeight: 15,
              fontWeight: '800',
            }}
          >
            {card.subtitle}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

function buildInfiniteCards(cards: AiNextActionCard[]) {
  if (cards.length <= 1) {
    return cards;
  }

  const firstCard = cards[0];
  const lastCard = cards[cards.length - 1];

  if (!firstCard || !lastCard) {
    return cards;
  }

  return [lastCard, ...cards, firstCard];
}

function pickRandomNonQuizActionId() {
  if (NON_QUIZ_CARD_IDS.length === 0) {
    return AI_NEXT_ACTION_CARDS[0]?.id ?? '';
  }

  const randomIndex = Math.floor(Math.random() * NON_QUIZ_CARD_IDS.length);
  return NON_QUIZ_CARD_IDS[randomIndex] ?? NON_QUIZ_CARD_IDS[0];
}
