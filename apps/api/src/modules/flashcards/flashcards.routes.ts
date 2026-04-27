import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { getFlashcardSetById } from './flashcards.controller.js';

const flashcardsRouter = Router();

flashcardsRouter.get('/:flashcardSetId', asyncHandler(getFlashcardSetById));

export { flashcardsRouter };
