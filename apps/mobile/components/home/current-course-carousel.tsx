import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useAppTheme } from '../../providers/settings-provider';
import { NO_CLASS_COURSE_ID, type LocalCourseRecord } from '../../services/courses-repository';

type CurrentCourseCarouselProps = {
  cards: LocalCourseSelectorCard[];
  onPressCard: (courseId: string) => void;
  onSelect: (courseId: string) => void;
  selectedCourseId: string;
  width: number;
};

export type LocalCourseSelectorCard = {
  id: string;
  title: string;
  subtitle: string;
  isNoClass?: boolean;
};

export function CurrentCourseCarousel({
  cards,
  onPressCard,
  onSelect,
  selectedCourseId,
  width,
}: CurrentCourseCarouselProps) {
  const theme = useAppTheme();
  const flatListRef = useRef<FlatList<LocalCourseSelectorCard>>(null);
  const [didMountList, setDidMountList] = useState(false);
  const hasMultipleCards = cards.length > 1;
  const cardWidth = Math.max(140, Math.min(172, width * 0.94));
  const sideInset = Math.max(0, (width - cardWidth) / 2);
  const infiniteCards = useMemo(() => buildInfiniteCards(cards), [cards]);
  const logicalIndex = Math.max(
    0,
    cards.findIndex((card) => card.id === selectedCourseId)
  );
  const initialIndex = hasMultipleCards ? logicalIndex + 1 : 0;

  useEffect(() => {
    if (!didMountList || !hasMultipleCards) {
      return;
    }

    const targetIndex = logicalIndex + 1;
    flatListRef.current?.scrollToIndex({ animated: false, index: targetIndex });
  }, [didMountList, hasMultipleCards, logicalIndex]);

  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (cards.length === 0 || !hasMultipleCards) {
      return;
    }

    const offsetX = event.nativeEvent.contentOffset.x;
    const rawIndex = Math.round(offsetX / cardWidth);
    const lastCard = cards[cards.length - 1];
    const firstCard = cards[0];

    if (rawIndex <= 0 && lastCard) {
      const wrappedIndex = cards.length;
      flatListRef.current?.scrollToIndex({ animated: false, index: wrappedIndex });
      onSelect(lastCard.id);
      return;
    }

    if (rawIndex >= cards.length + 1 && firstCard) {
      flatListRef.current?.scrollToIndex({ animated: false, index: 1 });
      onSelect(firstCard.id);
      return;
    }

    const selectedCard = cards[rawIndex - 1];
    if (selectedCard) {
      onSelect(selectedCard.id);
    }
  };

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
          <View
            style={{
              width: cardWidth,
              paddingHorizontal: 4,
            }}
          >
            <Pressable
              onPress={() => onPressCard(item.id)}
              style={({ pressed }) => ({
                minHeight: 112,
                borderRadius: 22,
                borderCurve: 'continuous',
                paddingHorizontal: 12,
                paddingVertical: 10,
                justifyContent: 'center',
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
                  gap: 4,
                }}
              >
                <Text
                  selectable
                  numberOfLines={1}
                  style={{
                    color: theme.colors.textMuted,
                    fontSize: 13,
                    lineHeight: 16,
                    fontWeight: '800',
                  }}
                >
                  {item.title}
                </Text>
                <Text
                  selectable
                  numberOfLines={2}
                  style={{
                    color: theme.colors.text,
                    fontSize: 20,
                    lineHeight: 23,
                    fontWeight: '800',
                  }}
                >
                  {item.subtitle}
                </Text>
              </View>
            </Pressable>
          </View>
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
        {cards.map((card) => (
          <View
            key={card.id}
            style={{
              width: card.id === selectedCourseId ? 16 : 6,
              height: 6,
              borderRadius: 999,
              backgroundColor:
                card.id === selectedCourseId
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

export function buildCourseSelectorCards(courses: LocalCourseRecord[]): LocalCourseSelectorCard[] {
  const remoteCards = courses.map((course) => ({
    id: course.id,
    title: course.courseCode || 'Course',
    subtitle: course.courseName,
  }));

  return [
    ...remoteCards,
    {
      id: NO_CLASS_COURSE_ID,
      title: 'No-Class',
      subtitle: 'No-Class',
      isNoClass: true,
    },
  ];
}

function buildInfiniteCards(cards: LocalCourseSelectorCard[]) {
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
