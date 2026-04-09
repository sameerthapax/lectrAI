import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useAppTheme } from '../../providers/settings-provider';
import {
  getLatestLectureRecording,
  getLectureRecording,
  type LocalLectureRecordingRecord,
} from '../../services/recordings-repository';

export default function RecordingResultsRoute() {
  const theme = useAppTheme();
  const params = useLocalSearchParams<{ lectureId?: string }>();
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [transcriptExpanded, setTranscriptExpanded] = useState(true);
  const [recording, setRecording] = useState<LocalLectureRecordingRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const player = useAudioPlayer(recording?.localUri ?? null, { updateInterval: 250 });
  const playerStatus = useAudioPlayerStatus(player);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const loadRecording = async () => {
        setLoading(true);

        const nextRecording = params.lectureId
          ? await getLectureRecording(params.lectureId)
          : await getLatestLectureRecording();

        if (!cancelled) {
          setRecording(nextRecording);
          setLoading(false);
        }
      };

      void loadRecording();

      return () => {
        cancelled = true;
      };
    }, [params.lectureId])
  );

  const syncLabel = !recording
    ? 'No recording loaded'
    : recording.uploadStatus === 'uploaded' && recording.syncStatus === 'synced'
      ? 'Uploaded to API'
      : recording.lastError
        ? 'Saved locally, upload failed'
        : 'Saved locally, upload pending';
  const hasLocalRecordingFile = Boolean(recording?.localUri);

  useEffect(() => {
    void setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    });
  }, []);

  useEffect(() => {
    if (!recording?.localUri) {
      return;
    }

    player.replace(recording.localUri);
  }, [player, recording?.localUri]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.screen }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          flexGrow: 1,
          padding: 16,
          paddingBottom: 120,
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
            Lecture Review
          </Text>
        </View>

        <NotionSection
          theme={theme}
          title="Recording"
          expanded={summaryExpanded}
          onToggle={() => setSummaryExpanded((current) => !current)}
        >
          {loading ? (
            <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 25, fontWeight: '500' }}>
              Loading saved recording...
            </Text>
          ) : recording ? (
            <>
              <Text style={{ color: theme.colors.text, fontSize: 18, lineHeight: 24, fontWeight: '800' }}>
                {recording.title}
              </Text>
              <KeyValueRow label="Status" value={syncLabel} theme={theme} />
              <KeyValueRow
                label="Duration"
                value={formatDuration(recording.durationSeconds)}
                theme={theme}
              />
              <KeyValueRow label="File" value={recording.originalFilename} theme={theme} />
              <KeyValueRow label="Stored" value={recording.localUri} theme={theme} />
              {recording.objectPath ? (
                <KeyValueRow
                  label="Storage path"
                  value={`${recording.bucketName}/${recording.objectPath}`}
                  theme={theme}
                />
              ) : null}
              <Pressable
                disabled={!hasLocalRecordingFile}
                onPress={() => {
                  if (!hasLocalRecordingFile) {
                    return;
                  }

                  if (playerStatus.playing) {
                    player.pause();
                    return;
                  }

                  player.play();
                }}
                style={({ pressed }) => ({
                  minHeight: 52,
                  borderRadius: 16,
                  borderCurve: 'continuous',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.overlay,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  opacity: !hasLocalRecordingFile ? 0.55 : pressed ? 0.9 : 1,
                })}
              >
                <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '900' }}>
                  {!hasLocalRecordingFile
                    ? 'Recording file is not stored on this device'
                    : playerStatus.playing
                    ? `Pause ${formatDuration(Math.round(playerStatus.currentTime))}`
                    : 'Play Recording'}
                </Text>
              </Pressable>
              {recording.lastError ? (
                <Text
                  style={{ color: '#b91c1c', fontSize: 14, lineHeight: 22, fontWeight: '600' }}
                >
                  {recording.lastError}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 25, fontWeight: '500' }}>
              No saved recording found yet.
            </Text>
          )}
        </NotionSection>

        <NotionSection
          theme={theme}
          title="Next Step"
          expanded={transcriptExpanded}
          onToggle={() => setTranscriptExpanded((current) => !current)}
        >
          <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 25, fontWeight: '500' }}>
            The recording is written into app storage first, then uploaded to the API. The backend
            stores the file, creates the lecture graph, and queues a placeholder processing job so the
            next backend pass can attach real transcription and downstream processing.
          </Text>
        </NotionSection>
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 22,
          borderRadius: 24,
          borderCurve: 'continuous',
          padding: 12,
          backgroundColor: theme.colors.card,
          borderWidth: 1,
          borderColor: theme.colors.border,
          boxShadow: '0 18px 36px rgba(15, 23, 42, 0.12)',
        }}
      >
        <Pressable
          onPress={() => {
            Alert.alert('Coming soon', 'Quiz generation is coming soon.');
          }}
          style={({ pressed }) => ({
            minHeight: 56,
            borderRadius: 18,
            borderCurve: 'continuous',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.accent,
            opacity: pressed ? 0.92 : 1,
          })}
        >
          <Text style={{ color: theme.colors.accentContrast, fontSize: 16, fontWeight: '900' }}>
            Generate Quiz
          </Text>
        </Pressable>
      </View>
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

function formatDuration(durationSeconds: number) {
  const minutes = Math.floor(durationSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (durationSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function NotionSection({
  title,
  expanded,
  onToggle,
  children,
  theme,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  theme: ReturnType<typeof useAppTheme>;
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
        boxShadow: '0 16px 28px rgba(15, 23, 42, 0.08)',
      }}
    >
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          opacity: pressed ? 0.88 : 1,
        })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ color: theme.colors.text, fontSize: 24, lineHeight: 30, fontWeight: '900' }}>
            {title}
          </Text>
        </View>

        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: expanded ? theme.colors.accentSoft : theme.colors.neutralSoft,
            borderWidth: 1,
            borderColor: expanded ? theme.colors.accentBorder : theme.colors.neutralBorder,
          }}
        >
          <Text
            style={{
              color: expanded ? theme.colors.accent : theme.colors.textMuted,
              fontSize: 18,
              fontWeight: '900',
            }}
          >
            {expanded ? '⌃' : '⌄'}
          </Text>
        </View>
      </Pressable>

      {expanded ? <View style={{ gap: 14 }}>{children}</View> : null}
    </View>
  );
}
