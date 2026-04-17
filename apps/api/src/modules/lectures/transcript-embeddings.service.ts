import { getDb } from '@lectrai/db';
import { HttpError } from '../../lib/http-error.js';
import { env } from '../../config/env.js';
import type { ProcessedTranscriptPayload } from './transcript-processing.service.js';

const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const DEFAULT_TRANSCRIPT_EMBEDDING_MODEL = 'text-embedding-3-small';
const DEFAULT_TRANSCRIPT_EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_TRANSCRIPT_EMBEDDING_BATCH_SIZE = 64;
const TRANSCRIPT_EMBEDDING_LOG_PREFIX = '[ transcript-embeddings ]';

type DbClient = ReturnType<typeof getDb>;

type OpenAiEmbeddingItem = {
  index?: unknown;
  embedding?: unknown;
};

type OpenAiEmbeddingsResponse = {
  data?: unknown;
  model?: unknown;
  usage?: unknown;
};

export type TranscriptChunkDraft = {
  chunkIndex: number;
  speaker: string;
  content: string;
  chunkText: string;
};

export type TranscriptChunkSearchResult = {
  chunk: {
    id: string;
    transcriptId: string;
    chunkIndex: number;
    speaker: string | null;
    content: string;
    chunkText: string;
    embeddingModel: string;
    createdAt: string;
    similarity: number;
  };
  transcript: {
    id: string;
    lectureId: string;
    lectureTitle: string;
    recordedAt: string | null;
    generatedAt: string | null;
    sourceTranscriptId: string | null;
    courseId: string;
    courseName: string;
  };
};

type PersistProcessedTranscriptWithChunksInput = {
  lectureId: string;
  rawTranscriptId: string;
  audioFileId: string;
  processingJobId: string;
  processing: {
    providerName: 'openai';
    modelName: string;
    speakerMap: unknown;
    payload: ProcessedTranscriptPayload;
    formattedText: string;
  };
};

type TranscriptEmbeddingConfig = {
  model: string;
  dimensions: number;
  batchSize: number;
};

type PersistedTranscriptChunkSummary = {
  processedTranscriptId: string;
  chunkCount: number;
  embeddingModel: string;
  embeddingDimensions: number;
};

export function buildTranscriptChunks(payload: ProcessedTranscriptPayload): TranscriptChunkDraft[] {
  return payload.paragraphs
    .filter((paragraph) => paragraph.text.trim().length > 0)
    .map((paragraph, index) => {
      const speaker = normalizeChunkSpeaker(paragraph.speakerDisplayName, paragraph.speakerLabel);
      const content = paragraph.text.trim();

      return {
        chunkIndex: Number.isInteger(paragraph.paragraphIndex) ? paragraph.paragraphIndex : index,
        speaker,
        content,
        chunkText: `${speaker}: ${content}`,
      };
    });
}

export async function generateEmbeddings(inputTexts: string[]): Promise<number[][]> {
  const config = readTranscriptEmbeddingConfig();

  if (inputTexts.length === 0) {
    return [];
  }

  const embeddings: number[][] = [];

  for (let start = 0; start < inputTexts.length; start += config.batchSize) {
    const batch = inputTexts.slice(start, start + config.batchSize);
    const batchEmbeddings = await createEmbeddingBatch(batch, config);
    embeddings.push(...batchEmbeddings);
  }

  return embeddings;
}

export async function persistProcessedTranscriptWithChunks(
  input: PersistProcessedTranscriptWithChunksInput
): Promise<PersistedTranscriptChunkSummary> {
  const chunkDrafts = buildTranscriptChunks(input.processing.payload);
  const embeddingConfig = readTranscriptEmbeddingConfig();
  const embeddings = chunkDrafts.length > 0 ? await generateEmbeddings(chunkDrafts.map((chunk) => chunk.chunkText)) : [];

  if (chunkDrafts.length !== embeddings.length) {
    throw new HttpError(500, 'Transcript chunk embedding count does not match the processed transcript chunk count.');
  }

  const chunkRows = chunkDrafts.map((chunk, index) => ({
    ...chunk,
    embedding: embeddings[index],
    embeddingModel: embeddingConfig.model,
  }));

  const db = getDb();

  return db.begin(async (transaction) => {
    const tx = transaction as unknown as DbClient;
    const transcriptRows = await tx<{ id: string }[]>`
      insert into public.processed_transcripts (
        lecture_id,
        source_transcript_id,
        source_audio_file_id,
        processing_job_id,
        provider_name,
        model_name,
        speaker_map,
        processed_payload,
        formatted_text,
        status,
        generated_at
      ) values (
        ${input.lectureId}::uuid,
        ${input.rawTranscriptId}::uuid,
        ${input.audioFileId}::uuid,
        ${input.processingJobId}::uuid,
        ${input.processing.providerName},
        ${input.processing.modelName},
        ${JSON.stringify(input.processing.speakerMap)}::jsonb,
        ${JSON.stringify(input.processing.payload)}::jsonb,
        ${input.processing.formattedText},
        'ready',
        timezone('utc', now())
      )
      on conflict (lecture_id) do update
      set
        source_transcript_id = excluded.source_transcript_id,
        source_audio_file_id = excluded.source_audio_file_id,
        processing_job_id = excluded.processing_job_id,
        provider_name = excluded.provider_name,
        model_name = excluded.model_name,
        speaker_map = excluded.speaker_map,
        processed_payload = excluded.processed_payload,
        formatted_text = excluded.formatted_text,
        status = excluded.status,
        generated_at = excluded.generated_at
      returning id::text as id
    `;

    const processedTranscriptId = transcriptRows[0]?.id;

    if (!processedTranscriptId) {
      throw new HttpError(500, 'Failed to save processed lecture transcription.');
    }

    await replaceTranscriptChunks(tx, processedTranscriptId, chunkRows);

    return {
      processedTranscriptId,
      chunkCount: chunkRows.length,
      embeddingModel: embeddingConfig.model,
      embeddingDimensions: embeddingConfig.dimensions,
    };
  });
}

export async function reprocessTranscriptChunks(processedTranscriptId: string): Promise<PersistedTranscriptChunkSummary> {
  const db = getDb();
  const rows = await db<{
    id: string;
    processed_payload: unknown;
  }[]>`
    select
      pt.id::text as id,
      pt.processed_payload
    from public.processed_transcripts pt
    where pt.id = ${processedTranscriptId}::uuid
    limit 1
  `;

  const transcript = rows[0];

  if (!transcript) {
    throw new HttpError(404, 'Processed transcript not found.');
  }

  const payload = readProcessedTranscriptPayload(transcript.processed_payload);
  const chunkDrafts = buildTranscriptChunks(payload);
  const embeddingConfig = readTranscriptEmbeddingConfig();
  const embeddings = chunkDrafts.length > 0 ? await generateEmbeddings(chunkDrafts.map((chunk) => chunk.chunkText)) : [];
  const chunkRows = chunkDrafts.map((chunk, index) => ({
    ...chunk,
    embedding: embeddings[index],
    embeddingModel: embeddingConfig.model,
  }));

  await db.begin(async (transaction) => {
    const tx = transaction as unknown as DbClient;
    await replaceTranscriptChunks(tx, processedTranscriptId, chunkRows);
  });

  console.log(`${TRANSCRIPT_EMBEDDING_LOG_PREFIX} Reprocessed transcript chunks.`, {
    processedTranscriptId,
    chunkCount: chunkRows.length,
    embeddingModel: embeddingConfig.model,
  });

  return {
    processedTranscriptId,
    chunkCount: chunkRows.length,
    embeddingModel: embeddingConfig.model,
    embeddingDimensions: embeddingConfig.dimensions,
  };
}

export async function searchTranscriptChunks(input: {
  query: string;
  topK?: number;
  lectureId?: string;
  transcriptId?: string;
  courseId?: string;
  userId?: string;
}): Promise<TranscriptChunkSearchResult[]> {
  const query = input.query.trim();

  if (!query) {
    throw new HttpError(400, 'Search query is required.');
  }

  const topK = Number.isInteger(input.topK) && input.topK != null ? Math.min(Math.max(input.topK, 1), 25) : 5;
  const [queryEmbedding] = await generateEmbeddings([query]);
  const vectorLiteral = toVectorLiteral(queryEmbedding);
  const db = getDb();
  const rows = await db<{
    chunk_id: string;
    transcript_id: string;
    chunk_index: number;
    speaker: string | null;
    content: string;
    chunk_text: string;
    embedding_model: string;
    chunk_created_at: string;
    similarity: number | string;
    lecture_id: string;
    lecture_title: string;
    recorded_at: string | null;
    generated_at: string | null;
    source_transcript_id: string | null;
    course_id: string;
    course_name: string;
  }[]>`
    select
      tc.id::text as chunk_id,
      tc.transcript_id::text as transcript_id,
      tc.chunk_index,
      tc.speaker,
      tc.content,
      tc.chunk_text,
      tc.embedding_model,
      tc.created_at::text as chunk_created_at,
      1 - (tc.embedding operator(extensions.<=>) ${vectorLiteral}::extensions.vector) as similarity,
      pt.lecture_id::text as lecture_id,
      l.title as lecture_title,
      l.recorded_at::text as recorded_at,
      pt.generated_at::text as generated_at,
      pt.source_transcript_id::text as source_transcript_id,
      l.course_id::text as course_id,
      c.course_name
    from public.transcript_chunks tc
    inner join public.processed_transcripts pt
      on pt.id = tc.transcript_id
    inner join public.lectures l
      on l.id = pt.lecture_id
    inner join public.courses c
      on c.id = l.course_id
    where pt.status = 'ready'
      ${input.transcriptId ? db`and tc.transcript_id = ${input.transcriptId}::uuid` : db``}
      ${input.lectureId ? db`and pt.lecture_id = ${input.lectureId}::uuid` : db``}
      ${input.courseId ? db`and l.course_id = ${input.courseId}::uuid` : db``}
      ${input.userId ? db`and c.owner_user_id = ${input.userId}::uuid` : db``}
    order by tc.embedding operator(extensions.<=>) ${vectorLiteral}::extensions.vector
    limit ${topK}
  `;

  return rows.map((row) => ({
    chunk: {
      id: row.chunk_id,
      transcriptId: row.transcript_id,
      chunkIndex: row.chunk_index,
      speaker: row.speaker,
      content: row.content,
      chunkText: row.chunk_text,
      embeddingModel: row.embedding_model,
      createdAt: row.chunk_created_at,
      similarity: Number(row.similarity),
    },
    transcript: {
      id: row.transcript_id,
      lectureId: row.lecture_id,
      lectureTitle: row.lecture_title,
      recordedAt: row.recorded_at,
      generatedAt: row.generated_at,
      sourceTranscriptId: row.source_transcript_id,
      courseId: row.course_id,
      courseName: row.course_name,
    },
  }));
}

async function replaceTranscriptChunks(
  tx: DbClient,
  processedTranscriptId: string,
  chunkRows: Array<
    TranscriptChunkDraft & {
      embedding: number[];
      embeddingModel: string;
    }
  >
) {
  // Re-runs replace the full chunk set in one transaction so stale vectors never mix with the latest transcript state.
  await tx`
    delete from public.transcript_chunks
    where transcript_id = ${processedTranscriptId}::uuid
  `;

  for (const chunk of chunkRows) {
    await tx`
      insert into public.transcript_chunks (
        transcript_id,
        chunk_index,
        speaker,
        content,
        chunk_text,
        embedding,
        embedding_model
      ) values (
        ${processedTranscriptId}::uuid,
        ${chunk.chunkIndex},
        ${chunk.speaker},
        ${chunk.content},
        ${chunk.chunkText},
        ${toVectorLiteral(chunk.embedding)}::extensions.vector,
        ${chunk.embeddingModel}
      )
    `;
  }
}

async function createEmbeddingBatch(inputTexts: string[], config: TranscriptEmbeddingConfig): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new HttpError(500, 'Missing OpenAI API key. Set OPENAI_API_KEY for transcript embeddings.');
  }

  console.log(`${TRANSCRIPT_EMBEDDING_LOG_PREFIX} Requesting embeddings.`, {
    model: config.model,
    dimensions: config.dimensions,
    inputCount: inputTexts.length,
  });

  const body: Record<string, unknown> = {
    model: config.model,
    input: inputTexts,
    encoding_format: 'float',
  };

  if (config.model.startsWith('text-embedding-3')) {
    body.dimensions = config.dimensions;
  }

  const response = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorDetails = await readOpenAiErrorDetails(response);

    console.error(`${TRANSCRIPT_EMBEDDING_LOG_PREFIX} OpenAI embeddings API error response.`, {
      status: response.status,
      statusText: response.statusText,
      errorDetails,
    });

    throw new HttpError(502, 'OpenAI transcript embedding request failed.', errorDetails);
  }

  const rawResponse = (await response.json()) as OpenAiEmbeddingsResponse;
  return normalizeEmbeddingsResponse(rawResponse, inputTexts.length, config.dimensions);
}

function normalizeEmbeddingsResponse(
  response: OpenAiEmbeddingsResponse,
  expectedCount: number,
  expectedDimensions: number
): number[][] {
  const items = Array.isArray(response.data) ? (response.data as OpenAiEmbeddingItem[]) : [];

  if (items.length !== expectedCount) {
    throw new HttpError(502, 'OpenAI transcript embedding response count did not match the request.', {
      expectedCount,
      actualCount: items.length,
      response,
    });
  }

  return items
    .slice()
    .sort((left, right) => readEmbeddingIndex(left.index) - readEmbeddingIndex(right.index))
    .map((item) => normalizeEmbedding(item.embedding, expectedDimensions));
}

function normalizeEmbedding(value: unknown, expectedDimensions: number): number[] {
  if (!Array.isArray(value)) {
    throw new HttpError(502, 'OpenAI transcript embedding response contained an invalid embedding payload.', value);
  }

  const embedding = value.map((entry) => {
    const numberValue = typeof entry === 'number' ? entry : Number(entry);

    if (!Number.isFinite(numberValue)) {
      throw new HttpError(502, 'OpenAI transcript embedding response contained a non-numeric embedding value.', value);
    }

    return numberValue;
  });

  if (embedding.length !== expectedDimensions) {
    throw new HttpError(502, 'OpenAI transcript embedding dimensions did not match configuration.', {
      expectedDimensions,
      actualDimensions: embedding.length,
    });
  }

  return embedding;
}

function readEmbeddingIndex(value: unknown) {
  return Number.isInteger(value) ? Number(value) : 0;
}

async function readOpenAiErrorDetails(response: Response) {
  try {
    return await response.json();
  } catch {
    return await response.text().catch(() => response.statusText);
  }
}

function readTranscriptEmbeddingConfig(): TranscriptEmbeddingConfig {
  return {
    model: env.openAiTranscriptEmbeddingModel || DEFAULT_TRANSCRIPT_EMBEDDING_MODEL,
    dimensions: readPositiveInteger(
      String(env.openAiTranscriptEmbeddingDimensions),
      DEFAULT_TRANSCRIPT_EMBEDDING_DIMENSIONS
    ),
    batchSize: readPositiveInteger(
      String(env.openAiTranscriptEmbeddingBatchSize),
      DEFAULT_TRANSCRIPT_EMBEDDING_BATCH_SIZE
    ),
  };
}

function readPositiveInteger(rawValue: string | undefined, fallback: number) {
  if (!rawValue) {
    return fallback;
  }

  const numericValue = Number(rawValue);

  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    throw new HttpError(500, `Invalid positive integer configuration value: ${rawValue}`);
  }

  return numericValue;
}

function normalizeChunkSpeaker(preferredLabel: string, fallbackLabel: string) {
  const label = preferredLabel.trim() || fallbackLabel.trim();
  return label.length > 0 ? label : 'Unknown Speaker';
}

function toVectorLiteral(values: number[]) {
  return `[${values.join(',')}]`;
}

function readProcessedTranscriptPayload(value: unknown): ProcessedTranscriptPayload {
  if (!value || typeof value !== 'object') {
    throw new HttpError(409, 'Processed transcript payload is missing, so transcript chunks cannot be rebuilt.');
  }

  const parsed = value as Partial<ProcessedTranscriptPayload>;

  if (!Array.isArray(parsed.paragraphs) || !Array.isArray(parsed.speakers) || typeof parsed.formattedText !== 'string') {
    throw new HttpError(409, 'Processed transcript payload is not in the expected shape for chunk embedding.', value);
  }

  return parsed as ProcessedTranscriptPayload;
}
