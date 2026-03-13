import express from 'express';
import { errorHandler } from './middleware/error-handler.js';
import { apiRateLimit, authRateLimit } from './middleware/rate-limit.js';
import { apiRouter } from './routes';

export function createApp() {
  const app = express();

  // Cloud Run sits behind Google's proxy, so trust the first forwarded hop.
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/auth', authRateLimit);
  app.use('/api', apiRateLimit);

  app.get('/', (_req, res) => {
    res.send({ message: 'LectrAI API' });
  });

  app.use('/api', apiRouter);
  app.use(errorHandler);

  return app;
}
