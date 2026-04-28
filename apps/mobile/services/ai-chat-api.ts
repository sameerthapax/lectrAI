import type { AudioSource } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export type RemoteLokiSession = {
  id: string;
  title: string | null;
  courseId: string | null;
  lectureId: string | null;
  sessionType: 'lecture_chat' | 'course_chat' | 'exam_review';
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RemoteLokiCitation = {
  id: string;
  lectureId: string;
  lectureTitle: string;
  citationOrder: number;
  relevanceScore: number | null;
  citedText: string | null;
};

export type RemoteLokiResearchPaper = {
  title: string;
  url: string;
  source: string | null;
  summary: string | null;
};

export type RemoteLokiResearchAttachment = {
  hasResearch: boolean;
  topic: string | null;
  papers: RemoteLokiResearchPaper[];
};

export type RemoteLokiMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  messageText: string;
  modelName: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  retrievalMetadata: unknown;
  hasQuiz: boolean;
  quizId: string | null;
  quizTitle: string | null;
  hasFlashcards: boolean;
  flashcardSetId: string | null;
  flashcardTitle: string | null;
  createdAt: string;
  citations: RemoteLokiCitation[];
};

export type RemoteLokiSessionDetail = {
  session: RemoteLokiSession;
  messages: RemoteLokiMessage[];
};

export type RemoteLokiRetrievedChunk = {
  lectureId: string;
  lectureTitle: string;
  courseId: string;
  courseName: string;
  chunkId: string;
  chunkIndex: number;
  speaker: string | null;
  similarity: number;
  content: string;
};

export type RemoteLokiAudioPayload = {
  base64: string;
  mimeType: string;
  fileName: string;
};

export type RemoteLokiTranscription = {
  text: string;
  languageCode: string | null;
  modelName: string;
  confidenceAvg: number | null;
};

export type RemoteLokiReply = {
  session: RemoteLokiSession;
  userMessage: RemoteLokiMessage;
  assistantMessage: RemoteLokiMessage;
  retrieval: { chunks: RemoteLokiRetrievedChunk[] };
  audio: RemoteLokiAudioPayload | null;
  hasQuiz: boolean;
  quizId: string | null;
  quizTitle: string | null;
  hasFlashcards: boolean;
  flashcardSetId: string | null;
  flashcardTitle: string | null;
};

export type RemoteLokiReplyJob = {
  id: string;
  chatSessionId: string;
  userId: string;
  requestMessageId: string;
  finalAssistantMessageId: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
};

export type RemoteLokiReplyJobCreated = {
  job: RemoteLokiReplyJob;
  session: RemoteLokiSession;
  userMessage: RemoteLokiMessage;
};

type RemoteLokiReplyJobLookup = {
  job: RemoteLokiReplyJob;
};

type RemoteLokiReplyJobEventsLookup = {
  events: RemoteLokiReplyJobEvent[];
};

export type RemoteLokiReplyJobCompletedMetadata = {
  session: RemoteLokiSession;
  assistantMessage?: RemoteLokiMessage;
  hasQuiz: boolean;
  quizId: string | null;
  quizTitle: string | null;
  hasFlashcards: boolean;
  flashcardSetId: string | null;
  flashcardTitle: string | null;
  shouldAutoPlayAudio: boolean;
  audioMessageId: string | null;
};

export type RemoteLokiReplyJobResult = {
  job: RemoteLokiReplyJob;
  session: RemoteLokiSession;
  assistantMessage: RemoteLokiMessage;
  shouldAutoPlayAudio: boolean;
  audioMessageId: string | null;
};

export type RemoteLokiReplyJobEvent = {
  id: string;
  jobId: string;
  eventType:
    | 'retrieving_lecture'
    | 'research_searching'
    | 'quiz_generation_completed'
    | 'flashcards_generation_completed'
    | 'completed'
    | 'failed';
  message: string;
  metadata: unknown;
  sequenceNumber: number;
  createdAt: string;
};

type RequestOptions = {
  accessToken: string;
};

function requireApiBaseUrl() {
  if (!API_BASE_URL) {
    throw new Error('Set EXPO_PUBLIC_API_BASE_URL to enable Loki backend calls.');
  }

  return API_BASE_URL;
}

async function authorizedJsonRequest<TResponse>(
  path: string,
  init: RequestInit,
  options: RequestOptions
): Promise<TResponse> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${options.accessToken}`);

  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${requireApiBaseUrl()}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as TResponse;
}

export async function listLokiSessions(
  accessToken: string,
  filter: { courseId?: string | null; lectureId?: string | null } = {}
) {
  const searchParams = new URLSearchParams();

  if (filter.courseId) {
    searchParams.set('courseId', filter.courseId);
  }

  if (filter.lectureId) {
    searchParams.set('lectureId', filter.lectureId);
  }

  const query = searchParams.size > 0 ? `?${searchParams.toString()}` : '';
  const response = await authorizedJsonRequest<{ sessions: RemoteLokiSession[] }>(
    `/chat/sessions${query}`,
    { method: 'GET' },
    { accessToken }
  );

  return response.sessions;
}

export async function getLokiSession(accessToken: string, sessionId: string) {
  return authorizedJsonRequest<RemoteLokiSessionDetail>(
    `/chat/sessions/${encodeURIComponent(sessionId)}`,
    { method: 'GET' },
    { accessToken }
  );
}

export async function sendLokiReply(
  accessToken: string,
  input: {
    sessionId?: string | null;
    message: string;
    muteAudioResponse?: boolean;
  }
) {
  return authorizedJsonRequest<RemoteLokiReply>(
    '/chat/reply',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    { accessToken }
  );
}

export async function createLokiReplyJob(
  accessToken: string,
  input: {
    sessionId?: string | null;
    message: string;
    muteAudioResponse?: boolean;
  }
) {
  return authorizedJsonRequest<RemoteLokiReplyJobCreated>(
    '/chat/reply-jobs',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    { accessToken }
  );
}

export async function transcribeLokiAudio(
  accessToken: string,
  input: {
    audioBase64: string;
    mimeType: string;
    fileName: string;
  }
) {
  return authorizedJsonRequest<RemoteLokiTranscription>(
    '/chat/transcribe',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    { accessToken }
  );
}

export async function getLokiReplyJobResult(accessToken: string, jobId: string) {
  return authorizedJsonRequest<RemoteLokiReplyJobResult>(
    `/chat/reply-jobs/${encodeURIComponent(jobId)}/result`,
    { method: 'GET' },
    { accessToken }
  );
}

export async function getLokiReplyJobEvents(
  accessToken: string,
  jobId: string,
  afterSequence = 0
) {
  return authorizedJsonRequest<RemoteLokiReplyJobEventsLookup>(
    `/chat/reply-jobs/${encodeURIComponent(jobId)}/events?afterSequence=${afterSequence}`,
    { method: 'GET' },
    { accessToken }
  );
}

export async function streamLokiReplyJob(
  accessToken: string,
  jobId: string,
  handlers: {
    onEvent?: (event: RemoteLokiReplyJobEvent) => void;
    onOpen?: () => void;
  },
  options: {
    abortSignal?: AbortSignal;
    afterSequence?: number;
  } = {}
): Promise<RemoteLokiReplyJobCompletedMetadata> {
  if (Platform.OS !== 'web') {
    return pollLokiReplyJob(accessToken, jobId, handlers, options);
  }

  const query = options.afterSequence && options.afterSequence > 0 ? `?afterSequence=${options.afterSequence}` : '';
  const response = await fetch(`${requireApiBaseUrl()}/chat/reply-jobs/${encodeURIComponent(jobId)}/stream${query}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'text/event-stream',
    },
    signal: options.abortSignal,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  if (!response.body) {
    return pollLokiReplyJob(accessToken, jobId, handlers, options);
  }

  handlers.onOpen?.();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      const parsed = parseSseFrame(frame);

      if (!parsed.data) {
        continue;
      }

      if (parsed.eventName !== 'job-event') {
        continue;
      }

      const event = JSON.parse(parsed.data) as RemoteLokiReplyJobEvent;
      handlers.onEvent?.(event);

      if (event.eventType === 'completed') {
        return event.metadata as RemoteLokiReplyJobCompletedMetadata;
      }

      if (event.eventType === 'failed') {
        const metadata =
          event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata)
            ? (event.metadata as { error?: string })
            : null;
        throw new Error(metadata?.error ?? event.message ?? 'Loki could not complete this request.');
      }
    }
  }

  throw new Error('Loki progress stream ended before the reply finished.');
}

async function pollLokiReplyJob(
  accessToken: string,
  jobId: string,
  handlers: {
    onEvent?: (event: RemoteLokiReplyJobEvent) => void;
    onOpen?: () => void;
  },
  options: {
    abortSignal?: AbortSignal;
    afterSequence?: number;
  } = {}
): Promise<RemoteLokiReplyJobCompletedMetadata> {
  handlers.onOpen?.();
  let lastSequence = options.afterSequence ?? 0;

  while (true) {
    throwIfAborted(options.abortSignal);

    const [jobResponse, eventsResponse] = await Promise.all([
      authorizedJsonRequest<RemoteLokiReplyJobLookup>(
        `/chat/reply-jobs/${encodeURIComponent(jobId)}`,
        { method: 'GET', signal: options.abortSignal },
        { accessToken }
      ),
      authorizedJsonRequest<RemoteLokiReplyJobEventsLookup>(
        `/chat/reply-jobs/${encodeURIComponent(jobId)}/events?afterSequence=${lastSequence}`,
        { method: 'GET', signal: options.abortSignal },
        { accessToken }
      ),
    ]);

    for (const event of eventsResponse.events) {
      lastSequence = Math.max(lastSequence, event.sequenceNumber);
      handlers.onEvent?.(event);

      if (event.eventType === 'completed') {
        return event.metadata as RemoteLokiReplyJobCompletedMetadata;
      }

      if (event.eventType === 'failed') {
        const metadata =
          event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata)
            ? (event.metadata as { error?: string })
            : null;
        throw new Error(metadata?.error ?? event.message ?? 'Loki could not complete this request.');
      }
    }

    if (jobResponse.job.status === 'completed' || jobResponse.job.status === 'failed') {
      throw new Error('Loki finished processing, but the final progress event could not be recovered.');
    }

    await delay(450, options.abortSignal);
  }
}

export function buildLokiAudioSource(accessToken: string, messageId: string): AudioSource {
  return {
    uri: `${requireApiBaseUrl()}/chat/messages/${encodeURIComponent(messageId)}/audio`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    name: 'Loki response',
  };
}

export function buildLokiSpeechSource(accessToken: string, text: string): AudioSource {
  return {
    uri: `${requireApiBaseUrl()}/chat/speech?text=${encodeURIComponent(text)}`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    name: 'Loki progress',
  };
}

export async function writeLokiAudioToFile(audio: RemoteLokiAudioPayload, messageId: string) {
  const fileName = sanitizeAudioFilename(audio.fileName, messageId, audio.mimeType);
  const audioDirectory = new Directory(Paths.cache, 'loki-audio');
  audioDirectory.create({ idempotent: true, intermediates: true });
  const outputFile = new File(audioDirectory, fileName);
  outputFile.write(audio.base64, { encoding: 'base64' });
  return outputFile.uri;
}

function sanitizeAudioFilename(fileName: string, messageId: string, mimeType: string) {
  const trimmed = fileName.trim();

  if (trimmed.length > 0 && trimmed.includes('.')) {
    return trimmed.replace(/[^a-z0-9._-]/gi, '-');
  }

  const extension = mimeType.includes('mpeg') || mimeType.includes('mp3') ? 'mp3' : 'bin';
  return `loki-${messageId}.${extension}`;
}

async function readErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string; message?: string };
    return data.error ?? data.message ?? 'Request failed. Please try again.';
  } catch {
    return 'Request failed. Please try again.';
  }
}

function parseSseFrame(frame: string) {
  let eventName = 'message';
  const dataLines: string[] = [];

  for (const rawLine of frame.split('\n')) {
    const line = rawLine.replace(/\r$/, '');

    if (!line || line.startsWith(':')) {
      continue;
    }

    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim() || 'message';
      continue;
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  return {
    eventName,
    data: dataLines.length > 0 ? dataLines.join('\n') : null,
  };
}

function throwIfAborted(abortSignal?: AbortSignal) {
  if (abortSignal?.aborted) {
    throw new Error('The request was cancelled.');
  }
}

function delay(milliseconds: number, abortSignal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, milliseconds);

    const handleAbort = () => {
      cleanup();
      reject(new Error('The request was cancelled.'));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      abortSignal?.removeEventListener('abort', handleAbort);
    };

    if (abortSignal) {
      abortSignal.addEventListener('abort', handleAbort, { once: true });
    }
  });
}
