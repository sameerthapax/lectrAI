import { getDb } from '@lectrai/db';
import { HttpError } from '../../lib/http-error.js';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_LOKI_FLASHCARD_MODEL = 'gpt-4o-2024-08-06';
const LOKI_FLASHCARD_SCOPE = 'loki';
const DEFAULT_LOKI_FLASHCARD_COUNT = 6;
const MIN_LOKI_FLASHCARD_COUNT = 4;
const MAX_LOKI_FLASHCARD_COUNT = 12;
const MAX_LOKI_FLASHCARD_GENERATION_ATTEMPTS = 2;
const MAX_CONTEXT_CHARS = 4_000;

export type StoredFlashcardRecord = {
  id: string;
  lectureId: string | null;
  frontText: string;
  backText: string;
  hintText: string | null;
  explanation: string | null;
  sourceType: string | null;
  sourceTitle: string | null;
  sourceExcerpt: string | null;
  cardOrder: number;
  sourceSegmentIndex: number | null;
  createdAt: string | null;
};

export type StoredFlashcardSetRecord = {
  id: string;
  lectureId: string | null;
  generatedByUserId: string | null;
  title: string | null;
  description: string | null;
  scope: string;
  cardCount: number | null;
  sourceCount: number | null;
  versionNo: number;
  createdAt: string;
  updatedAt: string;
  cards: StoredFlashcardRecord[];
};

export type StoredFlashcardSetBundle = {
  flashcardSet: StoredFlashcardSetRecord;
};

export type LokiFlashcardSourceContext =
  | {
      sourceType: 'transcript';
      sourceId: string;
      lectureId: string;
      lectureTitle: string;
      courseId: string;
      courseName: string;
      similarity: number;
      content: string;
    }
  | {
      sourceType: 'course_file' | 'course_metadata' | 'lecture_metadata';
      sourceId: string;
      lectureId: string | null;
      lectureTitle: string | null;
      courseId: string | null;
      courseName: string | null;
      similarity: number | null;
      content: string;
    };

type GenerateLokiFlashcardsForUserInput = {
  userId: string;
  message: string;
  cardCount?: number | null;
  titleHint?: string | null;
  contexts: LokiFlashcardSourceContext[];
};

type OpenAiResponsesOutputContent = {
  type?: unknown;
  text?: unknown;
};

type OpenAiResponsesOutput = {
  type?: unknown;
  content?: unknown;
};

type OpenAiResponsesResponse = {
  output?: unknown;
};

type GeneratedFlashcardPayload = {
  title: string;
  description: string | null;
  cards: GeneratedFlashcard[];
};

type GeneratedFlashcard = {
  frontText: string;
  backText: string;
  hintText: string | null;
  explanation: string | null;
  sourceType: string | null;
  sourceTitle: string | null;
  sourceExcerpt: string | null;
};

type FlashcardSourceType = 'lecture' | 'course_file' | 'course_metadata' | 'chat';

type DbFlashcardSetRow = {
  id: string;
  lecture_id: string | null;
  generated_by_user_id: string | null;
  title: string | null;
  description: string | null;
  scope: string;
  card_count: number | null;
  source_count: number | null;
  version_no: number;
  created_at: string;
  updated_at: string;
};

type DbFlashcardRow = {
  id: string;
  lecture_id: string | null;
  front_text: string;
  back_text: string;
  hint_text: string | null;
  explanation: string | null;
  source_type: string | null;
  source_title: string | null;
  source_excerpt: string | null;
  card_order: number;
  source_segment_index: number | null;
  created_at: string | null;
};

export async function getStoredFlashcardSetBundleForUser(
  userId: string,
  flashcardSetId: string
): Promise<StoredFlashcardSetBundle> {
  const flashcardSet = await findStoredFlashcardSetForUser(userId, flashcardSetId);

  if (!flashcardSet) {
    throw new HttpError(404, 'Flashcard set not found.');
  }

  return { flashcardSet };
}

export async function generateLokiFlashcardsForUser(
  input: GenerateLokiFlashcardsForUserInput
): Promise<StoredFlashcardSetRecord> {
  const targetCardCount = normalizeCardCount(input.cardCount);
  const generatedFlashcards = await requestLokiFlashcardsFromOpenAi({
    message: input.message,
    titleHint: input.titleHint ?? null,
    cardCount: targetCardCount,
    contexts: input.contexts,
  });
  const flashcardSetId = await persistGeneratedFlashcardSet({
    userId: input.userId,
    generatedFlashcards,
    sourceCount: input.contexts.length,
  });
  const flashcardSet = await findStoredFlashcardSetForUser(input.userId, flashcardSetId);

  if (!flashcardSet) {
    throw new HttpError(500, 'Flashcards were generated but could not be loaded.');
  }

  return flashcardSet;
}

async function findStoredFlashcardSetForUser(userId: string, flashcardSetId: string) {
  const db = getDb();
  const setRows = await db<DbFlashcardSetRow[]>`
    select
      fs.id::text as id,
      fs.lecture_id::text as lecture_id,
      fs.generated_by_user_id::text as generated_by_user_id,
      fs.title,
      fs.description,
      fs.scope,
      fs.card_count,
      fs.source_count,
      fs.version_no,
      fs.created_at::text as created_at,
      fs.updated_at::text as updated_at
    from public.flashcard_sets fs
    where fs.id = ${flashcardSetId}::uuid
      and (
        (
          fs.scope = ${LOKI_FLASHCARD_SCOPE}
          and fs.generated_by_user_id = ${userId}::uuid
        )
        or (
          fs.scope = 'lecture'
          and exists (
            select 1
            from public.lectures l
            where l.id = fs.lecture_id
              and exists (
                select 1
                from public.course_members cm
                where cm.course_id = l.course_id
                  and cm.user_id = ${userId}::uuid
                  and cm.is_active = true
              )
          )
        )
      )
    limit 1
  `;

  const flashcardSet = setRows[0];

  if (!flashcardSet) {
    return null;
  }

  const cardRows = await db<DbFlashcardRow[]>`
    select
      f.id::text as id,
      f.lecture_id::text as lecture_id,
      f.front_text,
      f.back_text,
      f.hint_text,
      f.explanation,
      f.source_type,
      f.source_title,
      f.source_excerpt,
      f.card_order,
      f.source_segment_index,
      f.created_at::text as created_at
    from public.flashcards f
    where f.flashcard_set_id = ${flashcardSetId}::uuid
    order by f.card_order asc, f.created_at asc, f.id asc
  `;

  return mapStoredFlashcardSet(flashcardSet, cardRows);
}

async function persistGeneratedFlashcardSet(input: {
  userId: string;
  generatedFlashcards: GeneratedFlashcardPayload;
  sourceCount: number;
}) {
  const db = getDb();

  return db.begin(async (transaction) => {
    const tx = transaction as unknown as ReturnType<typeof getDb>;
    const setRows = await tx<{ id: string }[]>`
      insert into public.flashcard_sets (
        lecture_id,
        generated_by_user_id,
        title,
        description,
        is_ai_generated,
        card_count,
        scope,
        source_count,
        version_no
      ) values (
        null,
        ${input.userId}::uuid,
        ${input.generatedFlashcards.title},
        ${nullable(input.generatedFlashcards.description)},
        true,
        ${input.generatedFlashcards.cards.length},
        ${LOKI_FLASHCARD_SCOPE},
        ${input.sourceCount},
        1
      )
      returning id::text as id
    `;

    const flashcardSetId = setRows[0]?.id;

    if (!flashcardSetId) {
      throw new HttpError(500, 'Failed to create generated flashcard set.');
    }

    for (const [index, card] of input.generatedFlashcards.cards.entries()) {
      await tx`
        insert into public.flashcards (
          flashcard_set_id,
          lecture_id,
          front_text,
          back_text,
          hint_text,
          explanation,
          source_type,
          source_title,
          source_excerpt,
          card_order,
          source_segment_index
        ) values (
          ${flashcardSetId}::uuid,
          null,
          ${card.frontText},
          ${card.backText},
          ${nullable(card.hintText)},
          ${nullable(card.explanation)},
          ${nullable(card.sourceType)},
          ${nullable(card.sourceTitle)},
          ${nullable(card.sourceExcerpt)},
          ${index + 1},
          null
        )
      `;
    }

    return flashcardSetId;
  });
}

async function requestLokiFlashcardsFromOpenAi(input: {
  message: string;
  titleHint: string | null;
  cardCount: number;
  contexts: LokiFlashcardSourceContext[];
}) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new HttpError(500, 'Missing OpenAI API key. Set OPENAI_API_KEY for Loki flashcard generation.');
  }

  const contexts = input.contexts
    .slice(0, 8)
    .map((context) => ({
      sourceType: context.sourceType,
      sourceId: context.sourceId,
      lectureId: context.lectureId,
      lectureTitle: context.lectureTitle,
      courseId: context.courseId,
      courseName: context.courseName,
      similarity: context.similarity,
      content: truncateText(normalizeContextText(context.content), MAX_CONTEXT_CHARS),
    }));

  let lastError: unknown = null;
  let previousFailureMessage: string | null = null;

  for (let attempt = 1; attempt <= MAX_LOKI_FLASHCARD_GENERATION_ATTEMPTS; attempt += 1) {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEFAULT_LOKI_FLASHCARD_MODEL,
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text:
                  'Generate a compact, high-quality study flashcard set in strict JSON. ' +
                  'Use the provided lecture and course material only as a knowledge base. ' +
                  'Transform the material into durable study cards that remain useful even when separated from the original lecture transcript. ' +
                  'Do not create flashcards that depend on remembering who said something, transcript wording, dialogue order, speaker labels, timestamps, or line-by-line lecture recall. ' +
                  'Do not write speaker-specific, professor-specific, student-specific, quote-matching, true-false, or fill-in-the-blank cards. ' +
                  'Prefer standalone cards that test conceptual understanding, definitions, mechanisms, relationships, comparisons, causes, consequences, and practical application. ' +
                  'Aim for a balanced deck rather than repeating the same pattern. ' +
                  'Each front must be concise, self-contained, and focus on one clear idea only. ' +
                  'A front may be a natural study question or a crisp study prompt such as a term, concept, mechanism, or comparison. ' +
                  'Do not use vague labels like "Topic" or "Concept". ' +
                  'Rewrite every card so it stands on its own outside the lecture. ' +
                  'Never phrase a card as "according to the lecture", "according to the transcript", "as noted in the lecture", or "in this lecture". ' +
                  'Each back must begin with the direct answer and then teach the concept clearly in plain language in one to three short sentences. ' +
                  'Hint text is optional, should be brief, and should gently point the learner toward the idea without simply repeating the front. ' +
                  'Explanation is optional and should add one useful nuance, example, or distinction beyond the main back text. ' +
                  'Description should summarize what this deck helps the student review in one concise sentence. ' +
                  'If source context is thin, still produce high-quality educational cards based on the requested topic, but never invent speaker references or exact lecture phrasing. ' +
                  'Avoid trivial wording recall, rote quote recall, and questions about what line came next. ' +
                  'Use sourceType carefully: lecture for any lecture or transcript-derived fact, course_file for file-derived facts, course_metadata for course-level framing, and chat only if the card truly comes from the user conversation rather than course material. ' +
                  'If previousFailureMessage is present, explicitly fix those problems in the new output.',
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: JSON.stringify({
                  request: input.message,
                  titleHint: input.titleHint,
                  targetCardCount: input.cardCount,
                  previousFailureMessage,
                  contexts,
                }),
              },
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'loki_flashcards',
            strict: true,
            schema: buildFlashcardSchema(input.cardCount),
          },
        },
      }),
    });

    if (!response.ok) {
      const errorDetails = await readOpenAiErrorDetails(response);
      throw new HttpError(502, 'OpenAI Loki flashcard generation failed.', errorDetails);
    }

    try {
      const rawResponse = (await response.json()) as OpenAiResponsesResponse;
      const normalizedPayload = normalizeGeneratedFlashcardPayload(
        parseGeneratedFlashcardPayload(rawResponse),
        input.cardCount,
        input.titleHint
      );
      return normalizedPayload;
    } catch (error) {
      lastError = error;
      previousFailureMessage = describeFlashcardGenerationFailure(error);
      console.warn('[ flashcards ] Loki flashcard generation attempt failed.', {
        attempt,
        failure: previousFailureMessage,
      });
    }
  }

  throw new HttpError(
    502,
    'Loki could not generate a valid flashcard set from that material yet. Please try again.',
    lastError
  );
}

function buildFlashcardSchema(cardCount: number) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string' },
      description: { type: ['string', 'null'] },
      cards: {
        type: 'array',
        minItems: cardCount,
        maxItems: cardCount,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            frontText: { type: 'string' },
            backText: { type: 'string' },
            hintText: { type: ['string', 'null'] },
            explanation: { type: ['string', 'null'] },
            sourceType: {
              anyOf: [
                { type: 'null' },
                { type: 'string', enum: ['lecture', 'course_file', 'course_metadata', 'chat'] },
              ],
            },
            sourceTitle: { type: ['string', 'null'] },
            sourceExcerpt: { type: ['string', 'null'] },
          },
          required: ['frontText', 'backText', 'hintText', 'explanation', 'sourceType', 'sourceTitle', 'sourceExcerpt'],
        },
      },
    },
    required: ['title', 'description', 'cards'],
  };
}

function parseGeneratedFlashcardPayload(response: OpenAiResponsesResponse) {
  const outputText = extractOutputText(response);

  if (!outputText) {
    throw new HttpError(502, 'OpenAI Loki flashcard generation did not return output text.', response);
  }

  return JSON.parse(outputText) as GeneratedFlashcardPayload;
}

function normalizeGeneratedFlashcardPayload(
  payload: GeneratedFlashcardPayload,
  expectedCardCount: number,
  fallbackTitle?: string | null
): GeneratedFlashcardPayload {
  if (!Array.isArray(payload.cards) || payload.cards.length !== expectedCardCount) {
    throw new HttpError(502, 'OpenAI Loki flashcard generation returned an unexpected number of cards.');
  }

  const cards = payload.cards.map((card, index) => {
    const frontText = cleanText(card.frontText);
    const backText = cleanText(card.backText);

    if (!frontText || !backText) {
      throw new HttpError(502, 'OpenAI Loki flashcard generation returned an incomplete card.', {
        index,
        card,
      });
    }

    return {
      frontText: truncateText(frontText, 180),
      backText: truncateText(backText, 420),
      hintText: card.hintText ? truncateText(cleanText(card.hintText), 120) : null,
      explanation: card.explanation ? truncateText(cleanText(card.explanation), 240) : null,
      sourceType: normalizeSourceType(card.sourceType),
      sourceTitle: card.sourceTitle ? truncateText(cleanText(card.sourceTitle), 255) : null,
      sourceExcerpt: card.sourceExcerpt ? truncateText(cleanText(card.sourceExcerpt), 600) : null,
    };
  });

  const duplicateFronts = new Set<string>();

  for (const card of cards) {
    const normalizedFront = card.frontText.toLowerCase();

    if (duplicateFronts.has(normalizedFront)) {
      throw new HttpError(502, 'OpenAI Loki flashcard generation returned duplicate flashcards.', {
        frontText: card.frontText,
      });
    }

    duplicateFronts.add(normalizedFront);
  }

  return {
    title: cleanText(payload.title) || cleanText(fallbackTitle ?? '') || 'Generated flashcards',
    description: payload.description ? truncateText(cleanText(payload.description), 280) : null,
    cards,
  };
}

function mapStoredFlashcardSet(setRow: DbFlashcardSetRow, cardRows: DbFlashcardRow[]): StoredFlashcardSetRecord {
  return {
    id: setRow.id,
    lectureId: setRow.lecture_id,
    generatedByUserId: setRow.generated_by_user_id,
    title: setRow.title,
    description: setRow.description,
    scope: setRow.scope,
    cardCount: setRow.card_count,
    sourceCount: setRow.source_count,
    versionNo: setRow.version_no,
    createdAt: setRow.created_at,
    updatedAt: setRow.updated_at,
    cards: cardRows.map((row) => ({
      id: row.id,
      lectureId: row.lecture_id,
      frontText: row.front_text,
      backText: row.back_text,
      hintText: row.hint_text,
      explanation: row.explanation,
      sourceType: row.source_type,
      sourceTitle: row.source_title,
      sourceExcerpt: row.source_excerpt,
      cardOrder: row.card_order,
      sourceSegmentIndex: row.source_segment_index,
      createdAt: row.created_at,
    })),
  };
}

function normalizeCardCount(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return DEFAULT_LOKI_FLASHCARD_COUNT;
  }

  return Math.max(MIN_LOKI_FLASHCARD_COUNT, Math.min(MAX_LOKI_FLASHCARD_COUNT, value));
}

function extractOutputText(response: OpenAiResponsesResponse) {
  const outputs = Array.isArray(response.output) ? (response.output as OpenAiResponsesOutput[]) : [];

  for (const output of outputs) {
    if (output?.type !== 'message' || !Array.isArray(output.content)) {
      continue;
    }

    for (const item of output.content as OpenAiResponsesOutputContent[]) {
      if (item?.type === 'output_text' && typeof item.text === 'string' && item.text.trim().length > 0) {
        return item.text;
      }
    }
  }

  return null;
}

async function readOpenAiErrorDetails(response: Response) {
  try {
    return await response.json();
  } catch {
    return await response.text().catch(() => response.statusText);
  }
}

function normalizeContextText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function truncateText(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function cleanText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}


function describeFlashcardGenerationFailure(error: unknown) {
  if (error instanceof HttpError) {
    const detail =
      typeof error.details === 'string'
        ? error.details
        : error.details && typeof error.details === 'object'
          ? JSON.stringify(error.details)
          : null;
    return detail ? `${error.message} Details: ${detail}` : error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown flashcard generation failure.';
}

function normalizeSourceType(value: unknown): FlashcardSourceType | null {
  if (value === 'lecture' || value === 'course_file' || value === 'course_metadata' || value === 'chat') {
    return value;
  }

  if (value === 'transcript' || value === 'lecture_metadata') {
    return 'lecture';
  }

  return null;
}

function nullable(value: string | null) {
  return value == null ? null : value;
}
