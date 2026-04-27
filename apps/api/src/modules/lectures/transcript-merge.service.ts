import {
  buildSpeakerSeparatedTranscriptText,
  calculateAverageConfidence,
  estimateTranscriptTokenCount,
  normalizeTranscriptionSegments,
  type RawDiarizedTranscription,
  type TranscriptionSegment,
} from './audio-transcription.service.js';

export type ChunkTranscriptSource = {
  chunkIndex: number;
  durationSeconds: number | null;
  rawDiarizedJson: RawDiarizedTranscription;
};

export type MergedLectureTranscript = {
  fullText: string;
  confidenceAvg: number | null;
  totalSegments: number;
  totalTokensEstimate: number;
  segments: TranscriptionSegment[];
};

export function mergeChunkTranscriptions(chunks: ChunkTranscriptSource[]): MergedLectureTranscript {
  const orderedChunks = chunks.slice().sort((left, right) => left.chunkIndex - right.chunkIndex);
  const mergedSegments: TranscriptionSegment[] = [];
  let offsetSeconds = 0;

  for (const chunk of orderedChunks) {
    const chunkSegments = normalizeTranscriptionSegments(chunk.rawDiarizedJson);

    mergedSegments.push(
      ...chunkSegments.map((segment, index) => ({
        ...segment,
        segmentIndex: mergedSegments.length + index,
        startTimeSeconds:
          segment.startTimeSeconds == null ? null : roundTimelineValue(segment.startTimeSeconds + offsetSeconds),
        endTimeSeconds:
          segment.endTimeSeconds == null ? null : roundTimelineValue(segment.endTimeSeconds + offsetSeconds),
      }))
    );

    offsetSeconds += resolveChunkDurationSeconds(chunk.durationSeconds, chunkSegments);
  }

  const fullText = buildSpeakerSeparatedTranscriptText(mergedSegments, '');

  return {
    fullText,
    confidenceAvg: calculateAverageConfidence(mergedSegments),
    totalSegments: mergedSegments.length,
    totalTokensEstimate: estimateTranscriptTokenCount(fullText),
    segments: mergedSegments,
  };
}

function resolveChunkDurationSeconds(
  storedDurationSeconds: number | null,
  chunkSegments: TranscriptionSegment[]
) {
  if (storedDurationSeconds != null && Number.isFinite(storedDurationSeconds) && storedDurationSeconds > 0) {
    return storedDurationSeconds;
  }

  const inferredEndTime = chunkSegments.reduce<number>((maxEndTime, segment) => {
    if (segment.endTimeSeconds == null || !Number.isFinite(segment.endTimeSeconds)) {
      return maxEndTime;
    }

    return Math.max(maxEndTime, segment.endTimeSeconds);
  }, 0);

  return inferredEndTime;
}

function roundTimelineValue(value: number) {
  return Math.round(value * 1000) / 1000;
}
