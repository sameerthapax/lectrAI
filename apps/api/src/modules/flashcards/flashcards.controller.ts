import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../../lib/http-error.js';
import { getStoredFlashcardSetBundleForUser } from './flashcards.service.js';

function requireAuthUserId(request: Request) {
  const userId = request.authUser?.id;

  if (!userId) {
    throw new HttpError(401, 'Authentication required.');
  }

  return userId;
}

export async function getFlashcardSetById(request: Request, response: Response, next: NextFunction) {
  try {
    const flashcardSetId = request.params.flashcardSetId;

    if (!flashcardSetId) {
      throw new HttpError(400, 'flashcardSetId is required.');
    }

    const result = await getStoredFlashcardSetBundleForUser(requireAuthUserId(request), flashcardSetId);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
