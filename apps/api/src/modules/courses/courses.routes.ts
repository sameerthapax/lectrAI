import { Router } from 'express';
import {
  deleteCourse,
  getCourseFiles,
  getCourses,
  patchCourse,
  postCourse,
  postCourseFile,
} from './courses.controller.js';

const coursesRouter = Router();

coursesRouter.get('/', getCourses);
coursesRouter.post('/', postCourse);
coursesRouter.get('/:courseId/files', getCourseFiles);
coursesRouter.post('/:courseId/files', postCourseFile);
coursesRouter.put('/:courseId', patchCourse);
coursesRouter.delete('/:courseId', deleteCourse);

export { coursesRouter };
