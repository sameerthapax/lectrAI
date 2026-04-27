import { HttpError } from '../../lib/http-error.js';

const OPENAI_TRANSCRIPTIONS_URL = 'https://api.openai.com/v1/audio/transcriptions';
const DEFAULT_TRANSCRIPTION_MODEL = 'gpt-4o-transcribe-diarize';
const OPENAI_AUDIO_FILE_LIMIT_BYTES = 25 * 1024 * 1024;
const TRANSCRIPTION_LOG_PREFIX = '[ transcription ]';

export type TranscriptionSegment = {
  segmentIndex: number;
  startTimeSeconds: number | null;
  endTimeSeconds: number | null;
  rawText: string;
  cleanedText: string;
  speakerLabel: string;
  confidenceScore: number | null;
  tokenCountEstimate: number;
};

export type AudioTranscriptionResult = {
  providerName: 'openai';
  modelName: string;
  languageCode: string | null;
  fullText: string;
  confidenceAvg: number | null;
  totalSegments: number;
  totalTokensEstimate: number;
  rawResponse: unknown;
  segments: TranscriptionSegment[];
};

type OpenAiDiarizedSegment = {
  text?: unknown;
  speaker?: unknown;
  start?: unknown;
  end?: unknown;
  confidence?: unknown;
};

export type RawDiarizedTranscription = {
  text?: unknown;
  language?: unknown;
  segments?: unknown;
};

export async function transcribeLectureAudio(input: {
  audioBytes: Buffer;
  mimeType: string;
  filename: string;
}): Promise<AudioTranscriptionResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new HttpError(500, 'Missing OpenAI API key. Set OPENAI_API_KEY for audio transcription.');
  }

  if (input.audioBytes.byteLength > OPENAI_AUDIO_FILE_LIMIT_BYTES) {
    throw new HttpError(
      413,
      'Recording is too large to transcribe in one request.',
      'OpenAI audio transcription uploads are limited to 25 MB.'
    );
  }

  const modelName = process.env.OPENAI_TRANSCRIPTION_MODEL ?? DEFAULT_TRANSCRIPTION_MODEL;
  const formData = new FormData();
  formData.set('file', new Blob([input.audioBytes], { type: input.mimeType }), input.filename);
  formData.set('model', modelName);
  formData.set('response_format', 'diarized_json');
  formData.set('chunking_strategy', 'auto');

  console.log(`${TRANSCRIPTION_LOG_PREFIX} Calling OpenAI audio transcription API.`, {
    modelName,
    filename: input.filename,
    mimeType: input.mimeType,
    bytes: input.audioBytes.byteLength,
    responseFormat: 'diarized_json',
    chunkingStrategy: 'auto',
  });

  const response = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  console.log(`${TRANSCRIPTION_LOG_PREFIX} OpenAI transcription API responded.`, {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
  });

  if (!response.ok) {
    const errorDetails = await readOpenAiErrorDetails(response);

    console.error(`${TRANSCRIPTION_LOG_PREFIX} OpenAI transcription API error response.`, {
      status: response.status,
      statusText: response.statusText,
      errorDetails,
    });

    throw new HttpError(502, 'OpenAI transcription failed.', errorDetails);
  }

  const rawResponse = (await response.json()) as RawDiarizedTranscription;
  const segments = normalizeTranscriptionSegments(rawResponse);
  const fullText = buildSpeakerSeparatedTranscriptText(segments, rawResponse.text);

  console.log(`${TRANSCRIPTION_LOG_PREFIX} OpenAI transcription response normalized.`, {
    languageCode: typeof rawResponse.language === 'string' ? rawResponse.language : null,
    totalSegments: segments.length,
    confidenceAvg: calculateAverageConfidence(segments),
    rawResponsePreview: buildLogPreview(rawResponse),
    fullTextPreview: buildLogPreview(fullText),
  });

  return {
    providerName: 'openai',
    modelName,
    languageCode: typeof rawResponse.language === 'string' ? rawResponse.language : null,
    fullText,
    confidenceAvg: calculateAverageConfidence(segments),
    totalSegments: segments.length,
    totalTokensEstimate: estimateTranscriptTokenCount(fullText),
    rawResponse,
    segments,
  };
}

async function readOpenAiErrorDetails(response: Response) {
  try {
    return await response.json();
  } catch {
    return await response.text().catch(() => response.statusText);
  }
}

export function normalizeTranscriptionSegments(response: RawDiarizedTranscription): TranscriptionSegment[] {
  const rawSegments = Array.isArray(response.segments) ? response.segments : [];
  const segments = rawSegments
    .map((segment, index) => normalizeSegment(segment as OpenAiDiarizedSegment, index))
    .filter((segment) => segment.cleanedText.length > 0);

  if (segments.length > 0) {
    return segments;
  }

  const fallbackText = typeof response.text === 'string' ? response.text.trim() : '';

  if (!fallbackText) {
    return [];
  }

  return [
    {
      segmentIndex: 0,
      startTimeSeconds: null,
      endTimeSeconds: null,
      rawText: fallbackText,
      cleanedText: fallbackText,
      speakerLabel: 'Speaker 1',
      confidenceScore: null,
      tokenCountEstimate: estimateTranscriptTokenCount(fallbackText),
    },
  ];
}

function normalizeSegment(segment: OpenAiDiarizedSegment, index: number): TranscriptionSegment {
  const rawText = typeof segment.text === 'string' ? segment.text : '';
  const cleanedText = cleanTranscriptText(rawText);

  return {
    segmentIndex: index,
    startTimeSeconds: readNumber(segment.start),
    endTimeSeconds: readNumber(segment.end),
    rawText,
    cleanedText,
    speakerLabel: normalizeSpeakerLabel(segment.speaker),
    confidenceScore: readNumber(segment.confidence),
    tokenCountEstimate: estimateTranscriptTokenCount(cleanedText),
  };
}

function normalizeSpeakerLabel(value: unknown) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return 'Speaker 1';
  }

  const normalized = value.trim().replace(/[_-]+/g, ' ');
  const match = normalized.match(/^speaker\s*(\d+)$/i);

  if (match) {
    return `Speaker ${match[1]}`;
  }

  return normalized.replace(/\b\w/g, (character) => character.toUpperCase());
}

function cleanTranscriptText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

export function buildSpeakerSeparatedTranscriptText(
  segments: TranscriptionSegment[],
  fallbackText: unknown
) {
  if (segments.length > 0) {
    return segments
      .map((segment) => `${segment.speakerLabel}: ${segment.cleanedText}`)
      .join('\n\n');
  }

  return typeof fallbackText === 'string' ? fallbackText.trim() : '';
}

function readNumber(value: unknown) {
  const normalized = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

export function calculateAverageConfidence(segments: TranscriptionSegment[]) {
  const scores = segments
    .map((segment) => segment.confidenceScore)
    .filter((score): score is number => score != null);

  if (scores.length === 0) {
    return null;
  }

  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

export function estimateTranscriptTokenCount(text: string) {
  if (!text.trim()) {
    return 0;
  }

  return Math.ceil(text.trim().split(/\s+/).length * 1.33);
}

function buildLogPreview(value: unknown) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);

  if (serialized.length <= 2000) {
    return serialized;
  }

  return `${serialized.slice(0, 2000)}... [truncated]`;
}
