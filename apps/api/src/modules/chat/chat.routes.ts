import { Router } from 'express';
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

chatRouter.get('/sessions', getChatSessions);
chatRouter.get('/sessions/:sessionId', getChatSession);
chatRouter.post('/transcribe', postChatTranscription);
chatRouter.post('/reply-jobs', postChatReplyJob);
chatRouter.get('/reply-jobs/:jobId', getChatReplyJob);
chatRouter.get('/reply-jobs/:jobId/events', getChatReplyJobEvents);
chatRouter.get('/reply-jobs/:jobId/result', getChatReplyJobResult);
chatRouter.get('/reply-jobs/:jobId/stream', getChatReplyJobStream);
chatRouter.post('/reply', postChatReply);
chatRouter.get('/messages/:messageId/audio', getAssistantMessageAudio);
chatRouter.get('/speech', getLokiSpeech);

export { chatRouter };
