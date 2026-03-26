import { ScrollView, Text, View } from 'react-native';

const courseCards = [
  {
    code: 'CSC 499',
    name: 'Senior Capstone',
    accent: '#0f766e',
    detail: '2 lectures ready for review',
  },
  {
    code: 'CSC 430',
    name: 'Artificial Intelligence',
    accent: '#c2410c',
    detail: '1 new summary generated',
  },
  {
    code: 'MAT 345',
    name: 'Discrete Structures II',
    accent: '#1d4ed8',
    detail: 'Quiz practice available',
  },
];

export default function CoursesRoute() {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        padding: 16,
        gap: 14,
      }}
    >
      <View
        style={{
          borderRadius: 24,
          borderCurve: 'continuous',
          padding: 18,
          gap: 8,
          backgroundColor: '#102542',
          boxShadow: '0 16px 36px rgba(16, 37, 66, 0.18)',
        }}
      >
        <Text selectable style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13, fontWeight: '700' }}>
          Courses
        </Text>
        <Text selectable style={{ color: '#ffffff', fontSize: 28, fontWeight: '800' }}>
          Study by class, not by chaos.
        </Text>
        <Text selectable style={{ color: 'rgba(255,255,255,0.78)', fontSize: 15, lineHeight: 22 }}>
          Organize lectures, summaries, quizzes, and flashcards under each course so review stays
          focused before exams.
        </Text>
      </View>

      {courseCards.map((course) => (
        <View
          key={course.code}
          style={{
            borderRadius: 18,
            borderCurve: 'continuous',
            padding: 16,
            gap: 8,
            backgroundColor: '#ffffff',
            boxShadow: '0 4px 14px rgba(15, 23, 42, 0.08)',
          }}
        >
          <View
            style={{
              alignSelf: 'flex-start',
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 6,
              backgroundColor: `${course.accent}18`,
            }}
          >
            <Text selectable style={{ color: course.accent, fontSize: 12, fontWeight: '800' }}>
              {course.code}
            </Text>
          </View>

          <Text selectable style={{ color: '#0f172a', fontSize: 22, fontWeight: '700' }}>
            {course.name}
          </Text>
          <Text selectable style={{ color: '#475569', fontSize: 15, lineHeight: 22 }}>
            {course.detail}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}
