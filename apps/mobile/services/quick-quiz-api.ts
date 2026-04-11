import { authorizedRequest } from './auth-api';

export type RemoteDailyQuickQuizOptionRecord = {
  id: string;
  optionLabel: string | null;
  optionText: string;
  isCorrect: boolean;
  optionOrder: number;
  createdAt: string | null;
};

export type RemoteDailyQuickQuizQuestionRecord = {
  id: string;
  questionOrder: number;
  questionType: string;
  questionText: string;
  explanation: string | null;
  difficulty: string | null;
  createdAt: string | null;
  options: RemoteDailyQuickQuizOptionRecord[];
};

export type RemoteDailyQuickQuizRecord = {
  id: string;
  title: string | null;
  quizType: string;
  difficulty: string;
  questionCount: number | null;
  estimatedMinutes: number | null;
  availableOn: string;
  createdAt: string;
  updatedAt: string;
  questions: RemoteDailyQuickQuizQuestionRecord[];
};

export async function fetchDailyQuickQuiz(accessToken: string) {
  const response = await authorizedRequest<{ quiz: RemoteDailyQuickQuizRecord | null }>(
    '/quizzes/daily',
    { method: 'GET' },
    accessToken
  );

  return response.quiz;
}
