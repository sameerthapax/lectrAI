import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  getSemesterYearOptions,
  listCoursesForUser,
  removeCachedCourseForUser,
  replaceCoursesForUser,
  toRemoteCoursePayload,
  type CourseDraft,
  type LocalCourseRecord,
  type SemesterTerm,
  upsertCourseForUser,
} from '../../services/courses-repository';
import { useAppTheme } from '../../providers/settings-provider';

const SEMESTER_TERMS: SemesterTerm[] = ['Spring', 'Summer', 'Fall', 'Winter'];

export default function CoursesRoute() {
  const auth = useAuth();
  const theme = useAppTheme();
  const loadingOverlay = useLoadingOverlayControl();
  const defaultCourseDraft = useMemo(() => createEmptyCourseDraft(), []);
  const [isEditing, setIsEditing] = useState(false);
  const [courses, setCourses] = useState<LocalCourseRecord[]>([]);
  const [formDraft, setFormDraft] = useState<CourseDraft>(defaultCourseDraft);
  const [formError, setFormError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openFilter, setOpenFilter] = useState<'term' | 'year' | null>(null);
  const [selectedTerm, setSelectedTerm] = useState<SemesterTerm | 'All terms'>(
    defaultCourseDraft.semesterTerm
  );
  const [selectedYear, setSelectedYear] = useState<string>(defaultCourseDraft.semesterYear);
  const wiggle = useRef(new Animated.Value(0)).current;
  const availableYears = useMemo(() => {
    const derivedYears = Array.from(
      new Set(courses.map((course) => String(course.semesterYear)))
    ).sort((left, right) => Number(right) - Number(left));

    for (const year of getSemesterYearOptions()) {
      if (!derivedYears.includes(year)) {
        derivedYears.push(year);
      }
    }

    return derivedYears.sort((left, right) => Number(right) - Number(left));
  }, [courses]);
  const filteredCourses = useMemo(
    () =>
      courses.filter((course) => {
        if (selectedTerm !== 'All terms' && course.semesterTerm !== selectedTerm) {
          return false;
        }

        if (selectedYear !== 'All years' && String(course.semesterYear) !== selectedYear) {
          return false;
        }

        return true;
      }),
    [courses, selectedTerm, selectedYear]
  );

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
      if (formMode === 'edit' && !selectedCourseId) {
        throw new Error('Choose a course before saving edits.');
      }

      const accessToken = await auth.getValidAccessToken();

      if (!accessToken) {
        throw new Error('Your session expired. Please sign in again.');
      }

      const payload = toRemoteCoursePayload(formDraft);
      const course =
        formMode === 'create'
          ? await createCourse(accessToken, payload)
          : await updateCourse(accessToken, selectedCourseId, payload);

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
    const currentUser = auth.user;

    if (!currentUser) {
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
              await removeCachedCourseForUser(currentUser, course.id);
              const nextCourses = await listCoursesForUser(currentUser);
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
          flexGrow: 1,
          padding: 16,
          gap: 14,
          paddingBottom: 32,
          backgroundColor: theme.colors.screen,
        }}
      >
        <View
          style={{
            paddingTop: 2,
            paddingHorizontal: 2,
            gap: 12,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text selectable style={{ color: theme.colors.text, fontSize: 30, fontWeight: '800' }}>
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
                    backgroundColor: pressed ? theme.colors.accentMuted : theme.colors.accent,
                  })}
                >
                  <Text style={{ color: theme.colors.accentContrast, fontSize: 14, fontWeight: '800' }}>Add</Text>
                </Pressable>

                <Pressable
                  onPress={() => setIsEditing(false)}
                  style={({ pressed }) => ({
                    minHeight: 36,
                    borderRadius: 999,
                    paddingHorizontal: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: pressed ? theme.colors.neutralBorder : theme.colors.neutralSoft,
                    borderWidth: 1,
                    borderColor: theme.colors.neutralBorder,
                  })}
                >
                  <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '800' }}>Done</Text>
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
                  backgroundColor: pressed ? theme.colors.cardMuted : theme.colors.overlay,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  boxShadow: '0 10px 20px rgba(15, 23, 42, 0.06)',
                })}
              >
                <Text style={{ color: theme.colors.textMuted, fontSize: 14, fontWeight: '800' }}>Edit</Text>
              </Pressable>
            )}
          </View>

          <View style={{ gap: 10 }}>
            <View
              style={{
                flexDirection: 'row',
                gap: 18,
                alignItems: 'flex-start',
                zIndex: 20,
              }}
            >
              <View style={{ alignItems: 'flex-start', position: 'relative', zIndex: openFilter === 'term' ? 30 : 20 }}>
                <CourseFilterDropdown
                  label="Semester"
                  value={selectedTerm}
                  open={openFilter === 'term'}
                  onPress={() =>
                    setOpenFilter((current) => (current === 'term' ? null : 'term'))
                  }
                  theme={theme}
                />
                {openFilter === 'term' ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: 28,
                      left: 0,
                    }}
                  >
                    <FilterOptionList
                      options={['All terms', ...SEMESTER_TERMS]}
                      selectedValue={selectedTerm}
                      onSelect={(value) => {
                        setSelectedTerm(value as SemesterTerm | 'All terms');
                        setOpenFilter(null);
                      }}
                      theme={theme}
                    />
                  </View>
                ) : null}
              </View>

              <View style={{ alignItems: 'flex-start', position: 'relative', zIndex: openFilter === 'year' ? 30 : 20 }}>
                <CourseFilterDropdown
                  label="Year"
                  value={selectedYear}
                  open={openFilter === 'year'}
                  onPress={() =>
                    setOpenFilter((current) => (current === 'year' ? null : 'year'))
                  }
                  theme={theme}
                />
                {openFilter === 'year' ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: 28,
                      left: 0,
                    }}
                  >
                    <FilterOptionList
                      options={['All years', ...availableYears]}
                      selectedValue={selectedYear}
                      onSelect={(value) => {
                        setSelectedYear(value);
                        setOpenFilter(null);
                      }}
                      theme={theme}
                    />
                  </View>
                ) : null}
              </View>
            </View>
          </View>
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
              backgroundColor: theme.colors.overlay,
              borderWidth: 1,
              borderColor: theme.colors.border,
              boxShadow: '0 12px 28px rgba(15, 23, 42, 0.08)',
            }}
          >
            <ActivityIndicator size="small" color={theme.colors.accent} />
            <Text style={{ color: theme.colors.textMuted, fontSize: 14, fontWeight: '600' }}>
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
              backgroundColor: theme.colors.dangerSoft,
              borderWidth: 1,
              borderColor: theme.colors.dangerBorder,
            }}
          >
            <Text style={{ color: theme.colors.danger, fontSize: 18, fontWeight: '800' }}>Could not load courses</Text>
            <Text style={{ color: theme.colors.danger, fontSize: 14, lineHeight: 20 }}>{loadError}</Text>
          </View>
        ) : null}

        {!isLoading && !loadError && courses.length === 0 ? (
          <View
            style={{
              borderRadius: 24,
              borderCurve: 'continuous',
              padding: 18,
              gap: 10,
              backgroundColor: theme.colors.card,
              borderWidth: 1,
              borderColor: theme.colors.border,
              boxShadow: '0 12px 28px rgba(15, 23, 42, 0.08)',
            }}
          >
            <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '800' }}>No courses yet</Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 }}>
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
                backgroundColor: pressed ? theme.colors.accentMuted : theme.colors.accent,
              })}
            >
              <Text style={{ color: theme.colors.accentContrast, fontSize: 14, fontWeight: '800' }}>Add course</Text>
            </Pressable>
          </View>
        ) : null}

        {!isLoading && !loadError && courses.length > 0 && filteredCourses.length === 0 ? (
          <View
            style={{
              borderRadius: 24,
              borderCurve: 'continuous',
              padding: 18,
              gap: 10,
              backgroundColor: theme.colors.card,
              borderWidth: 1,
              borderColor: theme.colors.border,
              boxShadow: '0 12px 28px rgba(15, 23, 42, 0.08)',
            }}
          >
            <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '800' }}>
              No courses for this semester
            </Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 }}>
              Try a different term or year filter to see other saved courses.
            </Text>
          </View>
        ) : null}

        {filteredCourses.map((course, index) => (
          <Animated.View
            key={course.id}
            style={{
              borderRadius: 18,
              borderCurve: 'continuous',
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
            <Pressable
              disabled={isEditing}
              onPress={() => router.push(`/(pages)/course/${course.id}`)}
              style={({ pressed }) => ({
                borderRadius: 18,
                borderCurve: 'continuous',
                padding: 16,
                gap: 8,
                backgroundColor:
                  !isEditing && pressed ? theme.colors.overlay : theme.colors.card,
                borderWidth: 1,
                borderColor: theme.colors.border,
                boxShadow: '0 4px 14px rgba(15, 23, 42, 0.08)',
              })}
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
                      backgroundColor: pressed ? '#3b82f6' : '#2563eb',
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
                      backgroundColor: pressed ? '#dc2626' : theme.colors.danger,
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

              <Text selectable style={{ color: theme.colors.text, fontSize: 22, fontWeight: '700' }}>
                {course.courseName}
              </Text>
              <Text selectable style={{ color: theme.colors.textMuted, fontSize: 15, lineHeight: 22 }}>
                {renderCourseDetail(course)}
              </Text>
            </Pressable>
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

function CourseFilterDropdown({
  label,
  value,
  open,
  onPress,
  theme,
}: {
  label: string;
  value: string;
  open: boolean;
  onPress: () => void;
  theme: ReturnType<typeof useAppTheme>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 0,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Text style={{ color: theme.colors.textSubtle, fontSize: 13, fontWeight: '700' }}>
          {label}:
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: open ? theme.colors.accent : theme.colors.text,
            fontSize: 14,
            fontWeight: '800',
          }}
        >
          {value}
        </Text>
        <Text
          style={{
            color: open ? theme.colors.accent : theme.colors.textMuted,
            fontSize: 12,
            fontWeight: '800',
          }}
        >
          ▾
        </Text>
      </View>
    </Pressable>
  );
}

function FilterOptionList({
  options,
  selectedValue,
  onSelect,
  theme,
}: {
  options: readonly string[];
  selectedValue: string;
  onSelect: (value: string) => void;
  theme: ReturnType<typeof useAppTheme>;
}) {
  return (
    <View
      style={{
        minWidth: 164,
        borderRadius: 18,
        borderCurve: 'continuous',
        padding: 8,
        gap: 2,
        backgroundColor: theme.colors.card,
        borderWidth: 1,
        borderColor: theme.colors.border,
        boxShadow: '0 16px 28px rgba(15, 23, 42, 0.16)',
      }}
    >
      <View style={{ gap: 2 }}>
        {options.map((option) => {
          const selected = option === selectedValue;

          return (
            <Pressable
              key={option}
              onPress={() => onSelect(option)}
              style={({ pressed }) => ({
                minHeight: 36,
                borderRadius: 12,
                borderCurve: 'continuous',
                paddingHorizontal: 10,
                justifyContent: 'center',
                backgroundColor: selected
                  ? theme.colors.accentSoft
                  : pressed
                    ? theme.colors.cardMuted
                    : 'transparent',
                opacity: pressed ? 0.84 : 1,
              })}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <Text
                  style={{
                    color: selected ? theme.colors.text : theme.colors.textMuted,
                    fontSize: 14,
                    fontWeight: selected ? '800' : '700',
                  }}
                >
                  {option}
                </Text>
                <Text
                  style={{
                    color: selected ? theme.colors.accent : 'transparent',
                    fontSize: 13,
                    fontWeight: '900',
                  }}
                >
                  ✓
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
