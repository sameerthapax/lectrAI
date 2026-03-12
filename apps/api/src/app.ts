import express from 'express';
import { errorHandler } from './middleware/error-handler.js';
import { apiRouter } from './routes';

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get('/', (_req, res) => {
    res.send({ message: 'LectrAI API' });
  });

  app.use('/api', apiRouter);
  app.use(errorHandler);

  return app;
}
