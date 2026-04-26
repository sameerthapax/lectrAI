import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import {
  deleteCourse,
  getCourseFiles,
  getCourses,
  patchCourse,
  postCourse,
  postCourseFile,
} from './courses.controller.js';

const coursesRouter = Router();

coursesRouter.get('/', asyncHandler(getCourses));
coursesRouter.post('/', asyncHandler(postCourse));
coursesRouter.get('/:courseId/files', asyncHandler(getCourseFiles));
coursesRouter.post('/:courseId/files', asyncHandler(postCourseFile));
coursesRouter.put('/:courseId', asyncHandler(patchCourse));
coursesRouter.delete('/:courseId', asyncHandler(deleteCourse));

export { coursesRouter };
