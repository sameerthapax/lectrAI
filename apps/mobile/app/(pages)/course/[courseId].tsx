import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { getDocumentAsync, type DocumentPickerAsset } from 'expo-document-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Alert,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { NativeBackButton } from '../../../components/ui/native-back-button';
import { useAuth } from '../../../providers/auth-provider';
import { useAppTheme, useSettings } from '../../../providers/settings-provider';
import {
  formatMeetingScheduleSummary,
  listCoursesForUser,
  type LocalCourseRecord,
} from '../../../services/courses-repository';
import {
  listCourseFilesForCourse,
  saveCourseFile,
  type CourseFileRelationType,
  type LocalCourseFileRecord,
} from '../../../services/course-files-repository';
import {
  listLectureRecordingsForCourse,
  type LocalLectureRecordingRecord,
} from '../../../services/recordings-repository';

type UploadInputMode = 'file' | 'link';
type UploadRelation = 'Lecture file' | 'Module file' | 'Chapter file' | 'Notes' | 'Others';

type MockUpload = {
  id: string;
  title: string;
  addedAtLabel: string;
  fileTypeLabel: string;
};

const FILE_RELATIONS: UploadRelation[] = [
  'Lecture file',
  'Module file',
  'Chapter file',
  'Notes',
  'Others',
];

export default function CourseDetailRoute() {
  const { courseId } = useLocalSearchParams<{ courseId?: string }>();
  const auth = useAuth();
  const theme = useAppTheme();
  const settingsState = useSettings();
  const [course, setCourse] = useState<LocalCourseRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadMode, setUploadMode] = useState<UploadInputMode>('file');
  const [relation, setRelation] = useState<UploadRelation>('Lecture file');
  const [description, setDescription] = useState('');
  const [linkValue, setLinkValue] = useState('');
  const [uploadPanelExpanded, setUploadPanelExpanded] = useState(false);
  const [lecturesExpanded, setLecturesExpanded] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [courseFiles, setCourseFiles] = useState<LocalCourseFileRecord[]>([]);
  const [storedLectures, setStoredLectures] = useState<LocalLectureRecordingRecord[]>([]);
  const [selectedUploadAsset, setSelectedUploadAsset] = useState<DocumentPickerAsset | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [openLectureActionId, setOpenLectureActionId] = useState<string | null>(null);
  const [uploadDeleteMode, setUploadDeleteMode] = useState(false);
  const suppressNextOutsideTapRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const loadCourse = async () => {
      if (!auth.user || !courseId) {
        if (!cancelled) {
          setCourse(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      const courses = await listCoursesForUser(auth.user);
      const nextCourse = courses.find((entry) => entry.id === courseId) ?? null;

      if (!cancelled) {
        setCourse(nextCourse);
        setLoading(false);
      }
    };

    void loadCourse();

    return () => {
      cancelled = true;
    };
  }, [auth.user, courseId]);

  useEffect(() => {
    if (!course) {
      setCourseFiles([]);
      setStoredLectures([]);
      return;
    }
    setUploadPanelExpanded(false);
    setShowUploadForm(false);
    setUploadMode('file');
    setRelation('Lecture file');
    setDescription('');
    setLinkValue('');
    setSelectedUploadAsset(null);
    setOpenLectureActionId(null);
    setUploadDeleteMode(false);
  }, [course]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const loadStoredLectures = async () => {
        if (!courseId) {
          if (!cancelled) {
            setStoredLectures([]);
          }
          return;
        }

        const lectures = await listLectureRecordingsForCourse(courseId);

        if (!cancelled) {
          setStoredLectures(lectures);
        }
      };

      void loadStoredLectures();

      return () => {
        cancelled = true;
      };
    }, [courseId])
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const loadCourseFiles = async () => {
        if (!courseId) {
          if (!cancelled) {
            setCourseFiles([]);
          }
          return;
        }

        const files = await listCourseFilesForCourse(courseId);

        if (!cancelled) {
          setCourseFiles(files);
        }
      };

      void loadCourseFiles();

      return () => {
        cancelled = true;
      };
    }, [courseId])
  );

  const courseMeta = course
    ? [
        course.semester,
        course.section ? `Section ${course.section}` : '',
        course.instructorName,
        formatMeetingScheduleSummary(course.courseType, course.meetingSchedule),
      ]
        .filter(Boolean)
        .join(' • ')
    : '';
  const latestUploads = courseFiles.slice(0, uploadPanelExpanded ? 6 : 4).map(mapCourseFileToCard);

  const handleChooseFile = async () => {
    if (!settingsState.settings?.permissions.storage) {
      Alert.alert(
        'File uploads disabled',
        'Turn on Enable file uploads in Settings before importing course files.'
      );
      return;
    }

    const result = await getDocumentAsync({
      multiple: false,
      copyToCacheDirectory: true,
    });

    if (result.canceled) {
      return;
    }

    setSelectedUploadAsset(result.assets[0] ?? null);
  };

  const handleSaveCourseFile = async () => {
    if (!auth.user || !courseId) {
      return;
    }

    if (uploadMode === 'link') {
      Alert.alert(
        'Links not supported yet',
        'The real local-first flow is implemented for file uploads first. Use File mode for now.'
      );
      return;
    }

    if (!selectedUploadAsset) {
      Alert.alert('Choose a file', 'Pick a file before saving it to this course.');
      return;
    }

    try {
      setUploadBusy(true);
      const accessToken = await auth.getValidAccessToken();
      const savedFile = await saveCourseFile({
        user: auth.user,
        accessToken,
        courseId,
        asset: selectedUploadAsset,
        relationType: mapUploadRelationToStoredRelation(relation),
        description,
      });

      if (savedFile) {
        setCourseFiles((current) => [savedFile, ...current.filter((file) => file.id !== savedFile.id)]);
      }

      setShowUploadForm(false);
      setUploadPanelExpanded(true);
      setUploadMode('file');
      setRelation('Lecture file');
      setDescription('');
      setLinkValue('');
      setSelectedUploadAsset(null);
    } catch (error) {
      Alert.alert(
        'Could not save file',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setUploadBusy(false);
    }
  };
  const visibleLectures = storedLectures.slice(0, lecturesExpanded ? 6 : 3);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={{ flex: 1, backgroundColor: theme.colors.screen }}>
        <ScrollView
          onTouchStart={() => {
            if (suppressNextOutsideTapRef.current) {
              suppressNextOutsideTapRef.current = false;
              return;
            }
            if (openLectureActionId) {
              setOpenLectureActionId(null);
            }
            if (uploadDeleteMode) {
              setUploadDeleteMode(false);
            }
          }}
          onScrollBeginDrag={() => {
            if (openLectureActionId) {
              setOpenLectureActionId(null);
            }
            if (uploadDeleteMode) {
              setUploadDeleteMode(false);
            }
          }}
          scrollEventThrottle={16}
          contentInsetAdjustmentBehavior="automatic"
          style={{ backgroundColor: theme.colors.screen }}
          contentContainerStyle={{
            flexGrow: 1,
            padding: 16,
            paddingBottom: 40,
            gap: 16,
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
            <NativeBackButton theme={theme} onPress={() => router.back()} />

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
              Course
            </Text>
          </View>

          {loading ? (
            <StateCard
              theme={theme}
              title="Loading course"
              body="Fetching the latest cached course details for this page."
            />
          ) : null}

          {!loading && !course ? (
            <StateCard
              theme={theme}
              title="Course not found"
              body="This course is no longer available in local storage. Go back to the courses list and open another one."
            />
          ) : null}

          {!loading && course ? (
            <>
              <View
                style={{
                  borderRadius: 28,
                  borderCurve: 'continuous',
                  padding: 20,
                  gap: 12,
                  backgroundColor: theme.colors.card,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  boxShadow: '0 14px 28px rgba(15, 23, 42, 0.08)',
                }}
              >
                <View
                  style={{
                    alignSelf: 'flex-start',
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    backgroundColor: `${course.colorHex}18`,
                  }}
                >
                  <Text style={{ color: course.colorHex, fontSize: 12, fontWeight: '800' }}>
                    {course.courseCode || 'Course'}
                  </Text>
                </View>

                <View style={{ gap: 6 }}>
                  <Text style={{ color: theme.colors.text, fontSize: 28, lineHeight: 34, fontWeight: '900' }}>
                    {course.courseName}
                  </Text>
                  <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 }}>
                    {courseMeta || 'Course materials and stored lectures.'}
                  </Text>
                </View>

                {course.description ? (
                  <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 23 }}>
                    {course.description}
                  </Text>
                ) : null}
              </View>

              <SectionCard
                theme={theme}
                title="Upload Files"
                subtitle="Recent course materials stay visible here until you add a new one"
                headerAction={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {uploadDeleteMode ? (
                      <CircleIconButton
                        label="−"
                        variant="neutral"
                        onPress={() => {
                          suppressNextOutsideTapRef.current = true;
                          setUploadDeleteMode(false);
                        }}
                      />
                    ) : (
                      <>
                        <CircleIconButton
                          label="×"
                          onPress={() => {
                            suppressNextOutsideTapRef.current = true;
                            setUploadDeleteMode(true);
                          }}
                        />
                        <Pressable
                          onPress={() => setShowUploadForm(true)}
                          onPressIn={() => {
                            suppressNextOutsideTapRef.current = true;
                          }}
                          style={({ pressed }) => ({
                            minHeight: 36,
                            borderRadius: 999,
                            paddingHorizontal: 14,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: pressed ? theme.colors.accentMuted : theme.colors.accent,
                          })}
                        >
                          <Text style={{ color: theme.colors.accentContrast, fontSize: 13, fontWeight: '800' }}>
                            Add
                          </Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                }
              >
                {!showUploadForm ? (
                  <View style={{ gap: 14 }}>
                    {latestUploads.length === 0 ? (
                      <View
                        style={{
                          borderRadius: 18,
                          borderCurve: 'continuous',
                          padding: 16,
                          gap: 6,
                          backgroundColor: theme.colors.overlay,
                        }}
                      >
                        <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '800' }}>
                          No uploaded files yet
                        </Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 }}>
                          Add a course file and it will be stored locally first, then synced to the backend.
                        </Text>
                      </View>
                    ) : null}

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                      {latestUploads.map((upload) => (
                        <Pressable
                          key={upload.id}
                          onPress={() =>
                            router.push({
                              pathname: '/course-file/[courseFileId]',
                              params: {
                                courseFileId: upload.id,
                              },
                            })
                          }
                          onPressIn={() => {
                            suppressNextOutsideTapRef.current = true;
                          }}
                          style={({ pressed }) => ({
                            width: '48%',
                            height: uploadPanelExpanded ? 140 : 122,
                            borderRadius: 18,
                            borderCurve: 'continuous',
                            padding: 14,
                            gap: 8,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: pressed ? theme.colors.card : '#242a33',
                          })}
                        >
                          {uploadDeleteMode ? (
                            <View
                              pointerEvents="none"
                              style={{
                                position: 'absolute',
                                top: 10,
                                right: 10,
                                width: 24,
                                height: 24,
                                borderRadius: 999,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: '#dc2626',
                              }}
                            >
                              <Text style={{ color: '#ffffff', fontSize: 14, lineHeight: 14, fontWeight: '900' }}>
                                ×
                              </Text>
                            </View>
                          ) : null}

                          <FileTypeBadge label={upload.fileTypeLabel} theme={theme} />

                          <Text
                            numberOfLines={2}
                            ellipsizeMode="tail"
                            style={{
                              color: theme.colors.text,
                              fontSize: 13.5,
                              lineHeight: 18,
                              fontWeight: '800',
                              textAlign: 'center',
                            }}
                          >
                            {upload.title}
                          </Text>

                          <Text
                            style={{
                              color: theme.colors.textSubtle,
                              fontSize: 11.5,
                              fontWeight: '700',
                              textAlign: 'center',
                            }}
                          >
                            {upload.addedAtLabel}
                          </Text>

                          {uploadPanelExpanded ? (
                            <Text style={{ color: theme.colors.textMuted, fontSize: 12, lineHeight: 18 }}>
                              Added {upload.addedAtLabel}
                            </Text>
                          ) : null}
                        </Pressable>
                      ))}
                    </View>

                    {courseFiles.length > 4 ? (
                      <Pressable
                        onPress={() => setUploadPanelExpanded((current) => !current)}
                        style={({ pressed }) => ({
                          minHeight: 40,
                          alignSelf: 'center',
                          borderRadius: 999,
                          paddingHorizontal: 16,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: pressed ? theme.colors.overlay : theme.colors.card,
                        })}
                      >
                        <Text style={{ color: theme.colors.textMuted, fontSize: 13, fontWeight: '800' }}>
                          {uploadPanelExpanded ? 'Show less' : 'Show more'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : (
                  <View style={{ gap: 12 }}>
                    <OptionRow
                      title="Upload mode"
                      options={[
                        { label: 'File', value: 'file' },
                        { label: 'Link', value: 'link' },
                      ]}
                      selectedValue={uploadMode}
                      onSelect={(value) => setUploadMode(value as UploadInputMode)}
                      theme={theme}
                    />

                    <OptionRow
                      title="Relation"
                      options={FILE_RELATIONS.map((value) => ({ label: value, value }))}
                      selectedValue={relation}
                      onSelect={(value) => setRelation(value as UploadRelation)}
                      theme={theme}
                    />

                    {uploadMode === 'link' ? (
                      <FieldBlock theme={theme} label="Source link">
                        <TextInput
                          value={linkValue}
                          onChangeText={setLinkValue}
                          placeholder="https://example.com/module-1"
                          placeholderTextColor={theme.colors.textSubtle}
                          autoCapitalize="none"
                          keyboardType="url"
                          style={inputStyle(theme)}
                        />
                      </FieldBlock>
                    ) : (
                      <FieldBlock theme={theme} label="File picker">
                        <View
                          style={{
                            borderRadius: 18,
                            borderCurve: 'continuous',
                            borderWidth: 1,
                            borderColor: 'transparent',
                            borderStyle: 'dashed',
                            padding: 16,
                            gap: 8,
                            backgroundColor: theme.colors.overlay,
                          }}
                        >
                          <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '700' }}>
                            Local file picker
                          </Text>
                          <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 }}>
                            {selectedUploadAsset
                              ? `Selected: ${selectedUploadAsset.name ?? 'Unnamed file'}`
                              : 'Choose a file to store on the device and sync to the backend.'}
                          </Text>
                          <Pressable
                            onPress={() => void handleChooseFile()}
                            style={({ pressed }) => ({
                              alignSelf: 'flex-start',
                              minHeight: 38,
                              borderRadius: 999,
                              paddingHorizontal: 14,
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: pressed ? theme.colors.accentMuted : theme.colors.accent,
                            })}
                          >
                            <Text
                              style={{
                                color: theme.colors.accentContrast,
                                fontSize: 13,
                                fontWeight: '800',
                              }}
                            >
                              Choose file
                            </Text>
                          </Pressable>
                        </View>
                      </FieldBlock>
                    )}

                    <FieldBlock theme={theme} label="Brief description">
                      <TextInput
                        value={description}
                        onChangeText={setDescription}
                        placeholder="What is this file and why does it belong to this course?"
                        placeholderTextColor={theme.colors.textSubtle}
                        multiline
                        textAlignVertical="top"
                        style={[inputStyle(theme), { minHeight: 104, paddingTop: 14 }]}
                      />
                    </FieldBlock>

                    <View
                      style={{
                        borderRadius: 18,
                        borderCurve: 'continuous',
                        padding: 14,
                        gap: 6,
                        backgroundColor: theme.colors.overlay,
                      }}
                    >
                      <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '800' }}>
                        Pending upload summary
                      </Text>
                      <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 }}>
                        {uploadMode === 'link'
                          ? 'Link mode is not wired yet'
                          : `File • ${relation} • ${selectedUploadAsset?.name ?? 'No file selected'}`}
                      </Text>
                      <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 }}>
                        {description.trim() || 'Add a short note so teammates know what this material is.'}
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <Pressable
                        onPress={() => setShowUploadForm(false)}
                        disabled={uploadBusy}
                        style={({ pressed }) => ({
                          flex: 1,
                          minHeight: 52,
                          borderRadius: 18,
                          borderCurve: 'continuous',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: pressed ? theme.colors.neutralBorder : theme.colors.overlay,
                        })}
                      >
                        <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '800' }}>
                          Cancel
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() => void handleSaveCourseFile()}
                        disabled={uploadBusy}
                        style={({ pressed }) => ({
                          flex: 1,
                          minHeight: 52,
                          borderRadius: 18,
                          borderCurve: 'continuous',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: pressed ? theme.colors.accentMuted : theme.colors.accent,
                        })}
                      >
                        <Text style={{ color: theme.colors.accentContrast, fontSize: 15, fontWeight: '900' }}>
                          {uploadBusy ? 'Saving...' : 'Save File'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </SectionCard>

              <SectionCard
                theme={theme}
                title="Stored Lectures"
                subtitle="Tap a lecture card to open the lecture review page"
              >
                <View style={{ gap: 12 }}>
                  {visibleLectures.length === 0 ? (
                    <View
                      style={{
                        borderRadius: 22,
                        borderCurve: 'continuous',
                        padding: 18,
                        gap: 6,
                        backgroundColor: theme.colors.overlay,
                      }}
                    >
                      <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '800' }}>
                        No stored lectures yet
                      </Text>
                      <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 21 }}>
                        Record a lecture for this course and it will appear here with its local file status.
                      </Text>
                    </View>
                  ) : null}

                  {visibleLectures.map((lecture) => (
                    <SwipeRevealCard
                      key={lecture.lectureId}
                      theme={theme}
                      actionLabel="×"
                      isOpen={openLectureActionId === lecture.lectureId}
                      onOpenChange={(nextIsOpen) => {
                        setOpenLectureActionId(nextIsOpen ? lecture.lectureId : null);
                      }}
                    >
                      <Pressable
                        onPress={() =>
                          router.push({
                            pathname: '/recording-results-page',
                            params: {
                              lectureId: lecture.lectureId,
                            },
                          })
                        }
                        style={({ pressed }) => ({
                          borderRadius: 22,
                          borderCurve: 'continuous',
                          padding: 15,
                          gap: 6,
                          backgroundColor: pressed ? theme.colors.card : '#242a33',
                          boxShadow: '0 12px 24px rgba(15, 23, 42, 0.08)',
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
                              flex: 1,
                              color: theme.colors.text,
                              fontSize: 15.5,
                              lineHeight: 20,
                              fontWeight: '800',
                            }}
                          >
                            {lecture.title}
                          </Text>
                          <Text style={{ color: theme.colors.textSubtle, fontSize: 11.5, fontWeight: '700' }}>
                            {formatRelativeLectureTime(lecture.recordedAt)}
                          </Text>
                        </View>
                      </Pressable>
                    </SwipeRevealCard>
                  ))}

                  {storedLectures.length > 3 ? (
                    <Pressable
                      onPress={() => setLecturesExpanded((current) => !current)}
                      style={({ pressed }) => ({
                        minHeight: 40,
                        alignSelf: 'center',
                        borderRadius: 999,
                        paddingHorizontal: 16,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: pressed ? theme.colors.overlay : theme.colors.card,
                      })}
                    >
                      <Text style={{ color: theme.colors.textMuted, fontSize: 13, fontWeight: '800' }}>
                        {lecturesExpanded ? 'Show less' : 'Show more'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </SectionCard>
            </>
          ) : null}
        </ScrollView>
      </View>
    </>
  );
}

function mapCourseFileToCard(file: LocalCourseFileRecord): MockUpload {
  return {
    id: file.id,
    title: file.title,
    addedAtLabel: formatRelativeLectureTime(file.createdAt),
    fileTypeLabel: formatCourseFileTypeLabel(file),
  };
}

function mapUploadRelationToStoredRelation(value: UploadRelation): CourseFileRelationType {
  switch (value) {
    case 'Lecture file':
      return 'lecture_file';
    case 'Module file':
      return 'module_file';
    case 'Chapter file':
      return 'chapter_file';
    case 'Notes':
      return 'notes';
    case 'Others':
      return 'other';
  }
}

function formatRelativeLectureTime(recordedAt: string | null) {
  if (!recordedAt) {
    return 'Saved';
  }

  const targetTime = new Date(recordedAt).getTime();

  if (Number.isNaN(targetTime)) {
    return 'Saved';
  }

  const diffMs = Date.now() - targetTime;
  const diffMinutes = Math.max(0, Math.floor(diffMs / (1000 * 60)));

  if (diffMinutes < 1) {
    return 'Just now';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays === 1) {
    return 'Yesterday';
  }

  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  const diffWeeks = Math.floor(diffDays / 7);
  return `${diffWeeks}w ago`;
}

function formatCourseFileTypeLabel(file: LocalCourseFileRecord) {
  if (file.fileExtension && file.fileExtension.trim().length > 0) {
    return `.${file.fileExtension.trim().toUpperCase()}`;
  }

  return '.FILE';
}
function SectionCard({
  theme,
  title,
  subtitle,
  headerAction,
  children,
}: {
  theme: ReturnType<typeof useAppTheme>;
  title: string;
  subtitle: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        borderRadius: 28,
        borderCurve: 'continuous',
        padding: 18,
        gap: 14,
        backgroundColor: theme.colors.card,
        boxShadow: '0 14px 28px rgba(15, 23, 42, 0.08)',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <View style={{ gap: 4, flex: 1 }}>
          <Text style={{ color: theme.colors.text, fontSize: 24, lineHeight: 28, fontWeight: '900' }}>
            {title}
          </Text>
          <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 }}>
            {subtitle}
          </Text>
        </View>
        {headerAction}
      </View>
      {children}
    </View>
  );
}

function FieldBlock({
  theme,
  label,
  children,
}: {
  theme: ReturnType<typeof useAppTheme>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '800' }}>{label}</Text>
      {children}
    </View>
  );
}

function OptionRow({
  title,
  options,
  selectedValue,
  onSelect,
  theme,
}: {
  title: string;
  options: { label: string; value: string }[];
  selectedValue: string;
  onSelect: (value: string) => void;
  theme: ReturnType<typeof useAppTheme>;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '800' }}>{title}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((option) => {
          const selected = option.value === selectedValue;

          return (
            <Pressable
              key={option.value}
              onPress={() => onSelect(option.value)}
              style={({ pressed }) => ({
                minHeight: 38,
                borderRadius: 999,
                paddingHorizontal: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected
                  ? theme.colors.accentSoft
                  : pressed
                    ? theme.colors.overlay
                    : theme.colors.card,
              })}
            >
              <Text
                style={{
                  color: selected ? theme.colors.accent : theme.colors.text,
                  fontSize: 13,
                  fontWeight: '800',
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function StateCard({
  theme,
  title,
  body,
}: {
  theme: ReturnType<typeof useAppTheme>;
  title: string;
  body: string;
}) {
  return (
    <View
      style={{
        borderRadius: 24,
        borderCurve: 'continuous',
        padding: 18,
        gap: 8,
        backgroundColor: theme.colors.card,
      }}
    >
      <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '800' }}>{title}</Text>
      <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 }}>{body}</Text>
    </View>
  );
}

function inputStyle(theme: ReturnType<typeof useAppTheme>) {
  return {
    borderRadius: 18,
    borderCurve: 'continuous' as const,
    backgroundColor: theme.colors.overlay,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.colors.text,
    fontSize: 15,
  };
}

function CircleIconButton({
  label,
  onPress,
  variant = 'danger',
}: {
  label: string;
  onPress: () => void;
  variant?: 'danger' | 'neutral';
}) {
  const isDanger = variant === 'danger';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isDanger
          ? pressed
            ? '#b91c1c'
            : '#dc2626'
          : pressed
            ? '#3a4250'
            : '#2b3340',
      })}
    >
      <Text style={{ color: '#ffffff', fontSize: 18, lineHeight: 18, fontWeight: '900' }}>
        {label}
      </Text>
    </Pressable>
  );
}

function FileTypeBadge({
  label,
  theme,
}: {
  label: string;
  theme: ReturnType<typeof useAppTheme>;
}) {
  return (
    <View
      style={{
        width: 38,
        height: 46,
        borderRadius: 10,
        borderCurve: 'continuous',
        paddingTop: 6,
        paddingHorizontal: 4,
        alignItems: 'center',
        backgroundColor: '#f4f7fb',
        position: 'relative',
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 12,
          height: 12,
          backgroundColor: '#dbe4ef',
          borderTopRightRadius: 10,
          borderBottomLeftRadius: 6,
        }}
      />
      <View
        style={{
          width: 20,
          height: 2,
          borderRadius: 999,
          backgroundColor: '#d5dde8',
          marginTop: 10,
          marginBottom: 5,
        }}
      />
      <View
        style={{
          width: 20,
          height: 2,
          borderRadius: 999,
          backgroundColor: '#d5dde8',
          marginBottom: 5,
        }}
      />
      <Text
        numberOfLines={1}
        style={{
          marginTop: 'auto',
          color: theme.colors.accent,
          fontSize: 9.5,
          lineHeight: 11,
          fontWeight: '900',
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function SwipeRevealCard({
  theme,
  actionLabel,
  isOpen,
  onOpenChange,
  children,
}: {
  theme: ReturnType<typeof useAppTheme>;
  actionLabel: string;
  isOpen: boolean;
  onOpenChange: (nextIsOpen: boolean) => void;
  children: React.ReactNode;
}) {
  const ACTION_WIDTH = 68;
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(translateX, {
      toValue: isOpen ? -ACTION_WIDTH : 0,
      useNativeDriver: true,
      damping: 18,
      stiffness: 220,
      mass: 0.9,
    }).start();
  }, [ACTION_WIDTH, isOpen, translateX]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isOpen,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 8 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderMove: (_, gestureState) => {
        const baseOffset = isOpen ? -ACTION_WIDTH : 0;
        const nextOffset = Math.max(-ACTION_WIDTH, Math.min(0, gestureState.dx + baseOffset));
        translateX.setValue(nextOffset);
      },
      onPanResponderRelease: (_, gestureState) => {
        const shouldOpen = isOpen ? gestureState.dx < 28 : gestureState.dx < -28;
        onOpenChange(shouldOpen);
      },
      onPanResponderTerminate: () => {
        onOpenChange(isOpen);
      },
    })
  ).current;

  return (
    <View
      style={{
        position: 'relative',
        justifyContent: 'center',
        overflow: 'hidden',
        borderRadius: 22,
        borderCurve: 'continuous',
        backgroundColor: theme.colors.card,
      }}
    >
      <View
        pointerEvents={isOpen ? 'auto' : 'none'}
        style={{
          position: 'absolute',
          right: 12,
          top: 0,
          bottom: 0,
          justifyContent: 'center',
          alignItems: 'center',
          opacity: isOpen ? 1 : 0,
        }}
      >
        <Pressable
          onPress={() => onOpenChange(false)}
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#dc2626',
          }}
        >
          <Text style={{ color: '#ffffff', fontSize: 18, lineHeight: 18, fontWeight: '900' }}>
            {actionLabel}
          </Text>
        </Pressable>
      </View>

      <Animated.View
        {...panResponder.panHandlers}
        style={{
          transform: [{ translateX }],
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
}
