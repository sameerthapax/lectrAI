import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { getDocumentAsync, type DocumentPickerAsset } from 'expo-document-picker';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../../../providers/auth-provider';
import { useAppTheme } from '../../../providers/settings-provider';
import { listCoursesForUser, type LocalCourseRecord } from '../../../services/courses-repository';
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
  relation: UploadRelation;
  addedAtLabel: string;
  description: string;
  sourceLabel: string;
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
    ? [course.semester, course.section ? `Section ${course.section}` : '', course.instructorName]
        .filter(Boolean)
        .join(' • ')
    : '';
  const latestUploads = courseFiles.slice(0, uploadPanelExpanded ? 6 : 4).map(mapCourseFileToCard);

  const handleChooseFile = async () => {
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
          contentInsetAdjustmentBehavior="automatic"
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
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => ({
                width: 40,
                height: 40,
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.overlay,
                borderWidth: 1,
                borderColor: theme.colors.border,
                opacity: pressed ? 0.86 : 1,
              })}
            >
              <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>←</Text>
            </Pressable>

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
              {course?.courseName ?? 'Course'}
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
                    {courseMeta || 'Mock course space for uploads and lecture review.'}
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
                  <Pressable
                    onPress={() => setShowUploadForm(true)}
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
                          borderWidth: 1,
                          borderColor: theme.colors.border,
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
                          style={({ pressed }) => ({
                            width: '48%',
                            minHeight: uploadPanelExpanded ? 156 : 122,
                            borderRadius: 18,
                            borderCurve: 'continuous',
                            padding: 14,
                            gap: 6,
                            backgroundColor: pressed ? theme.colors.card : theme.colors.overlay,
                            borderWidth: 1,
                            borderColor: theme.colors.border,
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
                              numberOfLines={1}
                              style={{
                                flex: 1,
                                color: theme.colors.text,
                                fontSize: 15,
                                fontWeight: '800',
                              }}
                            >
                              {upload.title}
                            </Text>
                            <Text
                              style={{
                                color: theme.colors.textSubtle,
                                fontSize: 12,
                                fontWeight: '700',
                              }}
                            >
                              {upload.addedAtLabel}
                            </Text>
                          </View>

                          <Text style={{ color: theme.colors.textMuted, fontSize: 13, lineHeight: 19 }}>
                            {upload.relation} • {upload.sourceLabel}
                          </Text>

                          {uploadPanelExpanded ? (
                            <Text style={{ color: theme.colors.textMuted, fontSize: 13, lineHeight: 19 }}>
                              {upload.description}
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
                          borderWidth: 1,
                          borderColor: theme.colors.border,
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
                            borderColor: theme.colors.border,
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
                        borderWidth: 1,
                        borderColor: theme.colors.border,
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
                          borderWidth: 1,
                          borderColor: theme.colors.border,
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
                        borderWidth: 1,
                        borderColor: theme.colors.border,
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
                    <Pressable
                      key={lecture.lectureId}
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
                        padding: 16,
                        gap: 8,
                        backgroundColor: pressed ? theme.colors.overlay : theme.colors.card,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
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
                            fontSize: 18,
                            lineHeight: 22,
                            fontWeight: '800',
                          }}
                        >
                          {lecture.title}
                        </Text>
                        <Text style={{ color: theme.colors.textSubtle, fontSize: 12, fontWeight: '700' }}>
                          {formatRelativeLectureTime(lecture.recordedAt)}
                        </Text>
                      </View>

                      <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 21 }}>
                        {buildLectureCardSubtitle(lecture)}
                      </Text>
                    </Pressable>
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
                        borderWidth: 1,
                        borderColor: theme.colors.border,
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

function buildLectureCardSubtitle(lecture: LocalLectureRecordingRecord) {
  const duration = formatDurationLabel(lecture.durationSeconds);

  if (lecture.uploadStatus === 'uploaded') {
    return `Saved locally • uploaded to API • ${duration}`;
  }

  if (lecture.lastError) {
    return `Saved locally • upload failed • ${duration}`;
  }

  return `Saved locally • upload pending • ${duration}`;
}

function mapCourseFileToCard(file: LocalCourseFileRecord): MockUpload {
  const sourceLabel = `${formatCourseFileSourceLabel(file)} • ${formatCourseFileTypeLabel(file)}`;

  return {
    id: file.id,
    title: file.title,
    relation: mapStoredRelationToUploadRelation(file.relationType),
    addedAtLabel: formatRelativeLectureTime(file.createdAt),
    description: buildCourseFileCardDescription(file),
    sourceLabel,
  };
}

function buildCourseFileCardDescription(file: LocalCourseFileRecord) {
  if (file.uploadStatus === 'uploaded') {
    return 'Saved locally and uploaded to API.';
  }

  if (file.lastError) {
    return 'Saved locally, sync failed.';
  }

  return 'Saved locally, waiting to upload.';
}

function formatCourseFileSourceLabel(file: LocalCourseFileRecord) {
  return file.sourceType === 'file' ? 'File' : 'Link';
}

function formatCourseFileTypeLabel(file: LocalCourseFileRecord) {
  if (file.fileExtension && file.fileExtension.length > 0) {
    return file.fileExtension.toUpperCase();
  }

  return 'FILE';
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

function mapStoredRelationToUploadRelation(value: CourseFileRelationType): UploadRelation {
  switch (value) {
    case 'lecture_file':
      return 'Lecture file';
    case 'module_file':
      return 'Module file';
    case 'chapter_file':
      return 'Chapter file';
    case 'notes':
      return 'Notes';
    case 'other':
      return 'Others';
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

function formatDurationLabel(durationSeconds: number) {
  const safeSeconds = Math.max(0, durationSeconds);
  const minutes = Math.floor(safeSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (safeSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
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
        borderWidth: 1,
        borderColor: theme.colors.border,
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
                borderWidth: 1,
                borderColor: selected ? theme.colors.accentBorder : theme.colors.border,
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
        borderWidth: 1,
        borderColor: theme.colors.border,
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
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.overlay,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.colors.text,
    fontSize: 15,
  };
}
