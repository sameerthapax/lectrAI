import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { NativeBackButton } from '../../components/ui/native-back-button';
import { useAuth } from '../../providers/auth-provider';
import { useAppTheme } from '../../providers/settings-provider';
import {
  ensureLectureAudioDownloadedForCache,
  getLatestLectureRecording,
  getLectureRecording,
  processLectureTranscriptionForCache,
  type LocalLectureRecordingRecord,
} from '../../services/recordings-repository';
import { logMobileError } from '../../services/error-monitor';

export default function RecordingResultsRoute() {
  const theme = useAppTheme();
  const auth = useAuth();
  const params = useLocalSearchParams<{ lectureId?: string }>();
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [transcriptExpanded, setTranscriptExpanded] = useState(true);
  const [recording, setRecording] = useState<LocalLectureRecordingRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [audioDownloadLoading, setAudioDownloadLoading] = useState(false);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const downloadingAudioLectureIdRef = useRef<string | null>(null);
  const processingTranscriptLectureIdRef = useRef<string | null>(null);
  const player = useAudioPlayer(recording?.localUri ?? null, { updateInterval: 250 });
  const playerStatus = useAudioPlayerStatus(player);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const loadRecording = async () => {
        try {
          setLoading(true);

          const nextRecording = params.lectureId
            ? await getLectureRecording(params.lectureId)
            : await getLatestLectureRecording();

          if (!cancelled) {
            setRecording(nextRecording);
            setLoading(false);
          }
        } catch (error) {
          logMobileError(error, {
            source: 'recording-results.load-recording',
            extra: { lectureId: params.lectureId ?? null },
          });

          if (!cancelled) {
            setRecording(null);
            setLoading(false);
          }
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

  useEffect(() => {
    const lectureId = recording?.lectureId;
    const user = auth.user;

    if (
      loading ||
      !lectureId ||
      !recording ||
      !user ||
      recording.localUri.length > 0 ||
      !recording.objectPath ||
      recording.uploadStatus !== 'uploaded' ||
      recording.syncStatus !== 'synced' ||
      downloadingAudioLectureIdRef.current === lectureId
    ) {
      return;
    }

    let cancelled = false;

    const downloadAudio = async () => {
      downloadingAudioLectureIdRef.current = lectureId;
      setAudioDownloadLoading(true);

      try {
        const accessToken = await auth.getValidAccessToken();

        if (!accessToken) {
          return;
        }

        const updatedRecording = await ensureLectureAudioDownloadedForCache(
          user,
          lectureId,
          accessToken
        );

        if (!cancelled && updatedRecording) {
          setRecording(updatedRecording);
        }
      } catch (error) {
        logMobileError(error, {
          source: 'recording-results.download-audio',
          extra: { lectureId, userId: user.id },
        });
      } finally {
        if (downloadingAudioLectureIdRef.current === lectureId) {
          downloadingAudioLectureIdRef.current = null;
        }

        if (!cancelled) {
          setAudioDownloadLoading(false);
        }
      }
    };

    void downloadAudio();

    return () => {
      cancelled = true;
    };
  }, [
    auth,
    auth.user,
    loading,
    recording?.lectureId,
    recording?.localUri,
    recording?.syncStatus,
    recording?.uploadStatus,
  ]);

  useEffect(() => {
    const lectureId = recording?.lectureId;

    if (
      loading ||
      !lectureId ||
      !recording ||
      (recording.transcript?.status === 'ready' && hasCanonicalSpeakerLabels(recording.transcript.fullText)) ||
      recording.uploadStatus !== 'uploaded' ||
      recording.syncStatus !== 'synced' ||
      processingTranscriptLectureIdRef.current === lectureId ||
      transcriptError
    ) {
      return;
    }

    let cancelled = false;

    const processTranscript = async () => {
      processingTranscriptLectureIdRef.current = lectureId;
      setTranscriptError(null);
      setTranscriptLoading(true);

      try {
        const accessToken = await auth.getValidAccessToken();

        if (!accessToken) {
          throw new Error('Your session expired before transcription could start.');
        }

        const updatedRecording = await processLectureTranscriptionForCache(
          lectureId,
          accessToken
        );

        if (!cancelled) {
          setRecording(updatedRecording);
        }
      } catch (error) {
        logMobileError(error, {
          source: 'recording-results.process-transcript',
          extra: { lectureId },
        });
        if (!cancelled) {
          setTranscriptError(
            error instanceof Error ? error.message : 'Unable to process the transcript.'
          );
        }
      } finally {
        if (processingTranscriptLectureIdRef.current === lectureId) {
          processingTranscriptLectureIdRef.current = null;
        }

        if (!cancelled) {
          setTranscriptLoading(false);
        }
      }
    };

    void processTranscript();

    return () => {
      cancelled = true;
    };
  }, [
    auth,
    loading,
    recording?.lectureId,
    recording?.syncStatus,
    recording?.transcript?.status,
    recording?.uploadStatus,
    transcriptError,
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.screen }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: theme.colors.screen }}
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
          <View style={{ position: 'absolute', left: 0 }}>
            <NativeBackButton theme={theme} onPress={() => router.back()} />
          </View>

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
              {!recording.localUri && !recording.objectPath ? (
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontSize: 13,
                    lineHeight: 18,
                  }}
                >
                  Captured as upload chunks. Full-device playback is not available here yet, but transcript processing will continue.
                </Text>
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
                  {audioDownloadLoading
                    ? 'Downloading recording...'
                    : !hasLocalRecordingFile
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
          title="Transcript"
          expanded={transcriptExpanded}
          onToggle={() => setTranscriptExpanded((current) => !current)}
        >
          {transcriptLoading ? (
            <TranscriptLoadingState theme={theme} />
          ) : recording?.transcript?.status === 'ready' &&
            recording.transcript.fullText &&
            hasCanonicalSpeakerLabels(recording.transcript.fullText) ? (
            <>
              <KeyValueRow
                label="Model"
                value={recording.transcript.modelName ?? 'OpenAI transcription'}
                theme={theme}
              />
              <Text
                style={{
                  color: theme.colors.text,
                  fontSize: 15,
                  lineHeight: 25,
                  fontWeight: '500',
                }}
              >
                {recording.transcript.fullText}
              </Text>
            </>
          ) : transcriptError ? (
            <>
              <Text style={{ color: '#b91c1c', fontSize: 14, lineHeight: 22, fontWeight: '700' }}>
                {transcriptError}
              </Text>
              <Pressable
                onPress={() => {
                  setTranscriptError(null);
                  setRecording((current) => (current ? { ...current, transcript: null } : current));
                }}
                style={({ pressed }) => ({
                  minHeight: 48,
                  borderRadius: 16,
                  borderCurve: 'continuous',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.overlay,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '900' }}>
                  Try Again
                </Text>
              </Pressable>
            </>
          ) : (
            <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 25, fontWeight: '500' }}>
              Transcript processing will start after the recording is uploaded.
            </Text>
          )}
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

function TranscriptLoadingState({ theme }: { theme: ReturnType<typeof useAppTheme> }) {
  return (
    <View
      style={{
        minHeight: 170,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        borderRadius: 18,
        borderCurve: 'continuous',
        backgroundColor: theme.colors.overlay,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <ActivityIndicator size="large" color={theme.colors.accent} />
      <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900' }}>
        Processing transcript
      </Text>
      <Text
        style={{
          maxWidth: 260,
          color: theme.colors.textMuted,
          fontSize: 14,
          lineHeight: 21,
          fontWeight: '500',
          textAlign: 'center',
        }}
      >
        Separating speakers and building the transcript paragraphs.
      </Text>
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

function hasCanonicalSpeakerLabels(fullText: string | null) {
  if (!fullText) {
    return false;
  }

  return /^(Professor|Student [A-Z]|Unknown Speaker [A-Z]):\s+/m.test(fullText);
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
