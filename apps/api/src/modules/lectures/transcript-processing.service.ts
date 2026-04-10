import { HttpError } from '../../lib/http-error.js';
import type { TranscriptionSegment } from './audio-transcription.service.js';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_TRANSCRIPT_PROCESSING_MODEL = 'gpt-4o-2024-08-06';
const TRANSCRIPTION_LOG_PREFIX = '[ transcription ]';

export type ProcessedTranscriptSpeaker = {
  originalLabel: string;
  role: 'professor' | 'student' | 'unknown';
  displayName: string;
  confidence: number;
  rationale: string;
};

export type ProcessedTranscriptParagraph = {
  paragraphIndex: number;
  speakerRole: 'professor' | 'student' | 'unknown';
  speakerLabel: string;
  speakerDisplayName: string;
  text: string;
};

export type ProcessedTranscriptPayload = {
  speakers: ProcessedTranscriptSpeaker[];
  paragraphs: ProcessedTranscriptParagraph[];
  formattedText: string;
};

export type TranscriptProcessingResult = {
  providerName: 'openai';
  modelName: string;
  speakerMap: ProcessedTranscriptSpeaker[];
  formattedText: string;
  payload: ProcessedTranscriptPayload;
  rawResponse: unknown;
};

type OpenAiResponsesOutputContent = {
  type?: unknown;
  text?: unknown;
  refusal?: unknown;
};

type OpenAiResponsesOutput = {
  type?: unknown;
  content?: unknown;
};

type OpenAiResponsesResponse = {
  output?: unknown;
};

export async function processTranscriptSpeakers(input: {
  courseTitle: string;
  courseDescription: string | null;
  lectureTitle: string;
  transcriptText: string;
  segments: TranscriptionSegment[];
}): Promise<TranscriptProcessingResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new HttpError(500, 'Missing OpenAI API key. Set OPENAI_API_KEY for transcript processing.');
  }

  const modelName = process.env.OPENAI_TRANSCRIPT_PROCESSING_MODEL ?? DEFAULT_TRANSCRIPT_PROCESSING_MODEL;

  console.log(`${TRANSCRIPTION_LOG_PREFIX} Calling OpenAI transcript processing API.`, {
    modelName,
    courseTitle: input.courseTitle,
    lectureTitle: input.lectureTitle,
    segmentCount: input.segments.length,
  });

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text:
                'You classify and format lecture transcript speaker turns. ' +
                'Use course context and dialogue cues to infer whether each turn is the professor, a student, or unknown. ' +
                'Use stable display names: exactly "Professor" for the teacher and "Student A", "Student B", etc. for distinct students. ' +
                'If there is only one student, label them "Student A". If a raw diarization label contains multiple speakers, split it into separate turns. ' +
                'Use "Unknown Speaker A", "Unknown Speaker B", etc. only when the role is unclear. ' +
                'Keep transcript wording faithful and do not invent personal names.',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify({
                course: {
                  title: input.courseTitle,
                  description: input.courseDescription,
                },
                lecture: {
                  title: input.lectureTitle,
                },
                transcript: {
                  fullText: input.transcriptText,
                  segments: input.segments.map((segment) => ({
                    index: segment.segmentIndex,
                    speakerLabel: segment.speakerLabel,
                    startTimeSeconds: segment.startTimeSeconds,
                    endTimeSeconds: segment.endTimeSeconds,
                    text: segment.cleanedText,
                  })),
                },
              }),
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'processed_lecture_transcript',
          strict: true,
          schema: PROCESSED_TRANSCRIPT_SCHEMA,
        },
      },
    }),
  });

  console.log(`${TRANSCRIPTION_LOG_PREFIX} OpenAI transcript processing API responded.`, {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
  });

  if (!response.ok) {
    const errorDetails = await readOpenAiErrorDetails(response);

    console.error(`${TRANSCRIPTION_LOG_PREFIX} OpenAI transcript processing API error response.`, {
      status: response.status,
      statusText: response.statusText,
      errorDetails,
    });

    throw new HttpError(502, 'OpenAI transcript processing failed.', errorDetails);
  }

  const rawResponse = (await response.json()) as OpenAiResponsesResponse;
  const payload = normalizeProcessedTranscriptPayload(parseProcessedTranscriptPayload(rawResponse));

  console.log(`${TRANSCRIPTION_LOG_PREFIX} OpenAI transcript processing response parsed.`, {
    speakerCount: payload.speakers.length,
    paragraphCount: payload.paragraphs.length,
    formattedTextPreview: buildLogPreview(payload.formattedText),
  });

  return {
    providerName: 'openai',
    modelName,
    speakerMap: payload.speakers,
    formattedText: payload.formattedText,
    payload,
    rawResponse,
  };
}

const PROCESSED_TRANSCRIPT_SCHEMA = {
  type: 'object',
  properties: {
    speakers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          originalLabel: { type: 'string' },
          role: { type: 'string', enum: ['professor', 'student', 'unknown'] },
          displayName: { type: 'string' },
          confidence: { type: 'number' },
          rationale: { type: 'string' },
        },
        required: ['originalLabel', 'role', 'displayName', 'confidence', 'rationale'],
        additionalProperties: false,
      },
    },
    paragraphs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          paragraphIndex: { type: 'integer' },
          speakerRole: { type: 'string', enum: ['professor', 'student', 'unknown'] },
          speakerLabel: { type: 'string' },
          speakerDisplayName: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['paragraphIndex', 'speakerRole', 'speakerLabel', 'speakerDisplayName', 'text'],
        additionalProperties: false,
      },
    },
    formattedText: { type: 'string' },
  },
  required: ['speakers', 'paragraphs', 'formattedText'],
  additionalProperties: false,
} as const;

async function readOpenAiErrorDetails(response: Response) {
  try {
    return await response.json();
  } catch {
    return await response.text().catch(() => response.statusText);
  }
}

function parseProcessedTranscriptPayload(response: OpenAiResponsesResponse): ProcessedTranscriptPayload {
  const outputText = extractOutputText(response);

  if (!outputText) {
    throw new HttpError(502, 'OpenAI transcript processing did not return output text.', response);
  }

  const parsed = JSON.parse(outputText) as ProcessedTranscriptPayload;

  if (
    !Array.isArray(parsed.speakers) ||
    !Array.isArray(parsed.paragraphs) ||
    typeof parsed.formattedText !== 'string'
  ) {
    throw new HttpError(502, 'OpenAI transcript processing returned invalid JSON shape.', parsed);
  }

  return parsed;
}

function normalizeProcessedTranscriptPayload(payload: ProcessedTranscriptPayload): ProcessedTranscriptPayload {
  const paragraphs = payload.paragraphs.map((paragraph, index) => ({
    ...paragraph,
    paragraphIndex: index,
    speakerDisplayName: normalizeSpeakerDisplayName(paragraph.speakerDisplayName, paragraph.speakerRole),
    text: paragraph.text.trim(),
  }));

  return {
    ...payload,
    paragraphs,
    formattedText: buildDiarizedFormattedText(paragraphs),
  };
}

function buildDiarizedFormattedText(paragraphs: ProcessedTranscriptParagraph[]) {
  return paragraphs
    .filter((paragraph) => paragraph.text.length > 0)
    .map((paragraph) => `${paragraph.speakerDisplayName}: ${paragraph.text}`)
    .join('\n\n');
}

function normalizeSpeakerDisplayName(
  displayName: string | undefined,
  role: ProcessedTranscriptParagraph['speakerRole']
) {
  const normalized = displayName?.trim();

  if (normalized) {
    if (role === 'professor' && /^(professor|teacher|instructor)$/i.test(normalized)) {
      return 'Professor';
    }

    if (role === 'student' && /^student$/i.test(normalized)) {
      return 'Student A';
    }

    return normalized;
  }

  if (role === 'professor') {
    return 'Professor';
  }

  if (role === 'student') {
    return 'Student A';
  }

  return 'Unknown Speaker A';
}

function extractOutputText(response: OpenAiResponsesResponse) {
  const output = Array.isArray(response.output) ? response.output : [];

  for (const item of output) {
    const outputItem = item as OpenAiResponsesOutput;
    const content = Array.isArray(outputItem.content) ? outputItem.content : [];

    for (const contentItem of content) {
      const normalized = contentItem as OpenAiResponsesOutputContent;

      if (normalized.type === 'output_text' && typeof normalized.text === 'string') {
        return normalized.text;
      }

      if (typeof normalized.refusal === 'string') {
        throw new HttpError(502, 'OpenAI transcript processing refused the request.', normalized.refusal);
      }
    }
  }

  return null;
}

function buildLogPreview(value: unknown) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);

  if (serialized.length <= 2000) {
    return serialized;
  }

  return `${serialized.slice(0, 2000)}... [truncated]`;
}
