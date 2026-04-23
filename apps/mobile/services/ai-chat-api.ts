import type { AudioSource } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';

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

export function buildLokiAudioSource(accessToken: string, messageId: string): AudioSource {
  return {
    uri: `${requireApiBaseUrl()}/chat/messages/${encodeURIComponent(messageId)}/audio`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    name: 'Loki response',
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
