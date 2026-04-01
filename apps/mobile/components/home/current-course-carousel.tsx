import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { NO_CLASS_COURSE_ID, type LocalCourseRecord } from '../../services/courses-repository';

type CurrentCourseCarouselProps = {
  cards: LocalCourseSelectorCard[];
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
  onSelect,
  selectedCourseId,
  width,
}: CurrentCourseCarouselProps) {
  const flatListRef = useRef<FlatList<LocalCourseSelectorCard>>(null);
  const [didMountList, setDidMountList] = useState(false);
  const cardWidth = Math.max(140, Math.min(172, width * 0.94));
  const sideInset = Math.max(0, (width - cardWidth) / 2);
  const infiniteCards = useMemo(() => buildInfiniteCards(cards), [cards]);
  const logicalIndex = Math.max(
    0,
    cards.findIndex((card) => card.id === selectedCourseId)
  );
  const initialIndex = cards.length > 1 ? logicalIndex + 1 : 0;

  useEffect(() => {
    if (!didMountList) {
      return;
    }

    const targetIndex = cards.length > 1 ? logicalIndex + 1 : 0;
    flatListRef.current?.scrollToIndex({ animated: false, index: targetIndex });
  }, [cards.length, didMountList, logicalIndex]);

  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (cards.length === 0) {
      return;
    }

    const offsetX = event.nativeEvent.contentOffset.x;
    const rawIndex = Math.round(offsetX / cardWidth);

    if (rawIndex <= 0) {
      const wrappedIndex = cards.length;
      flatListRef.current?.scrollToIndex({ animated: false, index: wrappedIndex });
      onSelect(cards[cards.length - 1]!.id);
      return;
    }

    if (rawIndex >= cards.length + 1) {
      flatListRef.current?.scrollToIndex({ animated: false, index: 1 });
      onSelect(cards[0]!.id);
      return;
    }

    onSelect(cards[rawIndex - 1]!.id);
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
        backgroundColor: 'rgba(255,255,255,0.7)',
        boxShadow: '0 18px 36px rgba(15, 23, 42, 0.10)',
        overflow : 'hidden',
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
        onMomentumScrollEnd={handleMomentumEnd}
        snapToInterval={cardWidth}
        snapToAlignment="center"
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
              onPress={() => onSelect(item.id)}
              style={({ pressed }) => ({
                minHeight: 112,
                borderRadius: 22,
                borderCurve: 'continuous',
                paddingHorizontal: 12,
                paddingVertical: 10,
                justifyContent: 'center',
                backgroundColor: pressed ? '#f3f4f6' : '#ffffff',
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
                  style={{ color: '#334155', fontSize: 13, lineHeight: 16, fontWeight: '800' }}
                >
                  {item.title}
                </Text>
                <Text
                  selectable
                  numberOfLines={2}
                  style={{ color: '#0f172a', fontSize: 20, lineHeight: 23, fontWeight: '800' }}
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
              backgroundColor: card.id === selectedCourseId ? '#0f172a' : 'rgba(148, 163, 184, 0.45)',
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

  return [cards[cards.length - 1]!, ...cards, cards[0]!];
}
