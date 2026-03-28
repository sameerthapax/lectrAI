import { Router } from 'express';
import { deleteCourse, getCourses, patchCourse, postCourse } from './courses.controller.js';

const coursesRouter = Router();

coursesRouter.get('/', getCourses);
coursesRouter.post('/', postCourse);
coursesRouter.put('/:courseId', patchCourse);
coursesRouter.delete('/:courseId', deleteCourse);

export { coursesRouter };
