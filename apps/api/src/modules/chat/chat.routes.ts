import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import {
  getAssistantMessageAudio,
  getChatReplyJob,
  getChatReplyJobEvents,
  getChatReplyJobResult,
  getChatReplyJobStream,
  getLokiSpeech,
  getChatSession,
  getChatSessions,
  postChatReplyJob,
  postChatReply,
  postChatTranscription,
} from './chat.controller.js';

const chatRouter = Router();

chatRouter.get('/sessions', asyncHandler(getChatSessions));
chatRouter.get('/sessions/:sessionId', asyncHandler(getChatSession));
chatRouter.post('/transcribe', asyncHandler(postChatTranscription));
chatRouter.post('/reply-jobs', asyncHandler(postChatReplyJob));
chatRouter.get('/reply-jobs/:jobId', asyncHandler(getChatReplyJob));
chatRouter.get('/reply-jobs/:jobId/events', asyncHandler(getChatReplyJobEvents));
chatRouter.get('/reply-jobs/:jobId/result', asyncHandler(getChatReplyJobResult));
chatRouter.get('/reply-jobs/:jobId/stream', asyncHandler(getChatReplyJobStream));
chatRouter.post('/reply', asyncHandler(postChatReply));
chatRouter.get('/messages/:messageId/audio', asyncHandler(getAssistantMessageAudio));
chatRouter.get('/speech', asyncHandler(getLokiSpeech));

export { chatRouter };
