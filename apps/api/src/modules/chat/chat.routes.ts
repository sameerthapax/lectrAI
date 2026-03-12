import { Router } from 'express';

const chatRouter = Router();

chatRouter.get('/', (req, res) => {
  res.json({
    message: 'Chat API scaffolded',
    resource: 'chat',
    user: {
      id: req.authUser?.id ?? null,
      email: req.authUser?.email ?? null,
    },
  });
});

export { chatRouter };
