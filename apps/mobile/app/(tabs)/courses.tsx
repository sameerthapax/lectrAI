import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Pressable, ScrollView, Text, View } from 'react-native';
import { CourseFormModal } from '../../components/courses/course-form-modal';
import { useAuth } from '../../providers/auth-provider';
import { useLoadingOverlayControl } from '../../providers/loading-overlay-provider';
import {
  createCourse,
  deleteCourse as deleteRemoteCourse,
  fetchCourses,
  updateCourse,
} from '../../services/courses-api';
import {
  createCourseDraftFromRecord,
  createEmptyCourseDraft,
  listCoursesForUser,
  removeCachedCourseForUser,
  replaceCoursesForUser,
  toRemoteCoursePayload,
  type CourseDraft,
  type LocalCourseRecord,
  upsertCourseForUser,
} from '../../services/courses-repository';

export default function CoursesRoute() {
  const auth = useAuth();
  const loadingOverlay = useLoadingOverlayControl();
  const [isEditing, setIsEditing] = useState(false);
  const [courses, setCourses] = useState<LocalCourseRecord[]>([]);
  const [formDraft, setFormDraft] = useState<CourseDraft>(createEmptyCourseDraft());
  const [formError, setFormError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const wiggle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const user = auth.user;

    if (!user) {
      setCourses([]);
      setIsLoading(false);
      setLoadError(null);
      return;
    }

    let cancelled = false;

    const loadCourses = async () => {
      setIsLoading(true);
      setLoadError(null);
      let hasCachedCourses = false;

      try {
        const cachedCourses = await listCoursesForUser(user);
        hasCachedCourses = cachedCourses.length > 0;

        if (!cancelled) {
          setCourses(cachedCourses);
        }

        const accessToken = await auth.getValidAccessToken();

        if (!accessToken) {
          throw new Error('Your session expired. Please sign in again.');
        }

        const remoteCourses = await fetchCourses(accessToken);
        await replaceCoursesForUser(user, remoteCourses);
        const refreshedCourses = await listCoursesForUser(user);

        if (!cancelled) {
          setCourses(refreshedCourses);
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : 'Unable to load your courses.';

          setLoadError(hasCachedCourses ? null : message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadCourses();

    return () => {
      cancelled = true;
    };
  }, [auth.user?.id]);

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

  const handleOpenCreate = () => {
    setFormMode('create');
    setSelectedCourseId(null);
    setFormDraft(createEmptyCourseDraft());
    setFormError(null);
    setIsFormVisible(true);
  };

  const handleOpenEdit = (course: LocalCourseRecord) => {
    setFormMode('edit');
    setSelectedCourseId(course.id);
    setFormDraft(createCourseDraftFromRecord(course));
    setFormError(null);
    setIsFormVisible(true);
  };

  const handleCloseForm = () => {
    if (isSaving) {
      return;
    }

    setIsFormVisible(false);
    setFormError(null);
  };

  const handleChangeDraft = (field: keyof CourseDraft, value: string) => {
    setFormDraft((currentDraft) => ({ ...currentDraft, [field]: value }));
  };

  const handleSubmitForm = async () => {
    if (!auth.user) {
      return;
    }

    if (!formDraft.courseName.trim()) {
      setFormError('Course name is required.');
      return;
    }

    if (!/^\d{4}$/.test(formDraft.semesterYear.trim())) {
      setFormError('Choose a valid year.');
      return;
    }

    setIsSaving(true);
    setFormError(null);
    loadingOverlay.show();

    try {
      const accessToken = await auth.getValidAccessToken();

      if (!accessToken) {
        throw new Error('Your session expired. Please sign in again.');
      }

      const payload = toRemoteCoursePayload(formDraft);
      const course =
        formMode === 'create'
          ? await createCourse(accessToken, payload)
          : await updateCourse(accessToken, selectedCourseId!, payload);

      await upsertCourseForUser(course);
      const nextCourses = await listCoursesForUser(auth.user);
      setCourses(nextCourses);
      setIsFormVisible(false);
      setSelectedCourseId(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to save this course.');
    } finally {
      loadingOverlay.hide();
      setIsSaving(false);
    }
  };

  const handleRemoveCourse = (course: LocalCourseRecord) => {
    if (!auth.user) {
      return;
    }

    Alert.alert(
      'Remove course',
      `Remove ${course.courseName}? This will delete it from the main database and this device.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            loadingOverlay.show();

            try {
              const accessToken = await auth.getValidAccessToken();

              if (!accessToken) {
                throw new Error('Your session expired. Please sign in again.');
              }

              await deleteRemoteCourse(accessToken, course.id);
              await removeCachedCourseForUser(auth.user!, course.id);
              const nextCourses = await listCoursesForUser(auth.user!);
              setCourses(nextCourses);
            } catch (error) {
              Alert.alert(
                'Could not remove course',
                error instanceof Error ? error.message : 'Please try again.'
              );
            } finally {
              loadingOverlay.hide();
            }
          },
        },
      ]
    );
  };

  const renderCourseDetail = (course: LocalCourseRecord) => {
    const details = [course.semester, course.section ? `Section ${course.section}` : '', course.instructorName]
      .filter(Boolean)
      .join(' • ');

    if (course.description && details) {
      return `${details}\n${course.description}`;
    }

    return course.description || details || 'Available offline from the local cache.';
  };

  return (
    <>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          padding: 16,
          gap: 14,
          paddingBottom: 32,
          backgroundColor: '#f7f6f2',
          flexGrow: 1,
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
                onPress={handleOpenCreate}
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

        {isLoading ? (
          <View
            style={{
              minHeight: 220,
              borderRadius: 24,
              borderCurve: 'continuous',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              backgroundColor: 'rgba(255,255,255,0.78)',
              boxShadow: '0 12px 28px rgba(15, 23, 42, 0.08)',
            }}
          >
            <ActivityIndicator size="small" color="#115e59" />
            <Text style={{ color: '#475569', fontSize: 14, fontWeight: '600' }}>
              Loading courses from cache and server…
            </Text>
          </View>
        ) : null}

        {!isLoading && loadError ? (
          <View
            style={{
              borderRadius: 24,
              borderCurve: 'continuous',
              padding: 18,
              gap: 10,
              backgroundColor: '#fff1f2',
            }}
          >
            <Text style={{ color: '#9f1239', fontSize: 18, fontWeight: '800' }}>Could not load courses</Text>
            <Text style={{ color: '#9f1239', fontSize: 14, lineHeight: 20 }}>{loadError}</Text>
          </View>
        ) : null}

        {!isLoading && !loadError && courses.length === 0 ? (
          <View
            style={{
              borderRadius: 24,
              borderCurve: 'continuous',
              padding: 18,
              gap: 10,
              backgroundColor: '#ffffff',
              boxShadow: '0 12px 28px rgba(15, 23, 42, 0.08)',
            }}
          >
            <Text style={{ color: '#0f172a', fontSize: 20, fontWeight: '800' }}>No courses yet</Text>
            <Text style={{ color: '#475569', fontSize: 14, lineHeight: 20 }}>
              Add your first course. It will save to the main database and then stay cached on this phone.
            </Text>
            <Pressable
              onPress={handleOpenCreate}
              style={({ pressed }) => ({
                alignSelf: 'flex-start',
                minHeight: 40,
                borderRadius: 999,
                paddingHorizontal: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? '#0f766e' : '#115e59',
              })}
            >
              <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '800' }}>Add course</Text>
            </Pressable>
          </View>
        ) : null}

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
                  onPress={() => handleOpenEdit(course)}
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
                  onPress={() => handleRemoveCourse(course)}
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
                backgroundColor: `${course.colorHex}18`,
              }}
            >
              <Text selectable style={{ color: course.colorHex, fontSize: 12, fontWeight: '800' }}>
                {course.courseCode || 'Untitled'}
              </Text>
            </View>

            <Text selectable style={{ color: '#0f172a', fontSize: 22, fontWeight: '700' }}>
              {course.courseName}
            </Text>
            <Text selectable style={{ color: '#475569', fontSize: 15, lineHeight: 22 }}>
              {renderCourseDetail(course)}
            </Text>
          </Animated.View>
        ))}
      </ScrollView>

      <CourseFormModal
        draft={formDraft}
        errorMessage={formError}
        mode={formMode}
        onChange={handleChangeDraft}
        onClose={handleCloseForm}
        onSubmit={handleSubmitForm}
        saving={isSaving}
        visible={isFormVisible}
      />
    </>
  );
}
