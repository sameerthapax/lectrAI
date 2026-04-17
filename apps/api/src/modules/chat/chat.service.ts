import { getDb } from '@lectrai/db';
import { HttpError } from '../../lib/http-error.js';
import {
  searchTranscriptChunks,
  type TranscriptChunkSearchResult,
} from '../lectures/transcript-embeddings.service.js';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const OPENAI_TRANSCRIPTIONS_URL = 'https://api.openai.com/v1/audio/transcriptions';
const ELEVENLABS_TTS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
const DEFAULT_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? 'gpt-4.1-mini';
const DEFAULT_CHAT_TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIPTION_MODEL ?? 'gpt-4o-mini-transcribe';
const DEFAULT_TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL ?? 'eleven_flash_v2_5';
const DEFAULT_TTS_VOICE_ID = process.env.ELEVENLABS_TTS_VOICE_ID ?? 'JBFqnCBsd6RMkjVDRZzb';
const FALLBACK_TTS_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';
const DEFAULT_TTS_OUTPUT_FORMAT = process.env.ELEVENLABS_TTS_OUTPUT_FORMAT ?? 'mp3_44100_128';
const DEFAULT_RETRIEVAL_TOP_K = 6;
const MAX_HISTORY_MESSAGES = 12;
const OPENAI_AUDIO_FILE_LIMIT_BYTES = 25 * 1024 * 1024;

type DbClient = ReturnType<typeof getDb>;

type ChatSessionType = 'lecture_chat' | 'course_chat' | 'exam_review';
type ChatMessageRole = 'user' | 'assistant' | 'system';

type OpenAiResponsesOutputContent = {
  type?: unknown;
  text?: unknown;
  refusal?: unknown;
};

type OpenAiResponsesOutput = {
  type?: unknown;
  content?: unknown;
};

type OpenAiResponsesUsage = {
  input_tokens?: unknown;
  output_tokens?: unknown;
  total_tokens?: unknown;
};

type OpenAiResponsesResponse = {
  output?: unknown;
  usage?: unknown;
  model?: unknown;
};

export type ChatScope = {
  courseId: string | null;
  lectureId: string | null;
  sessionType: ChatSessionType;
};

export type ChatSessionRecord = {
  id: string;
  title: string | null;
  courseId: string | null;
  lectureId: string | null;
  sessionType: ChatSessionType;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ChatCitationRecord = {
  id: string;
  lectureId: string;
  lectureTitle: string;
  citationOrder: number;
  relevanceScore: number | null;
  citedText: string | null;
};

export type ChatMessageRecord = {
  id: string;
  role: ChatMessageRole;
  messageText: string;
  modelName: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  retrievalMetadata: unknown;
  createdAt: string;
  citations: ChatCitationRecord[];
};

export type ChatSessionDetail = {
  session: ChatSessionRecord;
  messages: ChatMessageRecord[];
};

export type ChatReplyRequest = {
  sessionId: string | null;
  courseId: string | null;
  lectureId: string | null;
  message: string;
};

export type ChatTranscriptionRequest = {
  audioBase64: string;
  mimeType: string;
  fileName: string;
};

export type RetrievedContext = {
  chunks: TranscriptChunkSearchResult[];
};

export type GeneratedAssistantReply = {
  session: ChatSessionRecord;
  userMessage: ChatMessageRecord;
  assistantMessage: ChatMessageRecord;
  retrieval: RetrievedContext;
  audio: AssistantAudioPayload | null;
};

export type AssistantAudioPayload = {
  base64: string;
  mimeType: string;
  fileName: string;
};

export function parseChatReplyRequest(payload: unknown): ChatReplyRequest {
  const record = readObject(payload);
  const sessionId = readOptionalUuid(record.sessionId, 'sessionId');
  const courseId = readOptionalUuid(record.courseId, 'courseId');
  const lectureId = readOptionalUuid(record.lectureId, 'lectureId');
  const message = readRequiredString(record.message, 'message');

  return {
    sessionId,
    courseId,
    lectureId,
    message,
  };
}

export function parseChatTranscriptionRequest(payload: unknown): ChatTranscriptionRequest {
  const record = readObject(payload);

  return {
    audioBase64: readRequiredBase64(record.audioBase64, 'audioBase64'),
    mimeType: readRequiredString(record.mimeType, 'mimeType'),
    fileName: readRequiredString(record.fileName, 'fileName'),
  };
}

export async function transcribeChatAudioInput(input: ChatTranscriptionRequest) {
  const audioBytes = readBase64AudioBuffer(input.audioBase64, 'audioBase64');
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new HttpError(500, 'Missing OpenAI API key. Set OPENAI_API_KEY for audio transcription.');
  }

  if (audioBytes.byteLength > OPENAI_AUDIO_FILE_LIMIT_BYTES) {
    throw new HttpError(
      413,
      'Recording is too large to transcribe in one request.',
      'OpenAI audio transcription uploads are limited to 25 MB.'
    );
  }

  const formData = new FormData();
  formData.set('file', new Blob([audioBytes], { type: input.mimeType }), input.fileName);
  formData.set('model', DEFAULT_CHAT_TRANSCRIPTION_MODEL);
  formData.set('response_format', 'json');

  const response = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorDetails = await readProviderErrorDetails(response);
    throw new HttpError(502, 'OpenAI transcription failed.', errorDetails);
  }

  const rawResponse = (await response.json()) as {
    text?: unknown;
    language?: unknown;
    confidence?: unknown;
    model?: unknown;
  };
  const fullText = typeof rawResponse.text === 'string' ? rawResponse.text.trim() : '';

  if (!fullText) {
    throw new HttpError(502, 'OpenAI transcription did not include any text.');
  }

  return {
    fullText,
    languageCode: typeof rawResponse.language === 'string' ? rawResponse.language : null,
    modelName:
      typeof rawResponse.model === 'string' && rawResponse.model.trim().length > 0
        ? rawResponse.model
        : DEFAULT_CHAT_TRANSCRIPTION_MODEL,
    confidenceAvg: typeof rawResponse.confidence === 'number' ? rawResponse.confidence : null,
  };
}

export async function listChatSessionsForUser(
  userId: string,
  filter: { courseId?: string; lectureId?: string } = {}
) {
  const db = getDb();
  const rows = await db<DbChatSessionRow[]>`
    select
      cs.id::text as id,
      cs.title,
      cs.course_id::text as course_id,
      cs.lecture_id::text as lecture_id,
      cs.session_type,
      cs.is_pinned,
      cs.created_at::text as created_at,
      cs.updated_at::text as updated_at
    from public.chat_sessions cs
    where cs.user_id = ${userId}::uuid
      ${filter.courseId ? db`and cs.course_id = ${filter.courseId}::uuid` : db``}
      ${filter.lectureId ? db`and cs.lecture_id = ${filter.lectureId}::uuid` : db``}
    order by cs.is_pinned desc, cs.updated_at desc, cs.created_at desc
    limit 50
  `;

  return rows.map(mapChatSessionRow);
}

export async function getChatSessionDetailForUser(userId: string, sessionId: string): Promise<ChatSessionDetail> {
  const session = await getChatSessionForUser(userId, sessionId);
  const messages = await listChatMessagesForSession(sessionId);

  return {
    session,
    messages,
  };
}

export async function generateChatReplyForUser(
  userId: string,
  input: ChatReplyRequest
): Promise<GeneratedAssistantReply> {
  const resolvedScope = await resolveChatScopeForUser(userId, {
    courseId: input.courseId,
    lectureId: input.lectureId,
    sessionId: input.sessionId,
  });
  const retrievalDecision = await decideRetrievalForUser(userId, resolvedScope, input.message);
  const sessionScope = input.sessionId ? resolvedScope : retrievalDecision.scope;
  const session = input.sessionId
    ? await getChatSessionForUser(userId, input.sessionId)
    : await createChatSessionForUser(userId, sessionScope, input.message);
  const history = await listRecentChatHistory(session.id, MAX_HISTORY_MESSAGES);

  const userMessage = await createChatMessage({
    chatSessionId: session.id,
    role: 'user',
    messageText: input.message,
    userId,
  });
  const retrieval = retrievalDecision.retrieval;
  const modelResponse = await requestTutorResponse({
    scope: sessionScope,
    history,
    retrieval,
    currentMessage: input.message,
  });
  const assistantMessage = await createAssistantMessageWithCitations({
    chatSessionId: session.id,
    userId,
    messageText: modelResponse.messageText,
    modelName: modelResponse.modelName,
    usage: modelResponse.usage,
    retrieval,
  });
  const audio = await generateAssistantAudio(modelResponse.messageText);

  await touchChatSession(session.id, deriveSessionTitle(session.title, input.message));

  return {
    session: {
      ...session,
      title: deriveSessionTitle(session.title, input.message),
      updatedAt: new Date().toISOString(),
    },
    userMessage,
    assistantMessage,
    retrieval,
    audio,
  };
}

export async function getAssistantMessageForAudio(userId: string, messageId: string) {
  const db = getDb();
  const rows = await db<{
    id: string;
    message_text: string;
    model_name: string | null;
  }[]>`
    select
      cm.id::text as id,
      cm.message_text,
      cm.model_name
    from public.chat_messages cm
    inner join public.chat_sessions cs
      on cs.id = cm.chat_session_id
    where cm.id = ${messageId}::uuid
      and cm.role = 'assistant'
      and cs.user_id = ${userId}::uuid
    limit 1
  `;

  const message = rows[0];

  if (!message) {
    throw new HttpError(404, 'Assistant message not found.');
  }

  return {
    id: message.id,
    text: message.message_text,
    modelName: message.model_name,
    voiceId: DEFAULT_TTS_VOICE_ID,
    outputFormat: DEFAULT_TTS_OUTPUT_FORMAT,
    ttsModel: DEFAULT_TTS_MODEL,
  };
}

export async function requestTutorSpeechStream(input: {
  text: string;
  abortSignal?: AbortSignal;
}) {
  const response = await requestTutorSpeechResponse(input);

  if (!response.body) {
    throw new HttpError(502, 'ElevenLabs speech generation failed.');
  }

  return response;
}

async function requestTutorSpeechResponse(input: {
  text: string;
  abortSignal?: AbortSignal;
}) {
  return requestTutorSpeechResponseWithVoice(input, DEFAULT_TTS_VOICE_ID);
}

async function requestTutorSpeechResponseWithVoice(
  input: {
    text: string;
    abortSignal?: AbortSignal;
  },
  voiceId: string
) {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    throw new HttpError(500, 'Missing ElevenLabs API key. Set ELEVENLABS_API_KEY for Loki voice streaming.');
  }

  const response = await fetch(`${ELEVENLABS_TTS_URL}/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: input.text,
      model_id: DEFAULT_TTS_MODEL,
      output_format: DEFAULT_TTS_OUTPUT_FORMAT,
      apply_text_normalization: 'auto',
    }),
    signal: input.abortSignal,
  });

  if (!response.ok) {
    const errorDetails = await readProviderErrorDetails(response);
    if (shouldRetryWithFallbackVoice(errorDetails) && voiceId !== FALLBACK_TTS_VOICE_ID) {
      console.warn('[ chat ] ElevenLabs voice requires paid plan. Retrying with fallback voice.', {
        requestedVoiceId: voiceId,
        fallbackVoiceId: FALLBACK_TTS_VOICE_ID,
      });
      return requestTutorSpeechResponseWithVoice(input, FALLBACK_TTS_VOICE_ID);
    }
    throw new HttpError(502, 'ElevenLabs speech generation failed.', errorDetails);
  }

  return response;
}

async function generateAssistantAudio(text: string): Promise<AssistantAudioPayload | null> {
  try {
    const response = await requestTutorSpeechResponse({ text });
    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') ?? 'audio/mpeg';
    const fileExtension = contentType.includes('mpeg') || contentType.includes('mp3') ? 'mp3' : 'bin';

    return {
      base64: audioBuffer.toString('base64'),
      mimeType: contentType,
      fileName: `loki-reply.${fileExtension}`,
    };
  } catch (error) {
    console.error('[ chat ] Loki TTS generation failed.', error);
    return null;
  }
}

async function requestTutorResponse(input: {
  scope: ChatScope;
  history: Array<{ role: ChatMessageRole; messageText: string }>;
  retrieval: RetrievedContext;
  currentMessage: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new HttpError(500, 'Missing OpenAI API key. Set OPENAI_API_KEY for Loki.');
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DEFAULT_CHAT_MODEL,
      input: buildOpenAiInput(input),
    }),
  });

  if (!response.ok) {
    const errorDetails = await readProviderErrorDetails(response);
    console.error('[ chat ] OpenAI tutor response error.', {
      status: response.status,
      statusText: response.statusText,
      model: DEFAULT_CHAT_MODEL,
      errorDetails,
    });
    throw new HttpError(502, 'OpenAI tutor response failed.', errorDetails);
  }

  const rawResponse = (await response.json()) as OpenAiResponsesResponse;
  const messageText = extractOutputText(rawResponse)?.trim();

  if (!messageText) {
    throw new HttpError(502, 'OpenAI tutor response did not include assistant text.');
  }

  const usage = readUsage(rawResponse.usage);

  return {
    messageText,
    modelName: typeof rawResponse.model === 'string' ? rawResponse.model : DEFAULT_CHAT_MODEL,
    usage,
  };
}

function buildOpenAiInput(input: {
  scope: ChatScope;
  history: Array<{ role: ChatMessageRole; messageText: string }>;
  retrieval: RetrievedContext;
  currentMessage: string;
}) {
  const systemPrompt = [
    'You are Loki, a conversational AI tutor for LectrAI.',
    'Answer like a helpful tutor speaking to a student in a mobile voice conversation.',
    'Prefer the retrieved lecture context when it is relevant and do not invent facts that are not supported by the provided material.',
    'If the lecture context is thin or missing, say that clearly and then give the best high-level guidance you can.',
    'Keep answers concise, natural to speak aloud, and avoid markdown tables or bullet-heavy formatting.',
  ].join(' ');

  const scopeLabel = input.scope.lectureId
    ? `lecture scope (${input.scope.lectureId})`
    : input.scope.courseId
      ? `course scope (${input.scope.courseId})`
      : 'general scope';

  const retrievedContext =
    input.retrieval.chunks.length > 0
      ? input.retrieval.chunks
          .map((entry, index) => {
            return [
              `Context ${index + 1}:`,
              `Course: ${entry.transcript.courseName}`,
              `Lecture: ${entry.transcript.lectureTitle}`,
              `Speaker: ${entry.chunk.speaker ?? 'Unknown'}`,
              `Similarity: ${entry.chunk.similarity.toFixed(4)}`,
              `Excerpt: ${entry.chunk.content}`,
            ].join('\n');
          })
          .join('\n\n')
      : 'No retrieved lecture excerpts were found for this turn.';

  return [
    {
      role: 'system',
      content: [{ type: 'input_text', text: systemPrompt }],
    },
    ...input.history.map((message) => buildOpenAiHistoryMessage(message)),
    {
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: [
            `Conversation scope: ${scopeLabel}.`,
            `Retrieved lecture context:\n${retrievedContext}`,
            `Current student message: ${input.currentMessage}`,
          ].join('\n\n'),
        },
      ],
    },
  ];
}

function buildOpenAiHistoryMessage(message: { role: ChatMessageRole; messageText: string }) {
  if (message.role === 'assistant') {
    return {
      role: 'assistant' as const,
      content: [{ type: 'output_text' as const, text: message.messageText }],
    };
  }

  return {
    role: message.role,
    content: [{ type: 'input_text' as const, text: message.messageText }],
  };
}

async function retrieveContextForScope(scope: ChatScope, message: string): Promise<RetrievedContext> {
  if (!scope.courseId && !scope.lectureId) {
    return { chunks: [] };
  }

  const chunks = await searchTranscriptChunks({
    query: message,
    topK: DEFAULT_RETRIEVAL_TOP_K,
    courseId: scope.courseId ?? undefined,
    lectureId: scope.lectureId ?? undefined,
  });

  return { chunks };
}

async function decideRetrievalForUser(
  userId: string,
  scope: ChatScope,
  message: string
): Promise<{ scope: ChatScope; retrieval: RetrievedContext }> {
  if (!shouldUseSimilaritySearch(message)) {
    return {
      scope,
      retrieval: { chunks: [] },
    };
  }

  if (scope.courseId || scope.lectureId) {
    return {
      scope,
      retrieval: await retrieveContextForScope(scope, message),
    };
  }

  const retrieval = await retrieveContextForUser(userId, message);

  return {
    scope: deriveScopeFromRetrieval(retrieval, scope),
    retrieval,
  };
}

async function retrieveContextForUser(userId: string, message: string): Promise<RetrievedContext> {
  const chunks = await searchTranscriptChunks({
    query: message,
    topK: DEFAULT_RETRIEVAL_TOP_K,
    userId,
  });

  return { chunks };
}

function deriveScopeFromRetrieval(retrieval: RetrievedContext, fallbackScope: ChatScope): ChatScope {
  const topChunk = retrieval.chunks[0];

  if (!topChunk) {
    return fallbackScope;
  }

  const topLectureMatches = retrieval.chunks
    .slice(0, 3)
    .filter((entry) => entry.transcript.lectureId === topChunk.transcript.lectureId).length;

  if (topLectureMatches >= 2 || topChunk.chunk.similarity >= 0.78) {
    return {
      courseId: topChunk.transcript.courseId,
      lectureId: topChunk.transcript.lectureId,
      sessionType: 'lecture_chat',
    };
  }

  return {
    courseId: topChunk.transcript.courseId,
    lectureId: null,
    sessionType: 'course_chat',
  };
}

function shouldUseSimilaritySearch(message: string) {
  const normalized = message.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  if (
    /^(hi|hey|hello|yo|sup|thanks|thank you|ok|okay|cool|nice|help|who are you|what can you do)[!.?]*$/i.test(
      normalized
    )
  ) {
    return false;
  }

  if (normalized.split(/\s+/).length <= 2) {
    return false;
  }

  return /\b(lecture|course|class|professor|teacher|quiz|exam|midterm|final|homework|assignment|notes|topic|chapter|concept|today|taught|teaching|study|review)\b/.test(
    normalized
  );
}

async function resolveChatScopeForUser(inputUserId: string, input: {
  courseId: string | null;
  lectureId: string | null;
  sessionId: string | null;
}): Promise<ChatScope> {
  if (input.sessionId) {
    const session = await getChatSessionForUser(inputUserId, input.sessionId);

    return {
      courseId: session.courseId,
      lectureId: session.lectureId,
      sessionType: session.sessionType,
    };
  }

  if (input.lectureId) {
    const lecture = await getLectureScopeForUser(inputUserId, input.lectureId);

    return {
      courseId: lecture.courseId,
      lectureId: lecture.lectureId,
      sessionType: 'lecture_chat',
    };
  }

  if (input.courseId) {
    await assertUserOwnsCourse(inputUserId, input.courseId);

    return {
      courseId: input.courseId,
      lectureId: null,
      sessionType: 'course_chat',
    };
  }

  return {
    courseId: null,
    lectureId: null,
    sessionType: 'exam_review',
  };
}

async function getLectureScopeForUser(userId: string, lectureId: string) {
  const db = getDb();
  const rows = await db<{ lecture_id: string; course_id: string }[]>`
    select
      l.id::text as lecture_id,
      l.course_id::text as course_id
    from public.lectures l
    inner join public.courses c
      on c.id = l.course_id
    where l.id = ${lectureId}::uuid
      and c.owner_user_id = ${userId}::uuid
    limit 1
  `;

  const lecture = rows[0];

  if (!lecture) {
    throw new HttpError(404, 'Lecture not found.');
  }

  return {
    lectureId: lecture.lecture_id,
    courseId: lecture.course_id,
  };
}

async function assertUserOwnsCourse(userId: string, courseId: string) {
  const db = getDb();
  const rows = await db<{ id: string }[]>`
    select id::text as id
    from public.courses
    where id = ${courseId}::uuid
      and owner_user_id = ${userId}::uuid
    limit 1
  `;

  if (!rows[0]) {
    throw new HttpError(404, 'Course not found.');
  }
}

async function createChatSessionForUser(userId: string, scope: ChatScope, firstMessage: string) {
  const db = getDb();
  const rows = await db<DbChatSessionRow[]>`
    insert into public.chat_sessions (
      user_id,
      course_id,
      lecture_id,
      title,
      session_type
    ) values (
      ${userId}::uuid,
      ${nullable(scope.courseId)}::uuid,
      ${nullable(scope.lectureId)}::uuid,
      ${deriveSessionTitle(null, firstMessage)},
      ${scope.sessionType}
    )
    returning
      id::text as id,
      title,
      course_id::text as course_id,
      lecture_id::text as lecture_id,
      session_type,
      is_pinned,
      created_at::text as created_at,
      updated_at::text as updated_at
  `;

  return mapSingleSession(rows, 'Failed to create chat session.');
}

async function getChatSessionForUser(userId: string, sessionId: string) {
  const db = getDb();
  const rows = await db<DbChatSessionRow[]>`
    select
      cs.id::text as id,
      cs.title,
      cs.course_id::text as course_id,
      cs.lecture_id::text as lecture_id,
      cs.session_type,
      cs.is_pinned,
      cs.created_at::text as created_at,
      cs.updated_at::text as updated_at
    from public.chat_sessions cs
    where cs.id = ${sessionId}::uuid
      and cs.user_id = ${userId}::uuid
    limit 1
  `;

  return mapSingleSession(rows, 'Chat session not found.', 404);
}

async function listRecentChatHistory(sessionId: string, limit: number) {
  const db = getDb();
  const rows = await db<{ role: ChatMessageRole; message_text: string }[]>`
    select role, message_text
    from public.chat_messages
    where chat_session_id = ${sessionId}::uuid
    order by created_at desc
    limit ${limit}
  `;

  return rows
    .slice()
    .reverse()
    .map((row) => ({
      role: row.role,
      messageText: row.message_text,
    }));
}

async function createChatMessage(input: {
  chatSessionId: string;
  role: ChatMessageRole;
  messageText: string;
  userId: string | null;
  modelName?: string | null;
  usage?: { promptTokens: number | null; completionTokens: number | null; totalTokens: number | null };
  retrievalMetadata?: unknown;
}) {
  const db = getDb();
  const rows = await db<DbChatMessageRow[]>`
    insert into public.chat_messages (
      chat_session_id,
      user_id,
      role,
      message_text,
      model_name,
      prompt_tokens,
      completion_tokens,
      total_tokens,
      retrieval_metadata
    ) values (
      ${input.chatSessionId}::uuid,
      ${nullable(input.userId)}::uuid,
      ${input.role},
      ${input.messageText},
      ${nullable(input.modelName ?? null)},
      ${input.usage?.promptTokens ?? null},
      ${input.usage?.completionTokens ?? null},
      ${input.usage?.totalTokens ?? null},
      ${JSON.stringify(input.retrievalMetadata ?? null)}::jsonb
    )
    returning
      id::text as id,
      role,
      message_text,
      model_name,
      prompt_tokens,
      completion_tokens,
      total_tokens,
      retrieval_metadata,
      created_at::text as created_at
  `;

  const message = mapSingleMessage(rows, 'Failed to create chat message.');

  return {
    ...message,
    citations: [],
  };
}

async function createAssistantMessageWithCitations(input: {
  chatSessionId: string;
  userId: string;
  messageText: string;
  modelName: string;
  usage: { promptTokens: number | null; completionTokens: number | null; totalTokens: number | null };
  retrieval: RetrievedContext;
}) {
  const db = getDb();

  return db.begin(async (transaction) => {
    const tx = transaction as unknown as DbClient;
    const messageRows = await tx<DbChatMessageRow[]>`
      insert into public.chat_messages (
        chat_session_id,
        user_id,
        role,
        message_text,
        model_name,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        retrieval_metadata
      ) values (
        ${input.chatSessionId}::uuid,
        ${input.userId}::uuid,
        'assistant',
        ${input.messageText},
        ${input.modelName},
        ${input.usage.promptTokens},
        ${input.usage.completionTokens},
        ${input.usage.totalTokens},
        ${JSON.stringify(buildRetrievalMetadata(input.retrieval))}::jsonb
      )
      returning
        id::text as id,
        role,
        message_text,
        model_name,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        retrieval_metadata,
        created_at::text as created_at
    `;

    const message = mapSingleMessage(messageRows, 'Failed to save assistant response.');

    const citations: ChatCitationRecord[] = [];

    for (const [index, chunk] of input.retrieval.chunks.slice(0, 4).entries()) {
      const citationRows = await tx<DbChatCitationRow[]>`
        insert into public.chat_citations (
          chat_message_id,
          lecture_id,
          citation_order,
          relevance_score,
          cited_text
        ) values (
          ${message.id}::uuid,
          ${chunk.transcript.lectureId}::uuid,
          ${index + 1},
          ${chunk.chunk.similarity},
          ${chunk.chunk.content}
        )
        returning
          id::text as id,
          lecture_id::text as lecture_id,
          citation_order,
          relevance_score,
          cited_text,
          ''::text as lecture_title
      `;

      const inserted = citationRows[0];

      if (!inserted) {
        continue;
      }

      citations.push({
        id: inserted.id,
        lectureId: chunk.transcript.lectureId,
        lectureTitle: chunk.transcript.lectureTitle,
        citationOrder: inserted.citation_order,
        relevanceScore: inserted.relevance_score == null ? null : Number(inserted.relevance_score),
        citedText: inserted.cited_text,
      });
    }

    return {
      ...message,
      citations,
    };
  });
}

async function listChatMessagesForSession(sessionId: string): Promise<ChatMessageRecord[]> {
  const db = getDb();
  const messageRows = await db<DbChatMessageRow[]>`
    select
      cm.id::text as id,
      cm.role,
      cm.message_text,
      cm.model_name,
      cm.prompt_tokens,
      cm.completion_tokens,
      cm.total_tokens,
      cm.retrieval_metadata,
      cm.created_at::text as created_at
    from public.chat_messages cm
    where cm.chat_session_id = ${sessionId}::uuid
    order by cm.created_at asc, cm.id asc
  `;

  const citationRows = await db<DbChatCitationRow[]>`
    select
      cc.id::text as id,
      cc.chat_message_id::text as chat_message_id,
      cc.lecture_id::text as lecture_id,
      l.title as lecture_title,
      cc.citation_order,
      cc.relevance_score,
      cc.cited_text
    from public.chat_citations cc
    inner join public.lectures l
      on l.id = cc.lecture_id
    inner join public.chat_messages cm
      on cm.id = cc.chat_message_id
    where cm.chat_session_id = ${sessionId}::uuid
    order by cc.citation_order asc
  `;

  const citationsByMessageId = new Map<string, ChatCitationRecord[]>();

  for (const row of citationRows) {
    const bucket = citationsByMessageId.get(row.chat_message_id) ?? [];
    bucket.push(mapChatCitationRow(row));
    citationsByMessageId.set(row.chat_message_id, bucket);
  }

  return messageRows.map((row) => ({
    ...mapChatMessageRow(row),
    citations: citationsByMessageId.get(row.id) ?? [],
  }));
}

async function touchChatSession(sessionId: string, title: string | null) {
  const db = getDb();
  await db`
    update public.chat_sessions
    set
      title = ${nullable(title)},
      updated_at = timezone('utc', now())
    where id = ${sessionId}::uuid
  `;
}

function buildRetrievalMetadata(retrieval: RetrievedContext) {
  return {
    chunkCount: retrieval.chunks.length,
    chunks: retrieval.chunks.map((entry) => ({
      lectureId: entry.transcript.lectureId,
      lectureTitle: entry.transcript.lectureTitle,
      courseId: entry.transcript.courseId,
      courseName: entry.transcript.courseName,
      transcriptId: entry.transcript.id,
      chunkId: entry.chunk.id,
      chunkIndex: entry.chunk.chunkIndex,
      speaker: entry.chunk.speaker,
      similarity: entry.chunk.similarity,
      content: entry.chunk.content,
    })),
  };
}

function deriveSessionTitle(existingTitle: string | null, message: string) {
  if (existingTitle && existingTitle.trim().length > 0) {
    return existingTitle;
  }

  const normalized = message.trim().replace(/\s+/g, ' ');

  if (normalized.length <= 60) {
    return normalized;
  }

  return `${normalized.slice(0, 57)}...`;
}

function readUsage(usage: unknown) {
  const source = usage as OpenAiResponsesUsage | null | undefined;

  return {
    promptTokens: typeof source?.input_tokens === 'number' ? source.input_tokens : null,
    completionTokens: typeof source?.output_tokens === 'number' ? source.output_tokens : null,
    totalTokens: typeof source?.total_tokens === 'number' ? source.total_tokens : null,
  };
}

function extractOutputText(response: OpenAiResponsesResponse) {
  if (!Array.isArray(response.output)) {
    return null;
  }

  const fragments: string[] = [];

  for (const item of response.output as OpenAiResponsesOutput[]) {
    if (item?.type !== 'message' || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content as OpenAiResponsesOutputContent[]) {
      if (content?.type === 'output_text' && typeof content.text === 'string') {
        fragments.push(content.text);
      }
    }
  }

  return fragments.join('').trim() || null;
}

async function readProviderErrorDetails(response: Response) {
  try {
    return await response.json();
  } catch {
    return await response.text().catch(() => response.statusText);
  }
}

function shouldRetryWithFallbackVoice(errorDetails: unknown) {
  const detailRecord = readObjectRecord(errorDetails);
  const providerDetail = readObjectRecord(detailRecord?.detail);

  return providerDetail?.type === 'payment_required' || providerDetail?.code === 'paid_plan_required';
}

function readObjectRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'Request body must be an object.');
  }

  return value as Record<string, unknown>;
}

function readRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, `${fieldName} is required.`);
  }

  return value.trim();
}

function readRequiredBase64(value: unknown, fieldName: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, `${fieldName} is required.`);
  }

  return value.trim();
}

function readBase64AudioBuffer(value: string, fieldName: string) {
  try {
    return Buffer.from(value, 'base64');
  } catch {
    throw new HttpError(400, `${fieldName} must be valid base64 audio data.`);
  }
}

function readOptionalUuid(value: unknown, fieldName: string) {
  if (value == null || value === '') {
    return null;
  }

  if (typeof value !== 'string' || !UUID_REGEX.test(value)) {
    throw new HttpError(400, `${fieldName} must be a valid UUID.`);
  }

  return value;
}

function nullable(value: string | null) {
  return value == null ? null : value;
}

function mapSingleSession(rows: DbChatSessionRow[], errorMessage: string, statusCode = 500) {
  const row = rows[0];

  if (!row) {
    throw new HttpError(statusCode, errorMessage);
  }

  return mapChatSessionRow(row);
}

function mapSingleMessage(rows: DbChatMessageRow[], errorMessage: string) {
  const row = rows[0];

  if (!row) {
    throw new HttpError(500, errorMessage);
  }

  return mapChatMessageRow(row);
}

function mapChatSessionRow(row: DbChatSessionRow): ChatSessionRecord {
  return {
    id: row.id,
    title: row.title,
    courseId: row.course_id,
    lectureId: row.lecture_id,
    sessionType: row.session_type,
    isPinned: row.is_pinned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapChatMessageRow(row: DbChatMessageRow): Omit<ChatMessageRecord, 'citations'> {
  return {
    id: row.id,
    role: row.role,
    messageText: row.message_text,
    modelName: row.model_name,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    totalTokens: row.total_tokens,
    retrievalMetadata: row.retrieval_metadata,
    createdAt: row.created_at,
  };
}

function mapChatCitationRow(row: DbChatCitationRow): ChatCitationRecord {
  return {
    id: row.id,
    lectureId: row.lecture_id,
    lectureTitle: row.lecture_title,
    citationOrder: row.citation_order,
    relevanceScore: row.relevance_score == null ? null : Number(row.relevance_score),
    citedText: row.cited_text,
  };
}

type DbChatSessionRow = {
  id: string;
  title: string | null;
  course_id: string | null;
  lecture_id: string | null;
  session_type: ChatSessionType;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
};

type DbChatMessageRow = {
  id: string;
  role: ChatMessageRole;
  message_text: string;
  model_name: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  retrieval_metadata: unknown;
  created_at: string;
};

type DbChatCitationRow = {
  id: string;
  chat_message_id: string;
  lecture_id: string;
  lecture_title: string;
  citation_order: number;
  relevance_score: number | string | null;
  cited_text: string | null;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
