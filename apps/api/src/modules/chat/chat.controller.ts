import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../../lib/http-error.js';
import {
  generateChatReplyForUser,
  getAssistantMessageForAudio,
  getChatSessionDetailForUser,
  listChatSessionsForUser,
  parseChatReplyRequest,
  parseChatTranscriptionRequest,
  requestTutorSpeechStream,
  transcribeChatAudioInput,
  type ChatMessageRecord,
} from './chat.service.js';

function requireAuthUserId(request: Request) {
  const userId = request.authUser?.id;

  if (!userId) {
    throw new HttpError(401, 'Authentication required.');
  }

  return userId;
}

export async function getChatSessions(request: Request, response: Response, next: NextFunction) {
  try {
    const userId = requireAuthUserId(request);
    const courseId = typeof request.query.courseId === 'string' ? request.query.courseId : undefined;
    const lectureId = typeof request.query.lectureId === 'string' ? request.query.lectureId : undefined;
    const sessions = await listChatSessionsForUser(userId, { courseId, lectureId });
    response.status(200).json({ sessions });
  } catch (error) {
    next(error);
  }
}

export async function getChatSession(request: Request, response: Response, next: NextFunction) {
  try {
    const sessionId = request.params.sessionId;

    if (!sessionId) {
      response.status(400).json({ error: 'sessionId is required.' });
      return;
    }

    const detail = await getChatSessionDetailForUser(requireAuthUserId(request), sessionId);
    response.status(200).json(detail);
  } catch (error) {
    next(error);
  }
}

export async function postChatReply(request: Request, response: Response, next: NextFunction) {
  try {
    const userId = requireAuthUserId(request);
    const input = parseChatReplyRequest(request.body);
    const result = await generateChatReplyForUser(userId, input);

    response.status(200).json({
      session: result.session,
      retrieval: {
        chunks: result.retrieval.chunks.map((entry) => ({
          lectureId: entry.transcript.lectureId,
          lectureTitle: entry.transcript.lectureTitle,
          courseId: entry.transcript.courseId,
          courseName: entry.transcript.courseName,
          chunkId: entry.chunk.id,
          chunkIndex: entry.chunk.chunkIndex,
          speaker: entry.chunk.speaker,
          similarity: entry.chunk.similarity,
          content: entry.chunk.content,
        })),
      },
      userMessage: serializeMessage(result.userMessage),
      assistantMessage: serializeMessage(result.assistantMessage),
      audio: result.audio,
    });
  } catch (error) {
    next(error);
  }
}

export async function postChatTranscription(request: Request, response: Response, next: NextFunction) {
  try {
    const input = parseChatTranscriptionRequest(request.body);
    const transcription = await transcribeChatAudioInput(input);

    response.status(200).json({
      text: transcription.fullText,
      languageCode: transcription.languageCode,
      modelName: transcription.modelName,
      confidenceAvg: transcription.confidenceAvg,
    });
  } catch (error) {
    next(error);
  }
}

export async function getAssistantMessageAudio(request: Request, response: Response, next: NextFunction) {
  try {
    const messageId = request.params.messageId;

    if (!messageId) {
      response.status(400).json({ error: 'messageId is required.' });
      return;
    }

    const message = await getAssistantMessageForAudio(requireAuthUserId(request), messageId);
    const abortController = new AbortController();
    request.on('close', () => abortController.abort());
    const upstream = await requestTutorSpeechStream({
      text: message.text,
      abortSignal: abortController.signal,
    });

    response.status(200);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'audio/mpeg');
    response.setHeader('Transfer-Encoding', 'chunked');

    const body = upstream.body;

    if (!body) {
      throw new HttpError(502, 'ElevenLabs audio stream ended unexpectedly.');
    }

    const reader = body.getReader();

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (value) {
        response.write(value);
      }
    }

    response.end();
  } catch (error) {
    next(error);
  }
}

function serializeMessage(message: ChatMessageRecord) {
  return {
    id: message.id,
    role: message.role,
    messageText: message.messageText,
    modelName: message.modelName,
    promptTokens: message.promptTokens,
    completionTokens: message.completionTokens,
    totalTokens: message.totalTokens,
    retrievalMetadata: message.retrievalMetadata,
    createdAt: message.createdAt,
    citations: message.citations,
  };
}
