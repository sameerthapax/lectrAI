import type { NextFunction, Request, Response } from 'express';
import {
  generateDailyQuickQuizResponseForUser,
  getDailyQuickQuizResponseForUser,
  submitDailyQuickQuizAttemptForUser,
  upsertDailyQuickQuizAnswerForUser,
} from './quizzes.service.js';
import { HttpError } from '../../lib/http-error.js';

function requireAuthUserId(request: Request) {
  const userId = request.authUser?.id;

  if (!userId) {
    throw new Error('Authenticated user id missing from request context.');
  }

  return userId;
}

export async function getDailyQuickQuiz(request: Request, response: Response, next: NextFunction) {
  try {
    const result = await getDailyQuickQuizResponseForUser(requireAuthUserId(request));
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function postGenerateDailyQuickQuiz(request: Request, response: Response, next: NextFunction) {
  try {
    const result = await generateDailyQuickQuizResponseForUser(requireAuthUserId(request));
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function postDailyQuickQuizAnswer(request: Request, response: Response, next: NextFunction) {
  try {
    const body = readAnswerInput(request.body);
    const result = await upsertDailyQuickQuizAnswerForUser(requireAuthUserId(request), body);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function postDailyQuickQuizAttempt(request: Request, response: Response, next: NextFunction) {
  try {
    const body = readAttemptInput(request.body);
    const result = await submitDailyQuickQuizAttemptForUser(requireAuthUserId(request), body);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

function readAnswerInput(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    throw new HttpError(400, 'Request body must be an object.');
  }

  const record = payload as Record<string, unknown>;
  const quizId = readRequiredUuid(record.quizId, 'quizId');
  const questionId = readRequiredUuid(record.questionId, 'questionId');
  const selectedOptionId = readRequiredUuid(record.selectedOptionId, 'selectedOptionId');
  const timeSpentSeconds =
    record.timeSpentSeconds == null ? null : readNonNegativeInteger(record.timeSpentSeconds, 'timeSpentSeconds');
  const isCompleted = typeof record.isCompleted === 'boolean' ? record.isCompleted : false;

  return {
    quizId,
    questionId,
    selectedOptionId,
    timeSpentSeconds,
    isCompleted,
  };
}

function readAttemptInput(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    throw new HttpError(400, 'Request body must be an object.');
  }

  const record = payload as Record<string, unknown>;
  const quizId = readRequiredUuid(record.quizId, 'quizId');
  const timeSpentSeconds =
    record.timeSpentSeconds == null ? null : readNonNegativeInteger(record.timeSpentSeconds, 'timeSpentSeconds');

  if (!Array.isArray(record.answers) || record.answers.length === 0) {
    throw new HttpError(400, 'answers must be a non-empty array.');
  }

  const answers = record.answers.map((value, index) => {
    if (!value || typeof value !== 'object') {
      throw new HttpError(400, `answers[${index}] must be an object.`);
    }

    const answer = value as Record<string, unknown>;
    return {
      questionId: readRequiredUuid(answer.questionId, `answers[${index}].questionId`),
      selectedOptionId: readRequiredUuid(answer.selectedOptionId, `answers[${index}].selectedOptionId`),
    };
  });

  return {
    quizId,
    answers,
    timeSpentSeconds,
  };
}

function readRequiredUuid(value: unknown, fieldName: string) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new HttpError(400, `${fieldName} must be a valid UUID.`);
  }

  return value;
}

function readNonNegativeInteger(value: unknown, fieldName: string) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new HttpError(400, `${fieldName} must be a non-negative integer.`);
  }

  return value;
}
