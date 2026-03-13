import { Router } from 'express';

const coursesRouter = Router();

coursesRouter.get('/', (req, res) => {
  res.json({
    message: 'Courses API scaffolded',
    resource: 'courses',
    user: {
      id: req.authUser?.id ?? null,
      email: req.authUser?.email ?? null,
    },
  });
});

export { coursesRouter };
