import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useAuth } from '../../providers/auth-provider';
import { useAppTheme } from '../../providers/settings-provider';
import {
  ensureLectureAudioDownloadedForCache,
  getLatestLectureRecording,
  getLectureRecording,
  processLectureTranscriptionForCache,
  refreshLectureRecordingFromApiForCache,
  type LocalLectureRecordingRecord,
} from '../../services/recordings-repository';
import { logMobileError } from '../../services/error-monitor';

const TRANSCRIPT_PREVIEW_CHAR_COUNT = 900;
const TRANSCRIPT_PREVIEW_LINE_COUNT = 10;

export default function RecordingResultsRoute() {
  const theme = useAppTheme();
  const auth = useAuth();
  const params = useLocalSearchParams<{ lectureId?: string }>();
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [transcriptExpanded, setTranscriptExpanded] = useState(true);
  const [transcriptTextExpanded, setTranscriptTextExpanded] = useState(false);
  const [recording, setRecording] = useState<LocalLectureRecordingRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [audioDownloadLoading, setAudioDownloadLoading] = useState(false);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [transcriptNotice, setTranscriptNotice] = useState<string | null>(null);
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
  const transcriptPending = Boolean(
    recording &&
      recording.uploadStatus === 'uploaded' &&
      recording.syncStatus === 'synced' &&
      (!recording.transcript ||
        recording.transcript.status !== 'ready' ||
        !recording.transcript.fullText ||
        !hasCanonicalSpeakerLabels(recording.transcript.fullText))
  );
  const transcriptFullText = recording?.transcript?.fullText ?? null;
  const shouldClampTranscript = Boolean(
    transcriptFullText && transcriptFullText.length > TRANSCRIPT_PREVIEW_CHAR_COUNT
  );

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
    setTranscriptTextExpanded(false);
  }, [recording?.lectureId]);

  useEffect(() => {
    const lectureId = recording?.lectureId;
    const user = auth.user;

    if (
      loading ||
      !lectureId ||
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
    recording?.objectPath,
    recording?.syncStatus,
    recording?.uploadStatus,
  ]);

  const handlePlayRecording = useCallback(async () => {
    if (!recording) {
      return;
    }

    if (!hasLocalRecordingFile) {
      if (
        !auth.user ||
        !recording.objectPath ||
        recording.uploadStatus !== 'uploaded' ||
        recording.syncStatus !== 'synced' ||
        audioDownloadLoading
      ) {
        return;
      }

      setAudioDownloadLoading(true);

      try {
        const accessToken = await auth.getValidAccessToken();

        if (!accessToken) {
          throw new Error('Your session expired. Please sign in again.');
        }

        const updatedRecording = await ensureLectureAudioDownloadedForCache(
          auth.user,
          recording.lectureId,
          accessToken
        );

        if (!updatedRecording?.localUri) {
          throw new Error('Recording download is still unavailable. Please try again.');
        }

        setRecording(updatedRecording);
      } catch (error) {
        logMobileError(error, {
          source: 'recording-results.download-audio-on-demand',
          extra: { lectureId: recording.lectureId, userId: auth.user?.id ?? null },
        });
        Alert.alert(
          'Could not download recording',
          error instanceof Error ? error.message : 'Please try again.'
        );
      } finally {
        setAudioDownloadLoading(false);
      }

      return;
    }

    if (playerStatus.playing) {
      player.pause();
      return;
    }

    player.play();
  }, [
    audioDownloadLoading,
    auth,
    hasLocalRecordingFile,
    player,
    playerStatus.playing,
    recording,
  ]);

  useEffect(() => {
    const lectureId = recording?.lectureId;
    const user = auth.user;

    if (
      loading ||
      !lectureId ||
      !user ||
      !transcriptPending ||
      processingTranscriptLectureIdRef.current === lectureId ||
      transcriptError
    ) {
      return;
    }

    let cancelled = false;

    const processTranscript = async () => {
      processingTranscriptLectureIdRef.current = lectureId;
      setTranscriptError(null);
      setTranscriptNotice(null);
      setTranscriptLoading(true);
      let pollBackendStatusOnly = false;

      try {
        while (!cancelled) {
          const accessToken = await auth.getValidAccessToken();

          if (!accessToken) {
            throw new Error('Your session expired before transcription could start.');
          }

          if (pollBackendStatusOnly) {
            const refreshedRecording = await refreshLectureRecordingFromApiForCache(
              user,
              lectureId,
              accessToken
            );

            if (cancelled) {
              return;
            }

            setRecording(refreshedRecording);

            if (
              refreshedRecording?.transcript?.status === 'ready' &&
              hasCanonicalSpeakerLabels(refreshedRecording.transcript.fullText)
            ) {
              setTranscriptNotice(null);
              return;
            }

            setTranscriptNotice(
              'Your file is still being processed in the backend. Large recordings can take several minutes. The transcript will appear here as soon as processing finishes.'
            );
            await wait(15000);
            continue;
          }

          try {
            const updatedRecording = await processLectureTranscriptionForCache(
              lectureId,
              accessToken
            );

            if (cancelled) {
              return;
            }

            setRecording(updatedRecording);

            if (
              updatedRecording?.transcript?.status === 'ready' &&
              hasCanonicalSpeakerLabels(updatedRecording.transcript.fullText)
            ) {
              setTranscriptNotice(null);
              return;
            }
          } catch (error) {
            if (isBackendProcessingTimeoutError(error)) {
              const refreshedRecording = await refreshLectureRecordingFromApiForCache(
                user,
                lectureId,
                accessToken
              );

              if (cancelled) {
                return;
              }

              setRecording(refreshedRecording);
              setTranscriptNotice(
                'Your file is still being processed in the backend. Large recordings can take several minutes. The transcript will appear here as soon as processing finishes.'
              );
              pollBackendStatusOnly = true;
              await wait(15000);
              continue;
            }

            if (!isPendingTranscriptError(error)) {
              throw error;
            }
          }

          await wait(3000);
        }
      } catch (error) {
        logMobileError(error, {
          source: 'recording-results.process-transcript',
          extra: { lectureId, userId: user.id },
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
    auth.user,
    loading,
    recording?.lectureId,
    recording?.syncStatus,
    recording?.transcript?.status,
    recording?.transcript?.fullText,
    recording?.uploadStatus,
    transcriptPending,
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
                disabled={audioDownloadLoading}
                onPress={() => {
                  void handlePlayRecording();
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
                  opacity: audioDownloadLoading ? 0.72 : pressed ? 0.9 : 1,
                })}
              >
                <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '900' }}>
                  {audioDownloadLoading
                    ? 'Downloading recording...'
                    : !hasLocalRecordingFile
                    ? 'Download Recording'
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
          {transcriptLoading || (transcriptPending && !transcriptError) ? (
            <TranscriptLoadingState theme={theme} notice={transcriptNotice} />
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
                numberOfLines={shouldClampTranscript && !transcriptTextExpanded ? TRANSCRIPT_PREVIEW_LINE_COUNT : undefined}
                style={{
                  color: theme.colors.text,
                  fontSize: 15,
                  lineHeight: 25,
                  fontWeight: '500',
                }}
              >
                {transcriptFullText}
              </Text>
              {shouldClampTranscript ? (
                <Pressable
                  onPress={() => setTranscriptTextExpanded((current) => !current)}
                  style={({ pressed }) => ({
                    alignSelf: 'flex-start',
                    minHeight: 38,
                    borderRadius: 999,
                    paddingHorizontal: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: pressed ? theme.colors.overlay : theme.colors.cardMuted,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  })}
                >
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontSize: 13,
                      fontWeight: '800',
                    }}
                  >
                    {transcriptTextExpanded ? 'Show less' : 'Show more'}
                  </Text>
                </Pressable>
              ) : null}
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

function TranscriptLoadingState({
  theme,
  notice,
}: {
  theme: ReturnType<typeof useAppTheme>;
  notice?: string | null;
}) {
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
        {notice ? 'Processing in backend' : 'Processing transcript'}
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
        {notice ?? 'Separating speakers and building the transcript paragraphs.'}
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

function isPendingTranscriptError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return (
    message.includes('still uploading or transcribing') ||
    message.includes('not available for download yet') ||
    message.includes('no completed chunk transcriptions')
  );
}

function isBackendProcessingTimeoutError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return message.includes('request timed out');
}

function wait(durationMs: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
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
