import { getDb } from '@lectrai/db';
import OpenAI from 'openai';
import { env } from '../../config/env.js';
import { HttpError } from '../../lib/http-error.js';
import { listCourseFilesForUser, listCoursesForUser, type CourseFileRecord, type CourseRecord } from '../courses/courses.service.js';
import { listLectureRecordingsForUser, type LectureRecordingListItem } from '../lectures/lectures.service.js';
import {
  searchTranscriptChunks,
  type TranscriptChunkSearchResult,
} from '../lectures/transcript-embeddings.service.js';

const OPENAI_TRANSCRIPTIONS_URL = 'https://api.openai.com/v1/audio/transcriptions';
const ELEVENLABS_TTS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
const DEFAULT_CHAT_MODEL = env.openAiChatModel ?? 'gpt-4.1-mini';
const DEFAULT_CHAT_TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIPTION_MODEL ?? 'gpt-4o-mini-transcribe';
const DEFAULT_TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL ?? 'eleven_flash_v2_5';
const DEFAULT_TTS_VOICE_ID = process.env.ELEVENLABS_TTS_VOICE_ID ?? 'JBFqnCBsd6RMkjVDRZzb';
const FALLBACK_TTS_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';
const DEFAULT_TTS_OUTPUT_FORMAT = process.env.ELEVENLABS_TTS_OUTPUT_FORMAT ?? 'mp3_44100_128';
const DEFAULT_RETRIEVAL_TOP_K = 5;
const SUMMARY_RETRIEVAL_TOP_K = 20;
const QUIZ_RETRIEVAL_TOP_K = 10;
const SPECIFIC_RETRIEVAL_TOP_K = 5;
const MAX_RETRIEVAL_TOP_K = 25;
const DEFAULT_SCOPE_ITEM_LIMIT = 5;
const MAX_RETRIEVAL_PLANNER_STEPS = 4;
const MAX_HISTORY_MESSAGES = 12;
const OPENAI_AUDIO_FILE_LIMIT_BYTES = 25 * 1024 * 1024;
const LIST_COURSES_TOOL_NAME = 'list_courses_catalog';
const LIST_RECENT_LECTURES_TOOL_NAME = 'list_recent_course_lectures';
const LIST_RECENT_FILES_TOOL_NAME = 'list_recent_course_files';
const TRANSCRIPT_SEARCH_TOOL_NAME = 'search_transcript_chunks';
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

let openAiClient: OpenAI | null = null;

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
  id?: unknown;
  output?: unknown;
  usage?: unknown;
  model?: unknown;
};

type RetrievalDecisionMetadata = {
  requiresAdditionalScope: boolean;
  functionName: typeof TRANSCRIPT_SEARCH_TOOL_NAME | null;
  functionArguments: TranscriptSearchToolArgs | null;
  selectedScope: ChatScope;
};

type TranscriptSearchToolArgs = {
  query: string;
  scopeType: 'user' | 'course' | 'lecture';
  topK?: number;
  courseId?: string;
  lectureId?: string;
  recordedOnOrAfter?: string;
  recordedOnOrBefore?: string;
};

type RecentCourseLecturesToolArgs = {
  courseId: string;
  limit?: number;
};

type RecentCourseFilesToolArgs = {
  courseId: string;
  limit?: number;
};

type PlannerScopeItem =
  | {
      type: 'course';
      id: string;
      title: string;
      detail: string;
    }
  | {
      type: 'lecture';
      id: string;
      courseId: string;
      title: string;
      detail: string;
    }
  | {
      type: 'file';
      id: string;
      courseId: string;
      title: string;
      detail: string;
    };

type PlannerFunctionCall = {
  name: string;
  arguments: string;
  callId: string;
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
  muteAudioResponse: boolean;
};

export type ChatTranscriptionRequest = {
  audioBase64: string;
  mimeType: string;
  fileName: string;
};

export type RetrievedContext = {
  chunks: TranscriptChunkSearchResult[];
  scopeItems?: PlannerScopeItem[];
  decision?: RetrievalDecisionMetadata;
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
  const muteAudioResponse = readOptionalBoolean(record.muteAudioResponse, 'muteAudioResponse') ?? false;

  return {
    sessionId,
    courseId,
    lectureId,
    message,
    muteAudioResponse,
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
  formData.set('language', 'en');
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
  const sessionScopeHint = input.sessionId
    ? await getRecentSessionScopeHintForUser(userId, input.sessionId)
    : null;
  const retrievalDecision = await decideRetrievalForUser(userId, resolvedScope, input.message, sessionScopeHint);
  const sessionScope = retrievalDecision.scope;
  const session = input.sessionId
    ? await getChatSessionForUser(userId, input.sessionId)
    : await createChatSessionForUser(
        userId,
        { courseId: null, lectureId: null, sessionType: 'exam_review' },
        input.message
      );
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
  const audio = input.muteAudioResponse ? null : await generateAssistantAudio(modelResponse.messageText);

  await touchChatSession(session.id, {
    title: deriveSessionTitle(session.title, input.message),
    scope: sessionScope,
  });

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
  const rawResponse = (await getOpenAiClient().responses.create({
    model: DEFAULT_CHAT_MODEL,
    input: buildOpenAiInput(input) as any,
  })) as unknown as OpenAiResponsesResponse;
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
  const messageIntent = classifyMessageIntent(input.currentMessage);
  const systemPrompt = [
    'You are Loki, a conversational AI tutor for LectrAI.',
    'Answer like a helpful tutor speaking to a student in a mobile voice conversation.',
    'Always answer in English only.',
    'Prefer the retrieved lecture context when it is relevant and do not invent facts that are not supported by the provided material.',
    'If the lecture context is thin or missing, say that clearly and then give the best high-level guidance you can.',
    'Keep answers concise, natural to speak aloud, and avoid markdown tables or bullet-heavy formatting.',
    'If the user asks for a summary or recap of recent or latest lectures, synthesize across the retrieved lecture set instead of focusing on only one lecture unless the user explicitly named one lecture.',
    'If the retrieved context spans multiple lecture dates or titles, make that synthesis explicit in the answer.',
    'If the user asks for quiz or practice questions, use the lecture material as background knowledge only.',
    'For quiz generation, do not ask speaker-identification questions, quote-matching questions, line-specific transcript questions, or questions about who said something in lecture.',
    'For quiz generation, produce concept-based questions that test understanding of the knowledge taught in the lectures rather than recall of transcript wording.',
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
  const scopeContext =
    input.retrieval.scopeItems && input.retrieval.scopeItems.length > 0
      ? input.retrieval.scopeItems
          .map((item, index) => `Scope ${index + 1}: [${item.type}] ${item.title} - ${item.detail}`)
          .join('\n')
      : 'No extra course, lecture, or file scope metadata was collected for this turn.';

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
            `Detected intent: ${messageIntent}.`,
            `Retrieved scope metadata:\n${scopeContext}`,
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

async function decideRetrievalForUser(
  userId: string,
  scope: ChatScope,
  message: string,
  sessionScopeHint: ChatScope | null
): Promise<{ scope: ChatScope; retrieval: RetrievedContext }> {
  return runDynamicRetrievalPlannerForUser(userId, message, sessionScopeHint);
}

function deriveScopeFromRetrieval(retrieval: RetrievedContext, fallbackScope: ChatScope): ChatScope {
  const topChunk = retrieval.chunks[0];

  if (!topChunk) {
    return fallbackScope;
  }

  const topLectureMatches = retrieval.chunks
    .slice(0, 3)
    .filter((entry) => entry.transcript.lectureId === topChunk.transcript.lectureId).length;
  const lectureIds = new Set(
    retrieval.chunks
      .slice(0, 5)
      .map((entry) => entry.transcript.lectureId)
      .filter((lectureId) => lectureId && lectureId.length > 0)
  );

  if (lectureIds.size > 1) {
    return {
      courseId: topChunk.transcript.courseId,
      lectureId: null,
      sessionType: 'course_chat',
    };
  }

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

async function resolveChatScopeForUser(inputUserId: string, input: {
  courseId: string | null;
  lectureId: string | null;
  sessionId: string | null;
}): Promise<ChatScope> {
  if (input.sessionId) {
    await getChatSessionForUser(inputUserId, input.sessionId);

    return {
      courseId: null,
      lectureId: null,
      sessionType: 'exam_review',
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

async function getRecentSessionScopeHintForUser(userId: string, sessionId: string): Promise<ChatScope | null> {
  const db = getDb();
  const rows = await db<{ retrieval_metadata: unknown }[]>`
    select cm.retrieval_metadata
    from public.chat_messages cm
    inner join public.chat_sessions cs
      on cs.id = cm.chat_session_id
    where cm.chat_session_id = ${sessionId}::uuid
      and cs.user_id = ${userId}::uuid
      and cm.role = 'assistant'
      and cm.retrieval_metadata is not null
    order by cm.created_at desc, cm.id desc
    limit 1
  `;

  const metadata = rows[0]?.retrieval_metadata;

  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  const metadataRecord = metadata as Record<string, unknown>;
  const decision =
    metadataRecord.decision && typeof metadataRecord.decision === 'object' && !Array.isArray(metadataRecord.decision)
      ? (metadataRecord.decision as Record<string, unknown>)
      : null;
  const selectedScope =
    decision?.selectedScope && typeof decision.selectedScope === 'object' && !Array.isArray(decision.selectedScope)
      ? (decision.selectedScope as Record<string, unknown>)
      : null;

  if (!selectedScope) {
    return null;
  }

  const courseId = typeof selectedScope.courseId === 'string' && UUID_REGEX.test(selectedScope.courseId)
    ? selectedScope.courseId
    : null;
  const lectureId = typeof selectedScope.lectureId === 'string' && UUID_REGEX.test(selectedScope.lectureId)
    ? selectedScope.lectureId
    : null;
  const sessionType =
    selectedScope.sessionType === 'lecture_chat' ||
    selectedScope.sessionType === 'course_chat' ||
    selectedScope.sessionType === 'exam_review'
      ? selectedScope.sessionType
      : lectureId
        ? 'lecture_chat'
        : courseId
          ? 'course_chat'
          : 'exam_review';

  if (!courseId && !lectureId) {
    return null;
  }

  return {
    courseId,
    lectureId,
    sessionType,
  };
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

async function touchChatSession(
  sessionId: string,
  input: {
    title: string | null;
    scope: ChatScope;
  }
) {
  const db = getDb();
  await db`
    update public.chat_sessions
    set
      course_id = null,
      lecture_id = null,
      title = ${nullable(input.title)},
      session_type = 'exam_review',
      updated_at = timezone('utc', now())
    where id = ${sessionId}::uuid
  `;
}

function buildRetrievalMetadata(retrieval: RetrievedContext) {
  return {
    decision: retrieval.decision ?? null,
    scopeItems: retrieval.scopeItems ?? [],
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

async function runDynamicRetrievalPlannerForUser(
  userId: string,
  message: string,
  sessionScopeHint: ChatScope | null
): Promise<{ scope: ChatScope; retrieval: RetrievedContext }> {
  const courses = await listCoursesForUser(userId);
  const plannerIntro = buildPlannerIntro(message, courses);
  let response = (await getOpenAiClient().responses.create({
    model: DEFAULT_CHAT_MODEL,
    input: plannerIntro as any,
    tools: buildRetrievalPlannerTools() as any,
    tool_choice: 'auto',
  })) as unknown as OpenAiResponsesResponse;
  let collectedScopeItems: PlannerScopeItem[] = [];
  let latestChunks: TranscriptChunkSearchResult[] = [];
  let lastToolName: string | null = null;
  let lastToolArgs: Record<string, unknown> | null = null;

  for (let step = 0; step < MAX_RETRIEVAL_PLANNER_STEPS; step += 1) {
    const toolCalls = extractFunctionCalls(response);

    if (toolCalls.length === 0) {
      const selectedScope = deriveDynamicScopeFromResults(latestChunks, collectedScopeItems);

      return {
        scope: selectedScope,
        retrieval: {
          chunks: latestChunks,
          scopeItems: collectedScopeItems,
          decision: {
            requiresAdditionalScope: latestChunks.length > 0 || collectedScopeItems.length > 0,
            functionName: lastToolName === TRANSCRIPT_SEARCH_TOOL_NAME ? TRANSCRIPT_SEARCH_TOOL_NAME : null,
            functionArguments: lastToolName === TRANSCRIPT_SEARCH_TOOL_NAME
              ? readTranscriptSearchToolArgs(JSON.stringify(lastToolArgs ?? {}))
              : null,
            selectedScope,
          },
        },
      };
    }

    const toolOutputs: Array<Record<string, unknown>> = [];

    for (const toolCall of toolCalls) {
      const result = await executePlannerToolCall(userId, toolCall, message, sessionScopeHint);
      lastToolName = toolCall.name;
      lastToolArgs = result.serializedArguments;

      if (result.retrievedChunks.length > 0) {
        latestChunks = result.retrievedChunks;
      }

      if (result.scopeItems.length > 0) {
        collectedScopeItems = result.scopeItems;
      }

      toolOutputs.push({
        type: 'function_call_output',
        call_id: toolCall.callId,
        output: JSON.stringify(result.output),
      });
    }

    if (typeof response.id !== 'string' || response.id.length === 0) {
      throw new HttpError(502, 'OpenAI retrieval planner response did not include a response id.');
    }

    response = (await getOpenAiClient().responses.create({
      model: DEFAULT_CHAT_MODEL,
      previous_response_id: response.id,
      input: toolOutputs as any,
      tools: buildRetrievalPlannerTools() as any,
      tool_choice: 'auto',
    })) as unknown as OpenAiResponsesResponse;
  }

  const selectedScope = deriveDynamicScopeFromResults(latestChunks, collectedScopeItems);

  return {
    scope: selectedScope,
    retrieval: {
      chunks: latestChunks,
      scopeItems: collectedScopeItems,
      decision: {
        requiresAdditionalScope: latestChunks.length > 0 || collectedScopeItems.length > 0,
        functionName: lastToolName === TRANSCRIPT_SEARCH_TOOL_NAME ? TRANSCRIPT_SEARCH_TOOL_NAME : null,
        functionArguments:
          lastToolName === TRANSCRIPT_SEARCH_TOOL_NAME ? readTranscriptSearchToolArgs(JSON.stringify(lastToolArgs ?? {})) : null,
        selectedScope,
      },
    },
  };
}

function buildPlannerIntro(message: string, courses: CourseRecord[]) {
  const messageIntent = classifyMessageIntent(message);
  const courseCatalog =
    courses.length > 0
      ? courses
          .map((course, index) =>
            [
              `Course ${index + 1}:`,
              `id=${course.id}`,
              `name=${course.courseName}`,
              course.courseCode ? `code=${course.courseCode}` : null,
              course.instructorName ? `instructor=${course.instructorName}` : null,
              course.description ? `description=${course.description}` : null,
              course.semester ? `semester=${course.semester}` : null,
            ]
              .filter(Boolean)
              .join(' | ')
          )
          .join('\n')
      : 'No courses available.';

  return [
    {
      role: 'system',
      content: [
        {
          type: 'input_text',
          text: [
            'You are the dynamic retrieval planner for LectrAI.',
            'Every user message must be treated independently. Do not assume the chat session is tied to a fixed course or lecture.',
            'Use the available tools to identify the best course, lecture set, or file set for this specific message.',
            'You may call tools in sequence, for example: list courses, then list recent lectures or files, then search transcript chunks.',
            'Only call transcript search when the answer should rely on lecture transcript content.',
            'When transcript search is useful, choose topK dynamically using these defaults: around 20 for summaries or recaps, around 10 for quiz or practice-question generation, and around 5 for targeted factual questions.',
            'If the user asks about recent materials or uploaded materials, you may use lecture or file listing tools even before transcript search.',
            'If the user asks for the latest lecture, recent lectures, today\'s lecture, this week\'s lectures, or a summary across recent lectures, call list_recent_course_lectures first for the relevant course before transcript search.',
            'After listing recent lectures, use the returned lecture dates to search transcripts across the recent lecture window, usually with a course-scoped transcript search and recordedOnOrAfter set to the oldest lecture date you want included.',
            'Do not collapse a recent-lectures summary into one lecture unless the user explicitly names one lecture or the tool results show only one relevant lecture.',
            'For summaries of multiple lectures, prefer course scope plus date filters over lecture scope.',
            'For quiz generation, retrieve enough context for conceptual coverage and avoid planning around speaker-specific or quote-specific details.',
          ].join(' '),
        },
      ],
    },
    {
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: [
            `Student message: ${message}`,
            `Detected intent: ${messageIntent}`,
            `Available courses:\n${courseCatalog}`,
          ].join('\n\n'),
        },
      ],
    },
  ];
}

function buildRetrievalPlannerTools() {
  return [
    {
      type: 'function',
      name: LIST_COURSES_TOOL_NAME,
      description: 'Return the available courses for the current user with course metadata.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {},
        required: [],
      },
    },
    {
      type: 'function',
      name: LIST_RECENT_LECTURES_TOOL_NAME,
      description: 'Return recent lectures for a course. Use this to discover lecture dates and titles before transcript retrieval.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          courseId: { type: 'string' },
          limit: { type: ['integer', 'null'], minimum: 1, maximum: 10 },
        },
        required: ['courseId', 'limit'],
      },
    },
    {
      type: 'function',
      name: LIST_RECENT_FILES_TOOL_NAME,
      description: 'Return recent uploaded files for a course. Use this when the user likely refers to notes, slides, or uploaded materials.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          courseId: { type: 'string' },
          limit: { type: ['integer', 'null'], minimum: 1, maximum: 10 },
        },
        required: ['courseId', 'limit'],
      },
    },
    {
      type: 'function',
      name: TRANSCRIPT_SEARCH_TOOL_NAME,
      description:
        'Search transcript chunks across the current user, one course, or one lecture. Supports optional lecture recorded date filtering.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string' },
          scopeType: { type: 'string', enum: ['user', 'course', 'lecture'] },
          topK: { type: ['integer', 'null'], minimum: 1, maximum: MAX_RETRIEVAL_TOP_K },
          courseId: { type: ['string', 'null'] },
          lectureId: { type: ['string', 'null'] },
          recordedOnOrAfter: { type: ['string', 'null'] },
          recordedOnOrBefore: { type: ['string', 'null'] },
        },
        required: ['query', 'scopeType', 'topK', 'courseId', 'lectureId', 'recordedOnOrAfter', 'recordedOnOrBefore'],
      },
    },
  ];
}

async function executePlannerToolCall(
  userId: string,
  toolCall: PlannerFunctionCall,
  fallbackQuery: string,
  sessionScopeHint: ChatScope | null
) {
  if (toolCall.name === LIST_COURSES_TOOL_NAME) {
    const courses = await listCoursesForUser(userId);
    return {
      output: { courses: courses.map(mapCourseForPlanner) },
      scopeItems: courses.map(mapCourseToScopeItem),
      retrievedChunks: [] as TranscriptChunkSearchResult[],
      serializedArguments: {},
    };
  }

  if (toolCall.name === LIST_RECENT_LECTURES_TOOL_NAME) {
    const args = readRecentCourseLecturesToolArgs(toolCall.arguments);
    const lectures = await listLectureRecordingsForUser(userId, args.courseId);
    const limited = lectures.slice(0, args.limit ?? DEFAULT_SCOPE_ITEM_LIMIT);
    return {
      output: { lectures: limited.map(mapLectureForPlanner) },
      scopeItems: limited.map(mapLectureToScopeItem),
      retrievedChunks: [] as TranscriptChunkSearchResult[],
      serializedArguments: args as Record<string, unknown>,
    };
  }

  if (toolCall.name === LIST_RECENT_FILES_TOOL_NAME) {
    const args = readRecentCourseFilesToolArgs(toolCall.arguments);
    const files = await listCourseFilesForUser(userId, args.courseId);
    const limited = files.slice(0, args.limit ?? DEFAULT_SCOPE_ITEM_LIMIT);
    return {
      output: { files: limited.map(mapCourseFileForPlanner) },
      scopeItems: limited.map(mapCourseFileToScopeItem),
      retrievedChunks: [] as TranscriptChunkSearchResult[],
      serializedArguments: args as Record<string, unknown>,
    };
  }

  if (toolCall.name === TRANSCRIPT_SEARCH_TOOL_NAME) {
    const args = readTranscriptSearchToolArgs(toolCall.arguments, fallbackQuery, sessionScopeHint);
    const retrieval = await executeTranscriptSearchTool(userId, args, fallbackQuery);
    return {
      output: {
        chunks: retrieval.chunks.map((entry) => ({
          lectureId: entry.transcript.lectureId,
          lectureTitle: entry.transcript.lectureTitle,
          courseId: entry.transcript.courseId,
          courseName: entry.transcript.courseName,
          recordedAt: entry.transcript.recordedAt,
          chunkIndex: entry.chunk.chunkIndex,
          speaker: entry.chunk.speaker,
          similarity: entry.chunk.similarity,
          content: entry.chunk.content,
        })),
      },
      scopeItems: [] as PlannerScopeItem[],
      retrievedChunks: retrieval.chunks,
      serializedArguments: args as Record<string, unknown>,
    };
  }

  throw new HttpError(502, `OpenAI retrieval planner requested unsupported function "${toolCall.name}".`);
}

async function executeTranscriptSearchTool(
  userId: string,
  toolArgs: TranscriptSearchToolArgs,
  message: string
): Promise<RetrievedContext> {
  const topK = resolveTranscriptSearchTopK(toolArgs.topK, message);

  const chunks = await searchTranscriptChunks({
    query: toolArgs.query,
    topK,
    userId,
    courseId: toolArgs.scopeType === 'course' ? toolArgs.courseId : undefined,
    lectureId: toolArgs.scopeType === 'lecture' ? toolArgs.lectureId : undefined,
    recordedOnOrAfter: toolArgs.recordedOnOrAfter,
    recordedOnOrBefore: toolArgs.recordedOnOrBefore,
  });

  return { chunks };
}

function deriveDynamicScopeFromResults(chunks: TranscriptChunkSearchResult[], scopeItems: PlannerScopeItem[]): ChatScope {
  if (chunks.length > 0) {
    return deriveScopeFromRetrieval({ chunks }, { courseId: null, lectureId: null, sessionType: 'exam_review' });
  }

  const lectureScopeItem = scopeItems.find((item) => item.type === 'lecture');

  if (lectureScopeItem && 'courseId' in lectureScopeItem) {
    return {
      courseId: lectureScopeItem.courseId,
      lectureId: lectureScopeItem.id,
      sessionType: 'lecture_chat',
    };
  }

  const courseScopeItem = scopeItems.find((item) => item.type === 'course');

  if (courseScopeItem) {
    return {
      courseId: courseScopeItem.id,
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

function extractFunctionCalls(response: OpenAiResponsesResponse) {
  if (!Array.isArray(response.output)) {
    return [];
  }

  return (response.output as Array<Record<string, unknown>>)
    .filter((item) => item?.type === 'function_call')
    .map((item) => ({
      name: typeof item.name === 'string' ? item.name : '',
      arguments: typeof item.arguments === 'string' ? item.arguments : '{}',
      callId: typeof item.call_id === 'string' ? item.call_id : '',
    }))
    .filter((item) => item.name.length > 0);
}

function readTranscriptSearchToolArgs(rawArguments: string, fallbackQuery?: string, fallbackScope?: ChatScope | null): TranscriptSearchToolArgs {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawArguments);
  } catch {
    throw new HttpError(502, 'OpenAI retrieval planner returned invalid tool arguments.', rawArguments);
  }

  const record = readObject(parsed);
  const query = readPlannerQuery(record.query, fallbackQuery);
  const scopeType = readTranscriptSearchScope(record.scopeType);
  const topK = readOptionalPositiveInteger(record.topK, 'topK');
  const courseId = readOptionalUuid(record.courseId, 'courseId');
  const lectureId = readOptionalUuid(record.lectureId, 'lectureId');
  const recordedOnOrAfter = readOptionalIsoDate(record.recordedOnOrAfter, 'recordedOnOrAfter');
  const recordedOnOrBefore = readOptionalIsoDate(record.recordedOnOrBefore, 'recordedOnOrBefore');

  const fallbackCourseId = fallbackScope?.courseId ?? undefined;
  const resolvedCourseId = courseId ?? (scopeType === 'course' ? fallbackCourseId : undefined);
  const resolvedLectureId =
    lectureId ?? (scopeType === 'lecture' ? fallbackScope?.lectureId ?? undefined : undefined);

  if (scopeType === 'course' && !resolvedCourseId) {
    throw new HttpError(502, 'OpenAI retrieval planner omitted courseId for a course-scoped search.');
  }

  if (scopeType === 'lecture' && !resolvedLectureId) {
    if (fallbackCourseId) {
      return {
        query,
        scopeType: 'course',
        topK: topK ?? undefined,
        courseId: fallbackCourseId,
        lectureId: undefined,
        recordedOnOrAfter: recordedOnOrAfter ?? undefined,
        recordedOnOrBefore: recordedOnOrBefore ?? undefined,
      };
    }

    return {
      query,
      scopeType: 'user',
      topK: topK ?? undefined,
      courseId: undefined,
      lectureId: undefined,
      recordedOnOrAfter: recordedOnOrAfter ?? undefined,
      recordedOnOrBefore: recordedOnOrBefore ?? undefined,
    };
  }

  return {
    query,
    scopeType,
    topK: topK ?? undefined,
    courseId: resolvedCourseId,
    lectureId: resolvedLectureId,
    recordedOnOrAfter: recordedOnOrAfter ?? undefined,
    recordedOnOrBefore: recordedOnOrBefore ?? undefined,
  };
}

function readPlannerQuery(value: unknown, fallbackQuery?: string) {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (typeof fallbackQuery === 'string' && fallbackQuery.trim().length > 0) {
    return fallbackQuery.trim();
  }

  throw new HttpError(400, 'query is required.');
}

function readRecentCourseLecturesToolArgs(rawArguments: string): RecentCourseLecturesToolArgs {
  const record = readJsonObject(rawArguments, 'OpenAI retrieval planner returned invalid lecture tool arguments.');

  return {
    courseId: readRequiredString(record.courseId, 'courseId'),
    limit: readOptionalBoundedInteger(record.limit, 'limit', 1, 10) ?? DEFAULT_SCOPE_ITEM_LIMIT,
  };
}

function readRecentCourseFilesToolArgs(rawArguments: string): RecentCourseFilesToolArgs {
  const record = readJsonObject(rawArguments, 'OpenAI retrieval planner returned invalid file tool arguments.');

  return {
    courseId: readRequiredString(record.courseId, 'courseId'),
    limit: readOptionalBoundedInteger(record.limit, 'limit', 1, 10) ?? DEFAULT_SCOPE_ITEM_LIMIT,
  };
}

function readJsonObject(rawArguments: string, errorMessage: string) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawArguments);
  } catch {
    throw new HttpError(502, errorMessage, rawArguments);
  }

  return readObject(parsed);
}

function mapCourseForPlanner(course: CourseRecord) {
  return {
    id: course.id,
    courseName: course.courseName,
    courseCode: course.courseCode,
    instructorName: course.instructorName,
    description: course.description,
    semester: course.semester,
    courseType: course.courseType,
  };
}

function mapCourseToScopeItem(course: CourseRecord): PlannerScopeItem {
  return {
    type: 'course',
    id: course.id,
    title: course.courseName,
    detail: [
      course.courseCode,
      course.instructorName ? `Instructor: ${course.instructorName}` : null,
      course.description ? `Description: ${course.description}` : null,
      course.semester ? `Semester: ${course.semester}` : null,
    ]
      .filter(Boolean)
      .join(' | '),
  };
}

function mapLectureForPlanner(lecture: LectureRecordingListItem) {
  const recordedOn = toIsoDateOnly(lecture.lecture.recordedAt);

  return {
    lectureId: lecture.lecture.id,
    courseId: lecture.lecture.courseId,
    title: lecture.lecture.title,
    recordedAt: recordedOn,
    transcriptStatus: lecture.transcript?.status ?? null,
    transcriptGeneratedAt: lecture.transcript?.generatedAt ?? null,
  };
}

function mapLectureToScopeItem(lecture: LectureRecordingListItem): PlannerScopeItem {
  const recordedOn = toIsoDateOnly(lecture.lecture.recordedAt);

  return {
    type: 'lecture',
    id: lecture.lecture.id,
    courseId: lecture.lecture.courseId,
    title: lecture.lecture.title,
    detail: [
      recordedOn ? `Recorded: ${recordedOn}` : null,
      lecture.transcript?.status ? `Transcript: ${lecture.transcript.status}` : null,
    ]
      .filter(Boolean)
      .join(' | '),
  };
}

function mapCourseFileForPlanner(file: CourseFileRecord) {
  return {
    fileId: file.id,
    courseId: file.courseId,
    title: file.title,
    description: file.description,
    relationType: file.relationType,
    originalFilename: file.originalFilename,
    mimeType: file.mimeType,
    uploadedAt: file.uploadedAt,
  };
}

function mapCourseFileToScopeItem(file: CourseFileRecord): PlannerScopeItem {
  return {
    type: 'file',
    id: file.id,
    courseId: file.courseId,
    title: file.title,
    detail: [
      file.relationType,
      file.originalFilename,
      file.description ? `Description: ${file.description}` : null,
      file.uploadedAt ? `Uploaded: ${file.uploadedAt}` : null,
    ]
      .filter(Boolean)
      .join(' | '),
  };
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

function readOptionalPositiveInteger(value: unknown, fieldName: string) {
  if (value == null || value === '') {
    return null;
  }

  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new HttpError(400, `${fieldName} must be a positive integer.`);
  }

  return Number(value);
}

function readOptionalBoundedInteger(
  value: unknown,
  fieldName: string,
  min: number,
  max: number
) {
  if (value == null || value === '') {
    return null;
  }

  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new HttpError(400, `${fieldName} must be an integer between ${min} and ${max}.`);
  }

  return Number(value);
}

function readRequiredBase64(value: unknown, fieldName: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, `${fieldName} is required.`);
  }

  return value.trim();
}

function readOptionalBoolean(value: unknown, fieldName: string) {
  if (value == null || value === '') {
    return null;
  }

  if (typeof value !== 'boolean') {
    throw new HttpError(400, `${fieldName} must be a boolean.`);
  }

  return value;
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

function readOptionalIsoDate(value: unknown, fieldName: string) {
  if (value == null || value === '') {
    return null;
  }

  if (typeof value !== 'string' || !ISO_DATE_REGEX.test(value)) {
    throw new HttpError(400, `${fieldName} must be an ISO date in YYYY-MM-DD format.`);
  }

  return value;
}

function toIsoDateOnly(value: unknown) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }

    return value.toISOString().slice(0, 10);
  }

  const normalized = typeof value === 'string' ? value : String(value);
  const trimmed = normalized.trim();

  if (ISO_DATE_REGEX.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function readTranscriptSearchScope(value: unknown): TranscriptSearchToolArgs['scopeType'] {
  if (value === 'user' || value === 'course' || value === 'lecture') {
    return value;
  }

  throw new HttpError(502, 'OpenAI retrieval planner returned an invalid scopeType.', value);
}

function classifyMessageIntent(message: string) {
  const normalized = message.trim().toLowerCase();

  if (/(quiz|practice questions?|mcq|multiple choice|flashcards?|test me)/i.test(normalized)) {
    return 'quiz';
  }

  if (/(summary|summari[sz]e|recap|overview|key takeaways?|latest lectures?|recent lectures?)/i.test(normalized)) {
    return 'summary';
  }

  if (normalized.includes('?') || /(what|why|how|when|where|which|who|explain|compare|define|tell me)/i.test(normalized)) {
    return 'specific';
  }

  return 'general';
}

function resolveTranscriptSearchTopK(requestedTopK: number | undefined, message: string) {
  const intent = classifyMessageIntent(message);
  const normalizedRequested =
    requestedTopK && Number.isInteger(requestedTopK)
      ? Math.min(Math.max(requestedTopK, 1), MAX_RETRIEVAL_TOP_K)
      : null;

  if (intent === 'summary') {
    return Math.max(normalizedRequested ?? SUMMARY_RETRIEVAL_TOP_K, SUMMARY_RETRIEVAL_TOP_K);
  }

  if (intent === 'quiz') {
    return Math.max(normalizedRequested ?? QUIZ_RETRIEVAL_TOP_K, QUIZ_RETRIEVAL_TOP_K);
  }

  if (intent === 'specific') {
    return Math.min(normalizedRequested ?? SPECIFIC_RETRIEVAL_TOP_K, SPECIFIC_RETRIEVAL_TOP_K);
  }

  return normalizedRequested ?? DEFAULT_RETRIEVAL_TOP_K;
}

function getOpenAiClient() {
  if (openAiClient) {
    return openAiClient;
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new HttpError(500, 'Missing OpenAI API key. Set OPENAI_API_KEY for Loki.');
  }

  openAiClient = new OpenAI({ apiKey });
  return openAiClient;
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
