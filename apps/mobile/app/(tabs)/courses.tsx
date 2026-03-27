import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, Text, View } from 'react-native';

const initialCourseCards = [
  {
    id: 'csc-499',
    code: 'CSC 499',
    name: 'Senior Capstone',
    accent: '#0f766e',
    detail: '2 lectures ready for review',
  },
  {
    id: 'csc-430',
    code: 'CSC 430',
    name: 'Artificial Intelligence',
    accent: '#c2410c',
    detail: '1 new summary generated',
  },
  {
    id: 'mat-345',
    code: 'MAT 345',
    name: 'Discrete Structures II',
    accent: '#1d4ed8',
    detail: 'Quiz practice available',
  },
];

export default function CoursesRoute() {
  const [isEditing, setIsEditing] = useState(false);
  const [courses, setCourses] = useState(initialCourseCards);
  const wiggle = useRef(new Animated.Value(0)).current;
  const nextCourseNumberRef = useRef(initialCourseCards.length + 1);

  useEffect(() => {
    if (!isEditing) {
      wiggle.stopAnimation();
      wiggle.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wiggle, {
          toValue: 1,
          duration: 90,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(wiggle, {
          toValue: -1,
          duration: 90,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(wiggle, {
          toValue: 0.8,
          duration: 90,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(wiggle, {
          toValue: -0.8,
          duration: 90,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();

    return () => {
      loop.stop();
      wiggle.stopAnimation();
      wiggle.setValue(0);
    };
  }, [isEditing, wiggle]);

  const handleAddCourse = () => {
    const courseNumber = nextCourseNumberRef.current;
    nextCourseNumberRef.current += 1;

    setCourses((currentCourses) => [
      {
        id: `new-course-${courseNumber}`,
        code: `NEW ${courseNumber}`,
        name: `New Course ${courseNumber}`,
        accent: '#7c3aed',
        detail: 'Tap edit to customize this course',
      },
      ...currentCourses,
    ]);
  };

  const handleEditCourse = (courseId: string) => {
    setCourses((currentCourses) =>
      currentCourses.map((course) =>
        course.id === courseId
          ? {
              ...course,
              name: course.name.includes('Edited') ? course.name : `${course.name} (Edited)`,
              detail: 'Course details updated locally',
            }
          : course
      )
    );
  };

  const handleRemoveCourse = (courseId: string) => {
    setCourses((currentCourses) => currentCourses.filter((course) => course.id !== courseId));
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        padding: 16,
        gap: 14,
        paddingBottom: 32,
        backgroundColor: '#f7f6f2',
      }}
    >
      <View
        style={{
          paddingTop: 2,
          paddingHorizontal: 2,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text selectable style={{ color: '#0f172a', fontSize: 30, fontWeight: '800' }}>
          Courses
        </Text>

        {isEditing ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={handleAddCourse}
              style={({ pressed }) => ({
                minHeight: 36,
                borderRadius: 999,
                paddingHorizontal: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? '#fb923c' : '#f97316',
              })}
            >
              <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '800' }}>Add</Text>
            </Pressable>

            <Pressable
              onPress={() => setIsEditing(false)}
              style={({ pressed }) => ({
                minHeight: 36,
                borderRadius: 999,
                paddingHorizontal: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? 'rgba(15,23,42,0.9)' : '#0f172a',
              })}
            >
              <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '800' }}>Done</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => setIsEditing(true)}
            style={({ pressed }) => ({
              minHeight: 36,
              borderRadius: 999,
              paddingHorizontal: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.92)',
              borderWidth: 1,
              borderColor: 'rgba(226,232,240,0.95)',
              boxShadow: '0 10px 20px rgba(15, 23, 42, 0.06)',
            })}
          >
            <Text style={{ color: '#334155', fontSize: 14, fontWeight: '800' }}>Edit</Text>
          </Pressable>
        )}
      </View>

      {courses.map((course, index) => (
        <Animated.View
          key={course.id}
          style={{
            borderRadius: 18,
            borderCurve: 'continuous',
            padding: 16,
            gap: 8,
            backgroundColor: '#ffffff',
            boxShadow: '0 4px 14px rgba(15, 23, 42, 0.08)',
            transform: [
              {
                rotate: isEditing
                  ? wiggle.interpolate({
                      inputRange: [-1, 1],
                      outputRange: [`${-0.25 - index * 0.03}deg`, `${0.25 + index * 0.03}deg`],
                    })
                  : '0deg',
              },
              {
                translateX: isEditing
                  ? wiggle.interpolate({
                      inputRange: [-1, 1],
                      outputRange: [-0.4 - index * 0.05, 0.4 + index * 0.05],
                    })
                  : 0,
              },
            ],
          }}
        >
          {isEditing ? (
            <View
              pointerEvents="box-none"
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                flexDirection: 'row',
                gap: 8,
                zIndex: 2,
              }}
            >
              <Pressable
                onPress={() => handleEditCourse(course.id)}
                style={({ pressed }) => ({
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: pressed ? '#1d4ed8' : '#2563eb',
                  boxShadow: '0 10px 18px rgba(37, 99, 235, 0.22)',
                })}
              >
                <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '800' }}>✎</Text>
              </Pressable>

              <Pressable
                onPress={() => handleRemoveCourse(course.id)}
                style={({ pressed }) => ({
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: pressed ? '#dc2626' : '#ef4444',
                  boxShadow: '0 10px 18px rgba(239, 68, 68, 0.22)',
                })}
              >
                <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '900' }}>−</Text>
              </Pressable>
            </View>
          ) : null}

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
        </Animated.View>
      ))}
    </ScrollView>
  );
}
