import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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

type UploadInputMode = 'file' | 'link';
type UploadFileType = 'pdf' | 'docx' | 'jpeg' | 'png';
type UploadRelation = 'Lecture file' | 'Module file' | 'Chapter file' | 'Notes' | 'Others';

type MockLecture = {
  id: string;
  title: string;
  subtitle: string;
  dateLabel: string;
};

type MockUpload = {
  id: string;
  title: string;
  relation: UploadRelation;
  fileType: UploadFileType;
  source: 'File' | 'Link';
  addedAtLabel: string;
  description: string;
};

const FILE_TYPES: UploadFileType[] = ['pdf', 'docx', 'jpeg', 'png'];
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
  const [fileType, setFileType] = useState<UploadFileType>('pdf');
  const [relation, setRelation] = useState<UploadRelation>('Lecture file');
  const [description, setDescription] = useState('');
  const [linkValue, setLinkValue] = useState('');
  const [uploadPanelExpanded, setUploadPanelExpanded] = useState(false);
  const [lecturesExpanded, setLecturesExpanded] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [mockUploads, setMockUploads] = useState<MockUpload[]>([]);

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

  const mockLectures = useMemo<MockLecture[]>(
    () =>
      course
        ? [
            {
              id: `${course.id}-lecture-1`,
              title: 'Lecture 01',
              subtitle: 'Entropy foundations, exam cues, and summary highlights',
              dateLabel: '2h ago',
            },
            {
              id: `${course.id}-lecture-2`,
              title: 'Lecture 02',
              subtitle: 'Worked examples and clarification notes',
              dateLabel: 'Yesterday',
            },
            {
              id: `${course.id}-lecture-3`,
              title: 'Review Session',
              subtitle: 'Midterm topics, key formulas, and discussion recap',
              dateLabel: '2d ago',
            },
            {
              id: `${course.id}-lecture-4`,
              title: 'Lecture 03',
              subtitle: 'Applications, guided examples, and quick concept checks',
              dateLabel: '3d ago',
            },
            {
              id: `${course.id}-lecture-5`,
              title: 'Lecture 04',
              subtitle: 'Problem-solving walkthrough and class discussion highlights',
              dateLabel: '5d ago',
            },
            {
              id: `${course.id}-lecture-6`,
              title: 'Exam Prep',
              subtitle: 'Collected review topics, likely question areas, and reminders',
              dateLabel: '1w ago',
            },
          ]
        : [],
    [course]
  );

  useEffect(() => {
    if (!course) {
      setMockUploads([]);
      return;
    }

    setMockUploads([
      {
        id: `${course.id}-upload-1`,
        title: `${course.courseCode || course.courseName} Week 4 Slides`,
        relation: 'Lecture file',
        fileType: 'pdf',
        source: 'File',
        addedAtLabel: '2h ago',
        description: 'Lecture deck covering entropy examples and review prompts.',
      },
      {
        id: `${course.id}-upload-2`,
        title: `${course.courseCode || course.courseName} Chapter 3 Notes`,
        relation: 'Notes',
        fileType: 'docx',
        source: 'File',
        addedAtLabel: 'Yesterday',
        description: 'Condensed notes from the assigned reading and class annotations.',
      },
      {
        id: `${course.id}-upload-3`,
        title: `${course.courseCode || course.courseName} Module Reference`,
        relation: 'Module file',
        fileType: 'png',
        source: 'Link',
        addedAtLabel: '2d ago',
        description: 'Shared board snapshot and reference link for the current module.',
      },
      {
        id: `${course.id}-upload-4`,
        title: `${course.courseCode || course.courseName} Lab Outline`,
        relation: 'Chapter file',
        fileType: 'pdf',
        source: 'File',
        addedAtLabel: '3d ago',
        description: 'Outline for the next lab and prep tasks tied to this chapter.',
      },
      {
        id: `${course.id}-upload-5`,
        title: `${course.courseCode || course.courseName} Formula Sheet`,
        relation: 'Notes',
        fileType: 'jpeg',
        source: 'File',
        addedAtLabel: '5d ago',
        description: 'Photo capture of the in-class formula board and margin notes.',
      },
      {
        id: `${course.id}-upload-6`,
        title: `${course.courseCode || course.courseName} Reading Link`,
        relation: 'Others',
        fileType: 'docx',
        source: 'Link',
        addedAtLabel: '1w ago',
        description: 'External reference link for background reading before next lecture.',
      },
    ]);
    setUploadPanelExpanded(false);
    setShowUploadForm(false);
    setUploadMode('file');
    setFileType('pdf');
    setRelation('Lecture file');
    setDescription('');
    setLinkValue('');
  }, [course]);

  const courseMeta = course
    ? [course.semester, course.section ? `Section ${course.section}` : '', course.instructorName]
        .filter(Boolean)
        .join(' • ')
    : '';
  const latestUploads = mockUploads.slice(0, uploadPanelExpanded ? 6 : 4);

  const handleSaveMockUpload = () => {
    const nextUpload: MockUpload = {
      id: `${courseId ?? 'course'}-upload-${Date.now()}`,
      title:
        uploadMode === 'link'
          ? linkValue.trim() || 'Untitled linked material'
          : `${relation} ${fileType.toUpperCase()} upload`,
      relation,
      fileType,
      source: uploadMode === 'link' ? 'Link' : 'File',
      addedAtLabel: 'Just now',
      description: description.trim() || 'No description added yet.',
    };

    setMockUploads((current) => [nextUpload, ...current]);
    setShowUploadForm(false);
    setUploadPanelExpanded(true);
    setUploadMode('file');
    setFileType('pdf');
    setRelation('Lecture file');
    setDescription('');
    setLinkValue('');
    Alert.alert('Mock upload saved', 'The new mock file was added to the recent uploads list.');
  };
  const visibleLectures = mockLectures.slice(0, lecturesExpanded ? 6 : 3);

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
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                      {latestUploads.map((upload) => (
                        <View
                          key={upload.id}
                          style={{
                            width: '48%',
                            minHeight: uploadPanelExpanded ? 156 : 122,
                            borderRadius: 18,
                            borderCurve: 'continuous',
                            padding: 14,
                            gap: 6,
                            backgroundColor: theme.colors.overlay,
                            borderWidth: 1,
                            borderColor: theme.colors.border,
                          }}
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
                            {upload.relation} • {upload.source} • {upload.fileType.toUpperCase()}
                          </Text>

                          {uploadPanelExpanded ? (
                            <Text style={{ color: theme.colors.textMuted, fontSize: 13, lineHeight: 19 }}>
                              {upload.description}
                            </Text>
                          ) : null}
                        </View>
                      ))}
                    </View>

                    {mockUploads.length > 4 ? (
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
                      title="File type"
                      options={FILE_TYPES.map((type) => ({
                        label: type.toUpperCase(),
                        value: type,
                      }))}
                      selectedValue={fileType}
                      onSelect={(value) => setFileType(value as UploadFileType)}
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
                            Mock file chooser
                          </Text>
                          <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 }}>
                            Selected type: {fileType.toUpperCase()}. Hook this up to the real picker later.
                          </Text>
                          <Pressable
                            onPress={() => {
                              Alert.alert('Mock picker', 'Connect this button to the real document picker.');
                            }}
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
                              Choose mock file
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
                          ? `Link • ${relation} • ${fileType.toUpperCase()}`
                          : `File • ${relation} • ${fileType.toUpperCase()}`}
                      </Text>
                      <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 }}>
                        {description.trim() || 'Add a short note so teammates know what this material is.'}
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <Pressable
                        onPress={() => setShowUploadForm(false)}
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
                        onPress={handleSaveMockUpload}
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
                          Save Mock Upload
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
                  {visibleLectures.map((lecture) => (
                    <Pressable
                      key={lecture.id}
                      onPress={() => router.push('/recording-results-page')}
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
                          {lecture.dateLabel}
                        </Text>
                      </View>

                      <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 21 }}>
                        {lecture.subtitle}
                      </Text>
                    </Pressable>
                  ))}

                  {mockLectures.length > 3 ? (
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
