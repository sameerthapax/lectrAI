import type { Request, Response } from 'express';
import { getDailyQuickQuizForUser } from './quizzes.service.js';

function requireAuthUserId(request: Request) {
  const userId = request.authUser?.id;

  if (!userId) {
    throw new Error('Authenticated user id missing from request context.');
  }

  return userId;
}

export async function getDailyQuickQuiz(request: Request, response: Response) {
  const quiz = await getDailyQuickQuizForUser(requireAuthUserId(request));
  response.status(200).json({ quiz });
}
