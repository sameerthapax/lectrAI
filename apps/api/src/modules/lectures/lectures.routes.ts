import { Router } from 'express';

const lecturesRouter = Router();

lecturesRouter.get('/', (req, res) => {
  res.json({
    message: 'Lectures API scaffolded',
    resource: 'lectures',
    user: {
      id: req.authUser?.id ?? null,
      email: req.authUser?.email ?? null,
    },
  });
});

export { lecturesRouter };
