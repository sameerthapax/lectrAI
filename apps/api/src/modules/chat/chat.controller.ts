import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../../lib/http-error.js';
import { waitForChatReplyJobSignal } from './chat-reply-jobs-broker.js';
import {
  createChatReplyJobForUser,
  generateChatReplyForUser,
  getAssistantMessageForAudio,
  getChatReplyJobForUser,
  getChatReplyJobResultForUser,
  getChatSessionDetailForUser,
  listChatSessionsForUser,
  listChatReplyJobEventsForUser,
  parseChatReplyRequest,
  parseChatTranscriptionRequest,
  requestTutorSpeechStream,
  transcribeChatAudioInput,
  type ChatReplyJobEventRecord,
  type ChatReplyJobRecord,
  type ChatMessageRecord,
} from './chat.service.js';

function isAbortError(error: unknown) {
  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }

  return (
    typeof DOMException !== 'undefined' &&
    error instanceof DOMException &&
    error.name === 'AbortError'
  );
}

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
      hasQuiz: result.quiz?.hasQuiz ?? false,
      quizId: result.quiz?.quizId ?? null,
      quizTitle: result.quiz?.quizTitle ?? null,
      hasFlashcards: result.flashcards?.hasFlashcards ?? false,
      flashcardSetId: result.flashcards?.flashcardSetId ?? null,
      flashcardTitle: result.flashcards?.flashcardTitle ?? null,
    });
  } catch (error) {
    next(error);
  }
}

export async function postChatReplyJob(request: Request, response: Response, next: NextFunction) {
  try {
    const userId = requireAuthUserId(request);
    const input = parseChatReplyRequest(request.body);
    const result = await createChatReplyJobForUser(userId, input);

    response.status(202).json({
      job: serializeReplyJob(result.job),
      session: result.session,
      userMessage: serializeMessage(result.userMessage),
    });
  } catch (error) {
    next(error);
  }
}

export async function getChatReplyJob(request: Request, response: Response, next: NextFunction) {
  try {
    const userId = requireAuthUserId(request);
    const jobId = request.params.jobId;

    if (!jobId) {
      response.status(400).json({ error: 'jobId is required.' });
      return;
    }

    const job = await getChatReplyJobForUser(userId, jobId);
    response.status(200).json({ job: serializeReplyJob(job) });
  } catch (error) {
    next(error);
  }
}

export async function getChatReplyJobEvents(request: Request, response: Response, next: NextFunction) {
  try {
    const userId = requireAuthUserId(request);
    const jobId = request.params.jobId;

    if (!jobId) {
      response.status(400).json({ error: 'jobId is required.' });
      return;
    }

    const afterSequenceQuery = typeof request.query.afterSequence === 'string' ? Number(request.query.afterSequence) : NaN;
    const afterSequence = Number.isFinite(afterSequenceQuery) ? afterSequenceQuery : 0;
    const events = await listChatReplyJobEventsForUser(userId, jobId, afterSequence);

    response.status(200).json({
      events: events.map(serializeReplyJobEvent),
    });
  } catch (error) {
    next(error);
  }
}

export async function getChatReplyJobResult(request: Request, response: Response, next: NextFunction) {
  try {
    const userId = requireAuthUserId(request);
    const jobId = request.params.jobId;

    if (!jobId) {
      response.status(400).json({ error: 'jobId is required.' });
      return;
    }

    const result = await getChatReplyJobResultForUser(userId, jobId);
    response.status(200).json({
      job: serializeReplyJob(result.job),
      session: result.session,
      assistantMessage: serializeMessage(result.assistantMessage),
      shouldAutoPlayAudio: result.shouldAutoPlayAudio,
      audioMessageId: result.audioMessageId,
    });
  } catch (error) {
    next(error);
  }
}

export async function getChatReplyJobStream(request: Request, response: Response, next: NextFunction) {
  try {
    const userId = requireAuthUserId(request);
    const jobId = request.params.jobId;

    if (!jobId) {
      response.status(400).json({ error: 'jobId is required.' });
      return;
    }

    const lastEventIdHeader = typeof request.headers['last-event-id'] === 'string' ? request.headers['last-event-id'] : null;
    const afterSequenceQuery = typeof request.query.afterSequence === 'string' ? Number(request.query.afterSequence) : NaN;
    let lastSequence = Number.isFinite(afterSequenceQuery)
      ? afterSequenceQuery
      : lastEventIdHeader && Number.isFinite(Number(lastEventIdHeader))
        ? Number(lastEventIdHeader)
        : 0;

    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Connection', 'keep-alive');

    if (typeof response.flushHeaders === 'function') {
      response.flushHeaders();
    }

    response.write(`event: ready\ndata: ${JSON.stringify({ jobId })}\n\n`);

    const abortController = new AbortController();
    request.on('close', () => abortController.abort());

    while (!abortController.signal.aborted) {
      const job = await getChatReplyJobForUser(userId, jobId);
      const events = await listChatReplyJobEventsForUser(userId, jobId, lastSequence);
      let sawTerminalEvent = false;

      for (const event of events) {
        lastSequence = event.sequenceNumber;
        response.write(`id: ${event.sequenceNumber}\n`);
        response.write('event: job-event\n');
        response.write(`data: ${JSON.stringify(serializeReplyJobEvent(event))}\n\n`);

        if (event.eventType === 'completed' || event.eventType === 'failed') {
          sawTerminalEvent = true;
        }
      }

      if (sawTerminalEvent || job.status === 'completed' || job.status === 'failed') {
        break;
      }

      response.write(': keep-alive\n\n');
      await waitForChatReplyJobSignal(jobId, {
        abortSignal: abortController.signal,
        timeoutMs: 15000,
      });
    }

    response.end();
  } catch (error) {
    if (isClientAbortError(error, request, response)) {
      return;
    }

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
    if (isClientAbortError(error, request, response)) {
      return;
    }

    next(error);
  }
}

export async function getLokiSpeech(request: Request, response: Response, next: NextFunction) {
  try {
    requireAuthUserId(request);
    const text = typeof request.query.text === 'string' ? request.query.text.trim() : '';

    if (!text) {
      response.status(400).json({ error: 'text is required.' });
      return;
    }

    const abortController = new AbortController();
    request.on('close', () => abortController.abort());
    const upstream = await requestTutorSpeechStream({
      text: text.slice(0, 280),
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
    if (isClientAbortError(error, request, response)) {
      return;
    }

    next(error);
  }
}

function isClientAbortError(error: unknown, request: Request, response: Response) {
  const aborted =
    request.destroyed ||
    request.aborted ||
    response.writableEnded ||
    isAbortError(error);

  return aborted;
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
    hasQuiz: message.hasQuiz,
    quizId: message.quizId,
    quizTitle: message.quizTitle,
    hasFlashcards: message.hasFlashcards,
    flashcardSetId: message.flashcardSetId,
    flashcardTitle: message.flashcardTitle,
    createdAt: message.createdAt,
    citations: message.citations,
  };
}

function serializeReplyJob(job: ChatReplyJobRecord) {
  return {
    id: job.id,
    chatSessionId: job.chatSessionId,
    userId: job.userId,
    requestMessageId: job.requestMessageId,
    finalAssistantMessageId: job.finalAssistantMessageId,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function serializeReplyJobEvent(event: ChatReplyJobEventRecord) {
  return {
    id: event.id,
    jobId: event.jobId,
    eventType: event.eventType,
    message: event.message,
    metadata: event.metadata,
    sequenceNumber: event.sequenceNumber,
    createdAt: event.createdAt,
  };
}
