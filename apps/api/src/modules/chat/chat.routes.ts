import { Router } from 'express';
import {
  getAssistantMessageAudio,
  getChatSession,
  getChatSessions,
  postChatReply,
} from './chat.controller.js';

const chatRouter = Router();

chatRouter.get('/sessions', getChatSessions);
chatRouter.get('/sessions/:sessionId', getChatSession);
chatRouter.post('/reply', postChatReply);
chatRouter.get('/messages/:messageId/audio', getAssistantMessageAudio);

export { chatRouter };
