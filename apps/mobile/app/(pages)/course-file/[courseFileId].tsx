import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useAppTheme } from '../../../providers/settings-provider';
import {
  getCourseFile,
  type LocalCourseFileRecord,
} from '../../../services/course-files-repository';

type PreviewKind = 'image' | 'text' | 'unsupported';

export default function CourseFileDetailRoute() {
  const theme = useAppTheme();
  const params = useLocalSearchParams<{ courseFileId?: string }>();
  const [courseFile, setCourseFile] = useState<LocalCourseFileRecord | null>(null);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const loadCourseFile = async () => {
        setLoading(true);
        setTextPreview(null);

        const nextCourseFile = params.courseFileId
          ? await getCourseFile(params.courseFileId)
          : null;

        if (!cancelled) {
          setCourseFile(nextCourseFile);
        }

        if (nextCourseFile && getPreviewKind(nextCourseFile) === 'text') {
          try {
            const file = new File(nextCourseFile.localUri);
            const contents = await file.text();

            if (!cancelled) {
              setTextPreview(contents.slice(0, 12000));
            }
          } catch {
            if (!cancelled) {
              setTextPreview('Could not load a text preview for this local file.');
            }
          }
        }

        if (!cancelled) {
          setLoading(false);
        }
      };

      void loadCourseFile();

      return () => {
        cancelled = true;
      };
    }, [params.courseFileId])
  );

  const previewKind = courseFile ? getPreviewKind(courseFile) : 'unsupported';
  const hasLocalFile = Boolean(courseFile?.localUri);
  const syncLabel = !courseFile
    ? 'No file loaded'
    : courseFile.uploadStatus === 'uploaded' && courseFile.syncStatus === 'synced'
      ? 'Uploaded to API'
      : courseFile.lastError
        ? 'Saved locally, sync failed'
        : 'Saved locally, upload pending';

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.screen }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          flexGrow: 1,
          padding: 16,
          paddingBottom: 40,
          gap: 14,
          backgroundColor: theme.colors.screen,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingTop: 8,
            paddingBottom: 4,
            justifyContent: 'center',
          }}
        >
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({
              position: 'absolute',
              left: 0,
              width: 38,
              height: 38,
              borderRadius: 999,
              borderCurve: 'continuous',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.overlay,
              borderWidth: 1,
              borderColor: theme.colors.border,
              opacity: pressed ? 0.88 : 1,
            })}
          >
            <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>←</Text>
          </Pressable>

          <Text style={{ color: theme.colors.text, fontSize: 30, lineHeight: 36, fontWeight: '900' }}>
            File Review
          </Text>
        </View>

        <SectionCard theme={theme} title="Document">
          {loading ? (
            <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 24 }}>
              Loading saved document...
            </Text>
          ) : courseFile ? (
            <View style={{ gap: 12 }}>
              <Text style={{ color: theme.colors.text, fontSize: 20, lineHeight: 26, fontWeight: '900' }}>
                {courseFile.title}
              </Text>
              <KeyValueRow label="Status" value={syncLabel} theme={theme} />
              <KeyValueRow label="Relation" value={formatRelation(courseFile.relationType)} theme={theme} />
              <KeyValueRow label="File" value={courseFile.originalFilename} theme={theme} />
              <KeyValueRow label="Type" value={formatFileType(courseFile)} theme={theme} />
              <KeyValueRow label="Stored" value={courseFile.localUri} theme={theme} />
              {courseFile.description ? (
                <KeyValueRow label="Description" value={courseFile.description} theme={theme} />
              ) : null}
              {courseFile.objectPath ? (
                <KeyValueRow
                  label="Storage path"
                  value={`${courseFile.bucketName}/${courseFile.objectPath}`}
                  theme={theme}
                />
              ) : null}
            </View>
          ) : (
            <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 24 }}>
              No saved document found for this file.
            </Text>
          )}
        </SectionCard>

        {courseFile ? (
          <SectionCard theme={theme} title="Preview">
            {!hasLocalFile ? (
              <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 24 }}>
                This file record was restored from the backend, but the original file is not stored on
                this device yet.
              </Text>
            ) : null}

            {previewKind === 'image' && hasLocalFile ? (
              <Image
                source={{ uri: courseFile.localUri }}
                contentFit="contain"
                style={{
                  width: '100%',
                  minHeight: 360,
                  borderRadius: 20,
                  backgroundColor: theme.colors.overlay,
                }}
              />
            ) : null}

            {previewKind === 'text' && hasLocalFile ? (
              <View
                style={{
                  borderRadius: 20,
                  borderCurve: 'continuous',
                  padding: 16,
                  backgroundColor: theme.colors.overlay,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Text style={{ color: theme.colors.text, fontSize: 14, lineHeight: 22 }}>
                  {textPreview ?? 'Loading preview...'}
                </Text>
              </View>
            ) : null}

            {previewKind === 'unsupported' && hasLocalFile ? (
              <View style={{ gap: 12 }}>
                <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 24 }}>
                  Inline preview is available for images and text files. This document type can still
                  be opened from its local saved path.
                </Text>
                <Pressable
                  onPress={() => void Linking.openURL(courseFile.localUri)}
                  style={({ pressed }) => ({
                    minHeight: 52,
                    borderRadius: 16,
                    borderCurve: 'continuous',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: pressed ? theme.colors.accentMuted : theme.colors.accent,
                  })}
                >
                  <Text style={{ color: theme.colors.accentContrast, fontSize: 15, fontWeight: '900' }}>
                    Open File
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </SectionCard>
        ) : null}
      </ScrollView>
    </View>
  );
}

function getPreviewKind(file: LocalCourseFileRecord): PreviewKind {
  const mimeType = file.mimeType.toLowerCase();
  const extension = (file.fileExtension ?? '').toLowerCase();

  if (mimeType.startsWith('image/')) {
    return 'image';
  }

  if (
    mimeType.startsWith('text/') ||
    extension === 'txt' ||
    extension === 'md' ||
    extension === 'json' ||
    extension === 'csv'
  ) {
    return 'text';
  }

  return 'unsupported';
}

function formatRelation(value: LocalCourseFileRecord['relationType']) {
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
      return 'Other';
  }
}

function formatFileType(file: LocalCourseFileRecord) {
  if (file.fileExtension && file.fileExtension.length > 0) {
    return file.fileExtension.toUpperCase();
  }

  return file.mimeType;
}

function SectionCard({
  theme,
  title,
  children,
}: {
  theme: ReturnType<typeof useAppTheme>;
  title: string;
  children: ReactNode;
}) {
  return (
    <View
      style={{
        borderRadius: 24,
        borderCurve: 'continuous',
        padding: 18,
        gap: 14,
        backgroundColor: theme.colors.card,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>{title}</Text>
      {children}
    </View>
  );
}

function KeyValueRow({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof useAppTheme>;
}) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: theme.colors.textSubtle, fontSize: 12, fontWeight: '800', letterSpacing: 0.8 }}>
        {label.toUpperCase()}
      </Text>
      <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 22, fontWeight: '500' }}>
        {value}
      </Text>
    </View>
  );
}
