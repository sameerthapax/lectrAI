import { Router } from 'express';
import { getFlashcardSetById } from './flashcards.controller.js';

const flashcardsRouter = Router();

flashcardsRouter.get('/:flashcardSetId', getFlashcardSetById);

export { flashcardsRouter };
