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
  isRelatedToAnyCourse: boolean;
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

export type RemoteDailyQuickQuizAttemptAnswerRecord = {
  id: string;
  questionId: string;
  selectedOptionId: string | null;
  shortAnswerText: string | null;
  isCorrect: boolean | null;
  awardedPoints: number | null;
  answeredAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type RemoteDailyQuickQuizAttemptRecord = {
  id: string;
  quizId: string;
  userId: string;
  score: number | null;
  maxScore: number | null;
  percentageScore: number | null;
  timeSpentSeconds: number | null;
  isCompleted: boolean;
  startedAt: string | null;
  submittedAt: string | null;
  createdAt: string;
  answers: RemoteDailyQuickQuizAttemptAnswerRecord[];
};

export type RemoteDailyQuickQuizBundle = {
  quiz: RemoteDailyQuickQuizRecord | null;
  attempt: RemoteDailyQuickQuizAttemptRecord | null;
  availability: {
    canGenerate: boolean;
    reason: 'ready' | 'no_courses';
    message: string | null;
  };
};

export async function fetchDailyQuickQuiz(accessToken: string) {
  return authorizedRequest<RemoteDailyQuickQuizBundle>(
    '/quizzes/daily',
    { method: 'GET' },
    accessToken
  );
}

export async function generateDailyQuickQuiz(accessToken: string) {
  return authorizedRequest<RemoteDailyQuickQuizBundle>(
    '/quizzes/daily/generate',
    { method: 'POST' },
    accessToken
  );
}

export async function submitDailyQuickQuizAnswer(
  accessToken: string,
  input: {
    quizId: string;
    questionId: string;
    selectedOptionId: string;
    timeSpentSeconds?: number | null;
    isCompleted?: boolean;
  }
) {
  return authorizedRequest<RemoteDailyQuickQuizBundle>(
    '/quizzes/daily/answers',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    accessToken
  );
}

export async function submitDailyQuickQuizAttempt(
  accessToken: string,
  input: {
    quizId: string;
    answers: Array<{
      questionId: string;
      selectedOptionId: string;
    }>;
    timeSpentSeconds?: number | null;
  }
) {
  return authorizedRequest<RemoteDailyQuickQuizBundle>(
    '/quizzes/daily/attempt',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    accessToken
  );
}
